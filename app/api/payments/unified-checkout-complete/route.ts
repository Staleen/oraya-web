import crypto from "crypto";
import { NextResponse } from "next/server";
import { verifyViewToken } from "@/lib/booking-action-token";
import { roundMoney } from "@/lib/money";
import {
  authorizeCreditLibanaisTransientToken,
  getCreditLibanaisReadiness,
} from "@/lib/payments/credit-libanais";
import { supabasePaymentAttemptStore } from "@/lib/payments/payment-attempts-store";
import { runUnifiedCheckoutCompletion } from "@/lib/payments/unified-checkout-completion";
import { isPaymentLinkExpired } from "@/lib/payments/link-state";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import { computeFoundationAmountDue, derivePaymentFoundationStage, getFoundationAmountTotal } from "@/lib/payment-foundation";
import { getChargeAmount } from "@/lib/payments/charge-amount";
import { notifyMoneyEvent } from "@/lib/payments/money-event-dispatch-server";
import { maybeInstantConfirmBooking } from "@/lib/bookings/instant-confirm-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type UnifiedCheckoutCompletionBookingRow = {
  id: string;
  status: string;
  guest_name: string | null;
  guest_email: string | null;
  payment_status: string | null;
  payment_link_status: string | null;
  payment_link_provider: string | null;
  payment_link_expires_at: string | null;
  payment_provider_session_id: string | null;
  amount_paid: number | null;
  amount_total: number | null;
  amount_due: number | null;
  deposit_amount: number | null;
  event_type: string | null;
  message: string | null;
  proposal_total_amount: number | null;
  proposal_deposit_amount: number | null;
  pricing_subtotal: number | null;
  pricing_snapshot: {
    adjusted_stay_subtotal?: number | null;
    subtotal?: number | null;
    estimated_total?: number | null;
    internal_intelligence?: {
      stay_value?: number | null;
      addons_value?: number | null;
      estimated_total?: number | null;
      internal_value?: number | null;
    } | null;
  } | null;
  addons_snapshot: Array<{ price?: number | null }> | null;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readTransientToken(body: Record<string, unknown>) {
  const direct = readString(body.transient_token);
  if (direct) return direct;

  const result = body.unified_checkout_result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const token = readString((result as Record<string, unknown>).transientTokenJwt);
    if (token) return token;
  }

  return "";
}

function bookingViewUrl(request: Request, token: string) {
  const baseUrl = resolvePaymentRequestOrigin(request);
  return `${baseUrl}/booking/view/${token}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = readString(body.booking_token);
    const transientToken = readTransientToken(body);

    if (!token) {
      return NextResponse.json({ error: "booking_token is required." }, { status: 400 });
    }
    if (!transientToken) {
      return NextResponse.json({ error: "transient_token is required." }, { status: 400 });
    }

    const verified = verifyViewToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: "Invalid booking token." }, { status: 401 });
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, status, guest_name, guest_email, payment_status, payment_link_status, payment_link_provider, payment_link_expires_at, payment_provider_session_id, amount_paid, amount_total, amount_due, deposit_amount, event_type, message, proposal_total_amount, proposal_deposit_amount, pricing_subtotal, pricing_snapshot, addons_snapshot")
      .eq("id", verified.booking_id)
      .single<UnifiedCheckoutCompletionBookingRow>();

    if (error || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const viewUrl = bookingViewUrl(request, token);
    if (booking.payment_link_status === "paid" || booking.payment_status === "deposit_paid" || booking.payment_status === "paid_in_full") {
      return NextResponse.json({ ok: true, paid: true, idempotent: true, booking_view_url: `${viewUrl}?payment=success` });
    }
    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "Cancelled bookings cannot be paid." }, { status: 400 });
    }
    if (booking.payment_link_provider !== "credit_libanais") {
      return NextResponse.json({ error: "This booking is not configured for NetCommerce checkout." }, { status: 400 });
    }
    if (booking.payment_link_status !== "active") {
      return NextResponse.json({ error: "No active payment link is available for this booking." }, { status: 400 });
    }
    if (isPaymentLinkExpired(booking.payment_link_expires_at)) {
      return NextResponse.json({ error: "This payment link has expired." }, { status: 400 });
    }
    if (!booking.payment_provider_session_id || !booking.payment_provider_session_id.startsWith("oraya_")) {
      return NextResponse.json({ error: "Payment session is not ready yet. Please refresh and try again." }, { status: 400 });
    }

    const readiness = await getCreditLibanaisReadiness();
    if (!readiness.checkout_ready) {
      throw new PaymentProviderConfigurationError(readiness.admin_message);
    }

    const chargeAmount = getChargeAmount(booking);
    if (chargeAmount <= 0) {
      return NextResponse.json({ error: "Booking payment amount is unavailable." }, { status: 400 });
    }

    // Plan 3 Phase 3 (KNOWN_BUGS #14): a durable attempt row is claimed
    // atomically BEFORE the provider is called (one in-flight attempt per
    // booking), a deterministic merchant reference ties this attempt to
    // exactly one provider operation, and every conditional booking update is
    // row-count verified. Missing payment_attempts table ⇒ fail closed (503).
    const providerSessionId = booking.payment_provider_session_id;
    const outcome = await runUnifiedCheckoutCompletion(
      {
        store: supabasePaymentAttemptStore,
        authorize: (merchantReference) =>
          authorizeCreditLibanaisTransientToken({
            booking_id: booking.id,
            provider_session_id: providerSessionId,
            transient_token: transientToken,
            amount_due: chargeAmount,
            currency: "USD",
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            merchant_reference: merchantReference,
          }),
        recordApprovedPayment: async (payment) => {
          const nowIso = new Date().toISOString();
          const amountTotal = roundMoney(
            typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
              ? booking.amount_total
              : getFoundationAmountTotal(booking) ?? chargeAmount,
          );
          const existingAmountPaid =
            typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
              ? roundMoney(booking.amount_paid)
              : 0;
          const nextAmountPaid = roundMoney(existingAmountPaid + chargeAmount);
          const nextStatus = amountTotal > 0 && nextAmountPaid >= amountTotal ? "paid_in_full" : "deposit_paid";

          const { data: updatedRows, error: updateError } = await supabaseAdmin
            .from("bookings")
            .update({
              payment_status: nextStatus,
              payment_stage: derivePaymentFoundationStage(nextAmountPaid, amountTotal),
              payment_method: "card_manual",
              amount_total: amountTotal,
              amount_paid: nextAmountPaid,
              amount_due: computeFoundationAmountDue(amountTotal, nextAmountPaid),
              payment_received_at: nowIso,
              payment_reference: payment.reference,
              payment_link_status: "paid",
              payment_last_at: nowIso,
            })
            .eq("id", booking.id)
            .eq("payment_link_status", "active")
            .eq("payment_provider_session_id", providerSessionId)
            .select("id");

          if (updateError) {
            console.error("[api/payments/unified-checkout-complete] approved payment update failed:", updateError);
            return { ok: false as const };
          }
          return { ok: true as const, matched: updatedRows?.length ?? 0 };
        },
        touchDeclined: async () => {
          const { error: updateError } = await supabaseAdmin
            .from("bookings")
            .update({ payment_last_at: new Date().toISOString() })
            .eq("id", booking.id)
            .eq("payment_link_status", "active")
            .eq("payment_provider_session_id", providerSessionId);
          if (updateError) {
            console.error("[api/payments/unified-checkout-complete] failed payment update failed:", updateError);
          }
        },
        log: (message, detail) => {
          console.error(`[api/payments/unified-checkout-complete] ${message}`, detail ?? {});
        },
      },
      {
        attempt_id: crypto.randomUUID(),
        booking_id: booking.id,
        provider_session_id: providerSessionId,
        amount: chargeAmount,
        currency: "USD",
      },
    );

    switch (outcome.kind) {
      case "store_unavailable":
        return NextResponse.json(
          { error: "Secure payment is temporarily unavailable. Please try again shortly or contact Oraya." },
          { status: 503 },
        );
      case "store_error":
        return NextResponse.json(
          { error: "Payment could not be started safely. No charge was made. Please try again." },
          { status: 500 },
        );
      case "already_processing":
        return NextResponse.json(
          { error: "This payment is already being processed. Please wait a moment before trying again." },
          { status: 409 },
        );
      case "blocked_ambiguous":
        return NextResponse.json(
          {
            error:
              "A previous payment attempt needs manual review. Do NOT retry or pay again; please contact Oraya.",
          },
          { status: 409 },
        );
      case "declined":
        return NextResponse.json(
          {
            ok: false,
            paid: false,
            status: outcome.provider.status,
            message: "Payment was not approved. No booking payment was recorded. Please try again or contact Oraya.",
            booking_view_url: `${viewUrl}?payment=failed`,
          },
          { status: outcome.provider.ok ? 402 : 502 },
        );
      case "provider_unknown":
        return NextResponse.json(
          {
            ok: false,
            paid: false,
            error: "payment_outcome_unknown",
            message:
              "We could not confirm the payment outcome with the gateway. Do NOT retry — Oraya will verify whether the charge went through and contact you.",
          },
          { status: 502 },
        );
      case "approved_unrecorded":
        return NextResponse.json(
          {
            ok: false,
            paid: false,
            error: "reconciliation_required",
            message:
              "Your payment was received, but the booking could not be updated automatically. Please do NOT retry or pay again — Oraya will reconcile this manually and confirm your booking.",
          },
          { status: 500 },
        );
      case "already_recorded":
      case "approved_recorded": {
        // M2: this path used to send the guest NOTHING after a card payment.
        // At-most-once per payment identity, so the webhook observing the same
        // money produces no second receipt. Never fails the payment.
        await notifyMoneyEvent({
          outcome: "recorded",
          source: "booking_link",
          amount: chargeAmount,
          currency: "USD",
          method: "card",
          booking_id: booking.id,
          provider_transaction_id: outcome.provider?.reference ?? null,
        });
        // Instant booking: a fully paid, add-on-free stay may confirm itself.
        // Off by default; re-checks availability and never throws.
        await maybeInstantConfirmBooking(booking.id);
        return NextResponse.json({
          ok: true,
          paid: true,
          ...(outcome.kind === "already_recorded" ? { idempotent: true } : {}),
          status: outcome.provider?.status,
          reference: outcome.provider?.reference,
          booking_view_url: `${viewUrl}?payment=success`,
        });
      }
    }
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      console.error("[api/payments/unified-checkout-complete] configuration error:", error.message);
      return NextResponse.json(
        { error: "Payment could not be verified. No booking payment was recorded." },
        { status: error.statusCode },
      );
    }
    console.error("[api/payments/unified-checkout-complete] unexpected error:", error);
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 500 });
  }
}
