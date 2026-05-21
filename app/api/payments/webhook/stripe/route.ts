import { NextResponse } from "next/server";
import { roundMoney } from "@/lib/money";
import { computeFoundationAmountDue, derivePaymentFoundationStage, getFoundationAmountTotal } from "@/lib/payment-foundation";
import { stripePaymentProvider } from "@/lib/payments/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

type WebhookBookingRow = {
  id: string;
  payment_status: string | null;
  payment_stage: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_link_status: string | null;
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

function lowerCaseHeaders(request: Request) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await stripePaymentProvider.verifyWebhook({
    rawBody,
    headers: lowerCaseHeaders(request),
  });

  if (!verification.ok) {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const event = verification.event;
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, payment_status, payment_stage, payment_method, payment_reference, payment_link_status, payment_provider_session_id, amount_paid, amount_total, amount_due, deposit_amount, event_type, message, proposal_total_amount, proposal_deposit_amount, pricing_subtotal, pricing_snapshot, addons_snapshot")
    .eq("payment_provider_session_id", event.provider_session_id)
    .maybeSingle<WebhookBookingRow>();

  if (error) {
    console.error("[api/payments/webhook/stripe] booking lookup failed:", error);
    return NextResponse.json({ error: "Booking lookup failed." }, { status: 500 });
  }

  if (!booking) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    payment_last_at: nowIso,
  };

  if (event.kind === "session.completed") {
    if (booking.payment_link_status === "paid" && booking.payment_reference === event.provider_session_id) {
      return NextResponse.json({ received: true, idempotent: true });
    }

    const amountTotal = roundMoney(
      typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
        ? booking.amount_total
        : getFoundationAmountTotal(booking) ?? 0,
    );
    const existingAmountPaid =
      typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
        ? roundMoney(booking.amount_paid)
        : 0;
    const nextAmountPaid = roundMoney(existingAmountPaid + event.amount_paid);
    const nextStatus = amountTotal > 0 && nextAmountPaid >= amountTotal ? "paid_in_full" : "deposit_paid";

    updatePayload.payment_status = nextStatus;
    updatePayload.payment_stage = derivePaymentFoundationStage(nextAmountPaid, amountTotal);
    updatePayload.payment_method = "card_manual";
    updatePayload.amount_total = amountTotal;
    updatePayload.amount_paid = nextAmountPaid;
    updatePayload.amount_due = computeFoundationAmountDue(amountTotal, nextAmountPaid);
    updatePayload.payment_received_at = event.paid_at;
    updatePayload.payment_reference = event.provider_session_id;
    updatePayload.payment_link_status = "paid";
  } else if (event.kind === "session.expired") {
    if (booking.payment_link_status === "paid") {
      return NextResponse.json({ received: true, ignored: true });
    }
    if (booking.payment_link_status === "expired") {
      return NextResponse.json({ received: true, idempotent: true });
    }
    updatePayload.payment_link_status = "expired";
  } else {
    return NextResponse.json({ received: true, ignored: true });
  }

  const { error: updateError } = await supabaseAdmin
    .from("bookings")
    .update(updatePayload)
    .eq("id", booking.id)
    .eq("payment_provider_session_id", event.provider_session_id);

  if (updateError) {
    console.error("[api/payments/webhook/stripe] booking update failed:", updateError);
    return NextResponse.json({ error: "Booking update failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
