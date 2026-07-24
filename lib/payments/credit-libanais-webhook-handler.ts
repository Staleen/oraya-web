import { NextResponse } from "next/server";
import {
  parseCreditLibanaisWebhookEvent,
  readCreditLibanaisWebhookConfig,
  verifyCreditLibanaisWebhookSignature,
} from "@/lib/payments/credit-libanais-webhook";
import {
  findPaymentAttemptByReference,
  supabasePaymentAttemptStore,
} from "@/lib/payments/payment-attempts-store";
import {
  reconcileWebhookEvent,
  type ReconciliationAttempt,
  type ReconciliationEvent,
} from "@/lib/payments/webhook-reconciliation";
import { decideSetPaidUpdate, type SetPaidBookingState } from "@/lib/payments/webhook-set-paid";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Plan 4 Phase 2 — dedicated CyberSource/NetCommerce webhook endpoint logic.
 *
 * Fail-closed order of operations:
 *   1. Verification config incomplete ⇒ 503, payload never processed.
 *   2. Signature unverifiable ⇒ 401 + structured log, no state change.
 *   3. Verified events reconcile against the payment_attempts ledger
 *      (lib/payments/webhook-reconciliation.ts): confirmed success records
 *      the payment through the idempotent set-paid discipline and marks the
 *      attempt `recorded`; confirmed decline/void marks it `failed`.
 */

const LOG_TAG = "[api/payments/webhook/credit_libanais]";

type ReconciliationBookingRow = SetPaidBookingState & { id: string };

const BOOKING_COLUMNS =
  "id, payment_status, payment_stage, payment_method, payment_reference, payment_link_status, payment_provider_session_id, amount_paid, amount_total, amount_due, deposit_amount, event_type, message, proposal_total_amount, proposal_deposit_amount, pricing_subtotal, pricing_snapshot, addons_snapshot";

async function recordPaymentOnBooking(
  attempt: ReconciliationAttempt,
  event: ReconciliationEvent,
): Promise<"recorded" | "already_paid" | "failed"> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", attempt.booking_id)
    .maybeSingle<ReconciliationBookingRow>();

  if (error || !booking) {
    console.error(`${LOG_TAG} booking lookup for attempt reconciliation failed:`, {
      attempt_id: attempt.id,
      booking_id: attempt.booking_id,
      error: error ?? "not_found",
    });
    return "failed";
  }

  const nowIso = new Date().toISOString();
  const decision = decideSetPaidUpdate(booking, {
    amount_paid: attempt.amount,
    payment_reference:
      event.provider_transaction_id ?? attempt.provider_transaction_id ?? attempt.idempotency_key,
    payment_received_at: nowIso,
  });

  if (decision.action === "idempotent") {
    return "already_paid";
  }

  const { data: rows, error: updateError } = await supabaseAdmin
    .from("bookings")
    .update({ ...decision.updatePayload, payment_last_at: nowIso })
    .eq("id", booking.id)
    // NULL-safe "not already paid" guard (same discipline as webhook-handler).
    .or("payment_link_status.is.null,payment_link_status.neq.paid")
    .select("id");

  if (updateError) {
    console.error(`${LOG_TAG} booking update for attempt reconciliation failed:`, {
      attempt_id: attempt.id,
      booking_id: attempt.booking_id,
      error: updateError,
    });
    return "failed";
  }
  // Zero matched rows: a concurrent recorder won the race — idempotent.
  return (rows?.length ?? 0) >= 1 ? "recorded" : "already_paid";
}

function lowerCaseHeaders(request: Request) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

export async function handleCreditLibanaisWebhook(request: Request) {
  const configResult = readCreditLibanaisWebhookConfig(process.env);
  if (!configResult.ok) {
    console.error(`${LOG_TAG} webhook REFUSED: verification config missing (fail closed):`, {
      missing: configResult.missing,
    });
    return NextResponse.json(
      { error: "Webhook verification is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const verification = verifyCreditLibanaisWebhookSignature({
    rawBody,
    headers: lowerCaseHeaders(request),
    config: configResult.config,
  });
  if (!verification.ok) {
    console.error(`${LOG_TAG} webhook REFUSED: unverifiable payload (fail closed):`, {
      reason: verification.reason,
      body_length: rawBody.length,
    });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = parseCreditLibanaisWebhookEvent(rawBody);
  if (!event) {
    console.error(`${LOG_TAG} verified webhook payload is not a JSON object — ignored`);
    return NextResponse.json({ received: true, ignored: true });
  }

  const outcome = await reconcileWebhookEvent(
    {
      findAttempt: findPaymentAttemptByReference,
      recordPaymentOnBooking,
      markAttempt: (attemptId, patch) => supabasePaymentAttemptStore.updateAttempt(attemptId, patch),
      log: (message, detail) => console.error(`${LOG_TAG} ${message}`, detail ?? {}),
    },
    event,
  );

  switch (outcome.kind) {
    case "recorded":
      return NextResponse.json({ received: true, reconciled: true, attempt_id: outcome.attempt_id });
    case "marked_failed":
      return NextResponse.json({ received: true, reconciled: true, attempt_id: outcome.attempt_id });
    case "already_final":
      return NextResponse.json({ received: true, idempotent: true });
    case "conflict":
      // Human reconciliation required (logged loudly above); acknowledge so
      // the provider does not retry into the same conflict forever.
      return NextResponse.json({ received: true, conflict: true });
    case "no_attempt":
      console.error(`${LOG_TAG} verified webhook matched no payment attempt — ignored`, {
        idempotency_key: event.idempotency_key,
        provider_transaction_id: event.provider_transaction_id,
        event_type: event.event_type,
      });
      return NextResponse.json({ received: true, ignored: true });
    case "ignored":
      return NextResponse.json({ received: true, ignored: true });
    case "error":
      // Transient storage trouble — 500 invites a provider retry.
      return NextResponse.json({ error: "Webhook reconciliation failed." }, { status: 500 });
  }
}
