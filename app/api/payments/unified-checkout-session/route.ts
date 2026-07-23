import { NextResponse } from "next/server";
import { verifyViewToken } from "@/lib/booking-action-token";
import { roundMoney } from "@/lib/money";
import { createCreditLibanaisUnifiedCheckoutSession } from "@/lib/payments/credit-libanais";
import { isPaymentLinkExpired } from "@/lib/payments/link-state";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import { getHostedCheckoutProviderByKey } from "@/lib/payments/runtime";
import { getChargeAmount } from "@/lib/payments/charge-amount";
import { supabaseAdmin } from "@/lib/supabase-admin";

type UnifiedCheckoutBookingRow = {
  id: string;
  villa: string;
  check_in: string;
  check_out: string;
  status: string;
  guest_name: string | null;
  guest_email: string | null;
  payment_status: string | null;
  payment_link_status: string | null;
  payment_link_provider: string | null;
  payment_link_url: string | null;
  payment_link_expires_at: string | null;
  amount_total: number | null;
  amount_due: number | null;
  deposit_amount: number | null;
};

function readToken(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getPaymentPurpose(booking: UnifiedCheckoutBookingRow) {
  const chargeAmount = getChargeAmount(booking);
  const amountTotal =
    typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
      ? roundMoney(booking.amount_total)
      : chargeAmount;
  return chargeAmount < amountTotal ? "deposit" : "full";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = readToken(body.booking_token);
    if (!token) {
      return NextResponse.json({ error: "booking_token is required." }, { status: 400 });
    }

    const verified = verifyViewToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: "Invalid booking token." }, { status: 401 });
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, villa, check_in, check_out, status, guest_name, guest_email, payment_status, payment_link_status, payment_link_provider, payment_link_url, payment_link_expires_at, amount_total, amount_due, deposit_amount")
      .eq("id", verified.booking_id)
      .single<UnifiedCheckoutBookingRow>();

    if (error || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "Cancelled bookings cannot be paid." }, { status: 400 });
    }
    if (booking.payment_status === "deposit_paid" || booking.payment_status === "paid_in_full") {
      return NextResponse.json({ error: "This booking already has a recorded payment." }, { status: 400 });
    }
    if (booking.payment_link_provider !== "credit_libanais") {
      return NextResponse.json({ error: "This booking is not configured for NetCommerce checkout." }, { status: 400 });
    }
    if (booking.payment_link_status !== "active" || !booking.payment_link_url) {
      return NextResponse.json({ error: "No active payment link is available for this booking." }, { status: 400 });
    }
    if (isPaymentLinkExpired(booking.payment_link_expires_at)) {
      return NextResponse.json({ error: "This payment link has expired." }, { status: 400 });
    }

    const provider = getHostedCheckoutProviderByKey("credit_libanais");
    const readiness = provider?.getReadiness();
    if (!provider || !readiness?.checkout_ready) {
      throw new PaymentProviderConfigurationError(
        readiness?.admin_message ??
          "Credit Libanais / NetCommerce checkout is not ready for server-verified payment.",
      );
    }

    const baseUrl = resolvePaymentRequestOrigin(request);
    const successUrl = `${baseUrl}/booking/view/${token}?payment=success`;
    const cancelUrl = `${baseUrl}/booking/view/${token}?payment=cancelled`;
    const chargeAmount = getChargeAmount(booking);
    if (chargeAmount <= 0) {
      return NextResponse.json({ error: "Booking payment amount is unavailable." }, { status: 400 });
    }

    const session = await createCreditLibanaisUnifiedCheckoutSession({
      booking_id: booking.id,
      amount_due: chargeAmount,
      currency: "USD",
      purpose: getPaymentPurpose(booking),
      return_url: successUrl,
      cancel_url: cancelUrl,
      payment_page_url: booking.payment_link_url,
      expires_at: booking.payment_link_expires_at ?? undefined,
    });

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_provider_session_id: session.provider_session_id,
        payment_last_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("payment_link_status", "active");

    if (updateError) {
      console.error("[api/payments/unified-checkout-session] booking update failed:", updateError);
      return NextResponse.json({ error: "Payment session could not be saved." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      capture_context: session.capture_context,
      client_library: session.client_library,
      client_library_integrity: session.client_library_integrity,
      return_url: successUrl,
      cancel_url: cancelUrl,
      booking_view_url: `${baseUrl}/booking/view/${token}`,
      booking_summary: {
        villa: booking.villa,
        check_in: booking.check_in,
        check_out: booking.check_out,
        guest_name: booking.guest_name,
        guest_email: booking.guest_email,
        amount: chargeAmount,
        currency: "USD",
      },
    });
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      console.error("[api/payments/unified-checkout-session] configuration error:", error.message);
      return NextResponse.json(
        { error: "Secure payment is not available for this booking right now." },
        { status: error.statusCode },
      );
    }
    console.error("[api/payments/unified-checkout-session] unexpected error:", error);
    return NextResponse.json({ error: "Payment session could not be created." }, { status: 500 });
  }
}
