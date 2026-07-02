import { NextResponse } from "next/server";
import { createActionToken, verifyViewToken } from "@/lib/booking-action-token";
import { roundMoney } from "@/lib/money";
import { getMinimumDepositAmount, validatePaymentSelection } from "@/lib/payments/checkout-amount";
import type { PaymentRequestPurpose } from "@/lib/payments/domain";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import { getConfiguredHostedCheckoutProvider } from "@/lib/payments/runtime";
import {
  PAYMENT_PUBLIC_SETTINGS_KEY,
  parsePaymentPublicSettings,
  paymentModeAllowsPayNow,
} from "@/lib/payments/settings";
import { derivePaymentFoundationStage, getFoundationAmountTotal } from "@/lib/payment-foundation";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CheckoutBookingRow = {
  id: string;
  villa: string;
  check_in: string;
  check_out: string;
  status: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  payment_status: string | null;
  payment_link_status: string | null;
  payment_link_provider: string | null;
  payment_link_url: string | null;
  payment_link_expires_at: string | null;
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

function readPaymentPurpose(value: unknown): PaymentRequestPurpose | null {
  return value === "deposit" || value === "full" || value === "balance" ? value : null;
}

function readRequestedAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundMoney(parsed) : null;
  }
  return null;
}

function checkOutExpiryUnix(checkOut: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkOut);
  if (!match) {
    throw new Error("Booking check-out date is invalid.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day, 23, 59, 59) / 1000);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const bookingId = typeof body.booking_id === "string" ? body.booking_id.trim() : "";
    const bookingToken = typeof body.booking_token === "string" ? body.booking_token.trim() : "";
    const purpose = readPaymentPurpose(body.payment_purpose);
    const requestedAmount = readRequestedAmount(body.amount);

    if (!bookingId) {
      return NextResponse.json({ error: "booking_id is required." }, { status: 400 });
    }
    if (!bookingToken) {
      return NextResponse.json({ error: "booking_token is required." }, { status: 400 });
    }
    if (!purpose) {
      return NextResponse.json({ error: "Invalid payment purpose." }, { status: 400 });
    }
    if (purpose === "balance") {
      return NextResponse.json({ error: "Balance payment is not available yet." }, { status: 400 });
    }

    const verifiedViewToken = verifyViewToken(bookingToken);
    if (!verifiedViewToken.ok || verifiedViewToken.booking_id !== bookingId) {
      return NextResponse.json({ error: "Invalid booking token." }, { status: 401 });
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, villa, check_in, check_out, status, member_id, guest_name, guest_email, payment_status, payment_link_status, payment_link_provider, payment_link_url, payment_link_expires_at, amount_paid, amount_total, amount_due, deposit_amount, event_type, message, proposal_total_amount, proposal_deposit_amount, pricing_subtotal, pricing_snapshot, addons_snapshot")
      .eq("id", bookingId)
      .single<CheckoutBookingRow>();

    if (error || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "Cancelled bookings cannot be paid." }, { status: 400 });
    }
    if (booking.payment_status === "deposit_paid" || booking.payment_status === "paid_in_full") {
      return NextResponse.json({ error: "This booking already has a recorded payment." }, { status: 400 });
    }

    const { data: paymentSettingsRow } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", PAYMENT_PUBLIC_SETTINGS_KEY)
      .maybeSingle<{ value: unknown }>();

    const paymentSettings = parsePaymentPublicSettings(paymentSettingsRow?.value ?? null);

    if (!paymentSettings.online_payment_enabled || !paymentModeAllowsPayNow(paymentSettings.active_payment_mode)) {
      return NextResponse.json(
        { error: "Online payment is not available for this booking right now." },
        { status: 400 },
      );
    }

    if (purpose === "full" && !paymentSettings.allow_full_payment) {
      return NextResponse.json(
        { error: "Full payment is not available for this booking right now." },
        { status: 400 },
      );
    }

    if (purpose === "deposit" && !paymentSettings.allow_custom_deposit) {
      return NextResponse.json(
        { error: "Deposit payment is not available for this booking right now." },
        { status: 400 },
      );
    }

    const amountTotal = roundMoney(
      typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
        ? booking.amount_total
        : getFoundationAmountTotal(booking) ?? 0,
    );
    if (amountTotal <= 0) {
      return NextResponse.json({ error: "Booking total is unavailable for payment." }, { status: 400 });
    }

    const selection = validatePaymentSelection({
      purpose,
      requestedAmount,
      amountTotal,
      minimumDepositPercentage: paymentSettings.deposit_minimum_percentage,
    });

    if (!selection.ok) {
      return NextResponse.json({ error: selection.error }, { status: 400 });
    }

    const baseUrl = resolvePaymentRequestOrigin(request);
    const { token: viewToken } = createActionToken(booking.id, "view", {
      expiresAt: checkOutExpiryUnix(booking.check_out),
    });
    const paymentDueAt = new Date(checkOutExpiryUnix(booking.check_out) * 1000).toISOString();
    const paymentPageUrl = `${baseUrl}/payments/checkout/${viewToken}`;
    const successUrl = `${baseUrl}/booking/view/${viewToken}?payment=success`;
    const cancelUrl = `${baseUrl}/booking/view/${viewToken}?payment=cancelled`;

    const hostedCheckoutProvider = getConfiguredHostedCheckoutProvider();
    if (!hostedCheckoutProvider.persisted_link_provider) {
      throw new PaymentProviderConfigurationError(
        `${hostedCheckoutProvider.display_name} is configured as the hosted payment provider, but the current bookings.payment_link_provider allow-list cannot persist it yet. Approve the bank-provider schema compatibility step before enabling live Credit Libanais checkout.`,
      );
    }

    const checkout = await hostedCheckoutProvider.createCheckoutSession({
      booking_id: booking.id,
      amount_due: selection.chargeAmount,
      currency: "USD",
      purpose,
      return_url: successUrl,
      cancel_url: cancelUrl,
      payment_page_url: paymentPageUrl,
      expires_at: paymentDueAt,
    });

    const nowIso = new Date().toISOString();
    const currentAmountPaid =
      typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
        ? roundMoney(booking.amount_paid)
        : 0;

    const updatePayload: Record<string, unknown> = {
      amount_total: amountTotal,
      amount_due: roundMoney(Math.max(0, amountTotal - currentAmountPaid)),
      deposit_amount: selection.depositAmount,
      payment_status: "payment_requested",
      payment_stage: derivePaymentFoundationStage(currentAmountPaid, amountTotal),
      payment_method: "card_manual",
      payment_due_at: checkout.expires_at,
      payment_last_at: nowIso,
      payment_reference: null,
      payment_link_url: checkout.payment_link_url,
      payment_link_provider: hostedCheckoutProvider.persisted_link_provider,
      payment_link_status: "active",
      payment_link_issued_at: nowIso,
      payment_link_expires_at: checkout.expires_at,
      payment_provider_session_id: checkout.provider_session_id,
    };
    if (booking.payment_status !== "payment_requested") {
      updatePayload.payment_requested_at = nowIso;
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updatePayload)
      .eq("id", booking.id);

    if (updateError) {
      console.error("[api/payments/checkout] booking update failed:", updateError);
      return NextResponse.json({ error: "Checkout session was created but booking payment state could not be saved." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      checkout_url: checkout.payment_link_url,
      booking_view_url: `${baseUrl}/booking/view/${viewToken}`,
      payment_summary: {
        purpose,
        charge_amount: selection.chargeAmount,
        amount_total: amountTotal,
        minimum_deposit: getMinimumDepositAmount(
          amountTotal,
          paymentSettings.deposit_minimum_percentage,
        ),
        remaining_balance: selection.remainingBalance,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment checkout could not be created.";
    const status =
      err instanceof PaymentProviderConfigurationError || message.includes("STRIPE_SECRET_KEY")
        ? 503
        : 500;
    console.error("[api/payments/checkout] unexpected error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
