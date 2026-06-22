import { NextResponse } from "next/server";
import { verifyViewToken } from "@/lib/booking-action-token";
import { roundMoney } from "@/lib/money";
import {
  authorizeCreditLibanaisTransientToken,
  getCreditLibanaisReadiness,
} from "@/lib/payments/credit-libanais";
import { isPaymentLinkExpired } from "@/lib/payments/link-state";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import {
  parseNetCommerceQaMode,
  shouldConfirmBookingAfterNetCommerceQaPayment,
} from "@/lib/payments/netcommerce-qa-mode";
import { computeFoundationAmountDue, derivePaymentFoundationStage, getFoundationAmountTotal } from "@/lib/payment-foundation";
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

function getChargeAmount(booking: UnifiedCheckoutCompletionBookingRow) {
  const depositAmount =
    typeof booking.deposit_amount === "number" && Number.isFinite(booking.deposit_amount)
      ? roundMoney(booking.deposit_amount)
      : 0;
  const amountDue =
    typeof booking.amount_due === "number" && Number.isFinite(booking.amount_due)
      ? roundMoney(booking.amount_due)
      : 0;
  const amountTotal =
    typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
      ? roundMoney(booking.amount_total)
      : 0;
  return depositAmount > 0 ? depositAmount : amountDue > 0 ? amountDue : amountTotal;
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
    const netCommerceQaModeEnabled = parseNetCommerceQaMode(process.env.NETCOMMERCE_QA_MODE);

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

    const readiness = getCreditLibanaisReadiness();
    if (!readiness.checkout_ready) {
      throw new PaymentProviderConfigurationError(readiness.admin_message);
    }

    const chargeAmount = getChargeAmount(booking);
    if (chargeAmount <= 0) {
      return NextResponse.json({ error: "Booking payment amount is unavailable." }, { status: 400 });
    }

    const payment = await authorizeCreditLibanaisTransientToken({
      booking_id: booking.id,
      provider_session_id: booking.payment_provider_session_id,
      transient_token: transientToken,
      amount_due: chargeAmount,
      currency: "USD",
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
    });

    const nowIso = new Date().toISOString();
    if (!payment.approved) {
      const { error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({
          payment_last_at: nowIso,
        })
        .eq("id", booking.id)
        .eq("payment_link_status", "active")
        .eq("payment_provider_session_id", booking.payment_provider_session_id);

      if (updateError) {
        console.error("[api/payments/unified-checkout-complete] failed payment update failed:", updateError);
      }

      return NextResponse.json(
        {
          ok: false,
          paid: false,
          status: payment.status,
          message: payment.message || "Payment was not approved. No booking payment was recorded.",
          booking_view_url: `${viewUrl}?payment=failed`,
        },
        { status: payment.ok ? 402 : 502 },
      );
    }

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

    const paymentUpdatePayload: Record<string, unknown> = {
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
    };

    if (
      shouldConfirmBookingAfterNetCommerceQaPayment({
        qaModeEnabled: netCommerceQaModeEnabled,
        paymentApproved: payment.approved,
        bookingStatus: booking.status,
      })
    ) {
      paymentUpdatePayload.status = "confirmed";
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(paymentUpdatePayload)
      .eq("id", booking.id)
      .eq("payment_link_status", "active")
      .eq("payment_provider_session_id", booking.payment_provider_session_id);

    if (updateError) {
      console.error("[api/payments/unified-checkout-complete] approved payment update failed:", updateError);
      return NextResponse.json({ error: "Payment was approved, but booking payment state could not be saved." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      paid: true,
      status: payment.status,
      reference: payment.reference,
      booking_view_url: `${viewUrl}?payment=success`,
    });
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[api/payments/unified-checkout-complete] unexpected error:", error);
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 500 });
  }
}
