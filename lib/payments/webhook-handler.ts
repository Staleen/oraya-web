import { NextResponse } from "next/server";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { getHostedCheckoutProviderByKey } from "@/lib/payments/runtime";
import { decideSetPaidUpdate } from "@/lib/payments/webhook-set-paid";
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

export async function handleHostedCheckoutWebhook(
  providerKey: string,
  request: Request,
) {
  const provider = getHostedCheckoutProviderByKey(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Unsupported payment provider." }, { status: 404 });
  }

  try {
    const rawBody = await request.text();
    const verification = await provider.verifyWebhook({
      rawBody,
      headers: lowerCaseHeaders(request),
    });

    if (!verification.ok) {
      return NextResponse.json({ error: "Invalid payment callback signature." }, { status: 400 });
    }

    const event = verification.event;
    const delta = provider.mapProviderEventToBookingUpdate(event);
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, payment_status, payment_stage, payment_method, payment_reference, payment_link_status, payment_provider_session_id, amount_paid, amount_total, amount_due, deposit_amount, event_type, message, proposal_total_amount, proposal_deposit_amount, pricing_subtotal, pricing_snapshot, addons_snapshot")
      .eq("payment_provider_session_id", event.provider_session_id)
      .maybeSingle<WebhookBookingRow>();

    if (error) {
      console.error(`[api/payments/webhook/${providerKey}] booking lookup failed:`, error);
      return NextResponse.json({ error: "Booking lookup failed." }, { status: 500 });
    }

    if (!booking) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      payment_last_at: nowIso,
    };

    switch (delta.kind) {
      case "set_paid": {
        // Remediation 1.6: once paid, no further set_paid may add to
        // amount_paid — duplicate deliveries AND different-reference events
        // for the same session are both idempotent no-ops. The write below is
        // additionally guarded at the DB so concurrent first deliveries
        // cannot both apply (see the .not("payment_link_status", ...) filter
        // and matched-row check).
        const decision = decideSetPaidUpdate(booking, {
          amount_paid: delta.amount_paid,
          payment_reference: delta.payment_reference,
          payment_received_at: delta.payment_received_at,
        });
        if (decision.action === "idempotent") {
          return NextResponse.json({ received: true, idempotent: true });
        }
        Object.assign(updatePayload, decision.updatePayload);

        const { data: paidRows, error: paidUpdateError } = await supabaseAdmin
          .from("bookings")
          .update(updatePayload)
          .eq("id", booking.id)
          .eq("payment_provider_session_id", event.provider_session_id)
          // NULL-safe "not already paid" guard (neq alone would drop NULL rows).
          .or("payment_link_status.is.null,payment_link_status.neq.paid")
          .select("id");

        if (paidUpdateError) {
          console.error(`[api/payments/webhook/${providerKey}] booking update failed:`, paidUpdateError);
          return NextResponse.json({ error: "Booking update failed." }, { status: 500 });
        }
        if (!paidRows || paidRows.length === 0) {
          // A concurrent delivery won the race — do not re-add amount_paid.
          return NextResponse.json({ received: true, idempotent: true });
        }
        return NextResponse.json({ received: true });
      }
      case "set_expired":
        if (booking.payment_link_status === "paid") {
          return NextResponse.json({ received: true, ignored: true });
        }
        if (booking.payment_link_status === "expired") {
          return NextResponse.json({ received: true, idempotent: true });
        }
        updatePayload.payment_link_status = "expired";
        break;
      case "set_cancelled":
        if (booking.payment_link_status === "paid") {
          return NextResponse.json({ received: true, ignored: true });
        }
        if (booking.payment_link_status === "cancelled") {
          return NextResponse.json({ received: true, idempotent: true });
        }
        updatePayload.payment_link_status = "cancelled";
        break;
      case "set_failed":
        if (booking.payment_link_status === "paid") {
          return NextResponse.json({ received: true, ignored: true });
        }
        if (booking.payment_link_status === "failed") {
          return NextResponse.json({ received: true, idempotent: true });
        }
        updatePayload.payment_link_status = "failed";
        break;
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updatePayload)
      .eq("id", booking.id)
      .eq("payment_provider_session_id", event.provider_session_id);

    if (updateError) {
      console.error(`[api/payments/webhook/${providerKey}] booking update failed:`, updateError);
      return NextResponse.json({ error: "Booking update failed." }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`[api/payments/webhook/${providerKey}] unexpected error:`, error);
    return NextResponse.json({ error: "Payment callback handling failed." }, { status: 500 });
  }
}
