import { NextResponse } from "next/server";
import {
  buildCreditLibanaisWebhookReplayKey,
  decryptCreditLibanaisWebhookPayload,
  parseCreditLibanaisWebhookEvent,
  readCreditLibanaisWebhookConfig,
  verifyCreditLibanaisWebhookSignature,
  WEBHOOK_ID_HEADER,
  WEBHOOK_TRACE_ID_HEADER,
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
import { recordProviderPayment } from "@/lib/payments/ledger-server";
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
  if (attempt.payment_request_id) {
    const { data: paymentRequest, error: requestError } = await supabaseAdmin
      .from("payment_requests")
      .select("allowed_methods")
      .eq("id", attempt.payment_request_id)
      .maybeSingle<{ allowed_methods: string[] }>();
    if (requestError || !paymentRequest) {
      console.error(`${LOG_TAG} payment request lookup for method classification failed:`, {
        attempt_id: attempt.id,
        payment_request_id: attempt.payment_request_id,
        error: requestError?.message ?? "not_found",
      });
      return "failed";
    }
    const walletPresentation =
      paymentRequest.allowed_methods.includes("apple_pay") &&
      !paymentRequest.allowed_methods.includes("card")
        ? "apple_pay" as const
        : null;
    const recorded = await recordProviderPayment({
      payment_request_id: attempt.payment_request_id,
      amount: attempt.amount,
      currency: attempt.currency === "LBP" ? "LBP" : "USD",
      provider_reference:
        event.provider_transaction_id ?? attempt.provider_transaction_id ?? attempt.idempotency_key,
      idempotency_key: attempt.idempotency_key,
      wallet_presentation: walletPresentation,
    });
    return recorded.ok
      ? recorded.result.idempotent ? "already_paid" : "recorded"
      : "failed";
  }
  if (!attempt.booking_id) {
    console.error(`${LOG_TAG} attempt has no payable subject:`, { attempt_id: attempt.id });
    return "failed";
  }
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
  const headers = lowerCaseHeaders(request);
  let decryptedPayload: Awaited<ReturnType<typeof decryptCreditLibanaisWebhookPayload>>;
  try {
    decryptedPayload = await decryptCreditLibanaisWebhookPayload({
      rawBody,
      config: configResult.config,
    });
  } catch (error) {
    console.error(`${LOG_TAG} webhook REFUSED: MLE decryption failed (fail closed):`, {
      reason: error instanceof Error ? error.message : "decrypt_failed",
      body_length: rawBody.length,
    });
    return NextResponse.json({ error: "Invalid encrypted webhook payload." }, { status: 401 });
  }

  const verification = verifyCreditLibanaisWebhookSignature({
    payload: decryptedPayload.signature_payload,
    headers,
    config: configResult.config,
  });
  if (!verification.ok) {
    console.error(`${LOG_TAG} webhook REFUSED: unverifiable payload (fail closed):`, {
      reason: verification.reason,
      payload_encrypted: decryptedPayload.payload_encrypted,
      body_length: rawBody.length,
    });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  if (!decryptedPayload.payload_encrypted) {
    console.log(
      `${LOG_TAG} signature-verified plaintext delivery accepted (org contract payloadEncryption=false)`,
      { body_length: rawBody.length },
    );
  }

  const event = parseCreditLibanaisWebhookEvent(decryptedPayload.event_payload);
  if (!event) {
    console.error(`${LOG_TAG} verified webhook payload is not a JSON object — ignored`);
    return NextResponse.json({ received: true, ignored: true });
  }

  const attempt = await findPaymentAttemptByReference({
    idempotency_key: event.idempotency_key,
    provider_transaction_id: event.provider_transaction_id,
  });
  const replayKey = buildCreditLibanaisWebhookReplayKey(event);
  const providerEventId =
    headers[WEBHOOK_ID_HEADER]?.trim() ||
    headers[WEBHOOK_TRACE_ID_HEADER]?.trim() ||
    event.transaction_trace_id ||
    `replay-${replayKey}`;
  const occurredAt = event.occurred_at && Number.isFinite(Date.parse(event.occurred_at))
    ? new Date(event.occurred_at).toISOString()
    : null;
  const { data: insertedProviderEvent, error: providerEventError } = await supabaseAdmin
    .from("payment_provider_events")
    .insert({
      provider: "credit_libanais",
      provider_event_id: providerEventId,
      payment_request_id: attempt?.payment_request_id ?? null,
      occurred_at: occurredAt,
      verification_status: "verified",
      processing_status: "pending",
      replay_key: replayKey,
      safe_metadata: {
        event_type: event.event_type,
        raw_status: event.raw_status,
        outcome: event.outcome,
        signature_key_id: verification.key_id,
        payload_encrypted: decryptedPayload.payload_encrypted,
        // Phase 16B M1 — surfaced so Ops shows "Decision Manager rejected —
        // void / auth reverse" instead of a generic unfinished bank message.
        decision_manager_reject: event.decision_manager_reject,
        provider_reason_code: event.provider_reason_code,
      },
    })
    .select("id")
    .single<{ id: string }>();

  let providerEvent = insertedProviderEvent;

  if (providerEventError) {
    if (providerEventError.code === "23505") {
      const { data: existingReplay, error: replayLookupError } = await supabaseAdmin
        .from("payment_provider_events")
        .select("id, provider_event_id, processing_status")
        .eq("provider", "credit_libanais")
        .eq("replay_key", replayKey)
        .maybeSingle<{ id: string; provider_event_id: string; processing_status: string }>();
      if (replayLookupError) {
        console.error(`${LOG_TAG} duplicate replay lookup failed:`, replayLookupError);
        return NextResponse.json({ error: "Webhook replay state is unavailable." }, { status: 500 });
      }
      if (existingReplay) {
        if (existingReplay.processing_status === "processed" || existingReplay.processing_status === "ignored") {
          return NextResponse.json({ received: true, idempotent: true });
        }
        // A pending row may be a concurrent delivery or a previous invocation
        // that stopped after the durable insert. Reconciliation is monotonic
        // and idempotent, so replaying it is the safe recovery path.
        providerEvent = existingReplay;
      } else {
        const { data: conflictingDelivery, error: deliveryLookupError } = await supabaseAdmin
          .from("payment_provider_events")
          .select("id")
          .eq("provider", "credit_libanais")
          .eq("provider_event_id", providerEventId)
          .maybeSingle<{ id: string }>();
        if (deliveryLookupError) {
          console.error(`${LOG_TAG} duplicate delivery lookup failed:`, deliveryLookupError);
          return NextResponse.json({ error: "Webhook delivery state is unavailable." }, { status: 500 });
        }
        if (conflictingDelivery) {
          console.error(`${LOG_TAG} provider delivery id was reused with different event content:`, {
            provider_event_id: providerEventId,
          });
          return NextResponse.json({ error: "Conflicting webhook delivery." }, { status: 409 });
        }
        return NextResponse.json({ error: "Webhook event could not be claimed." }, { status: 500 });
      }
    } else {
      console.error(`${LOG_TAG} verified event could not be claimed durably:`, {
        provider_event_id: providerEventId,
        error: providerEventError,
      });
      return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 500 });
    }
  }

  if (!providerEvent) {
    return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 500 });
  }

  const outcome = await reconcileWebhookEvent(
    {
      findAttempt: async () => attempt,
      recordPaymentOnBooking,
      markAttempt: (attemptId, expectedStatuses, patch) =>
        supabasePaymentAttemptStore.transitionAttempt(attemptId, expectedStatuses, patch),
      log: (message, detail) => console.error(`${LOG_TAG} ${message}`, detail ?? {}),
    },
    event,
  );

  const processing = outcome.kind === "recorded" || outcome.kind === "marked_failed"
    ? { processing_status: "processed", error_code: null }
    : outcome.kind === "conflict"
      ? { processing_status: "failed", error_code: "reconciliation_conflict" }
      : outcome.kind === "error"
        ? { processing_status: "failed", error_code: "reconciliation_failed" }
        : { processing_status: "ignored", error_code: null };
  let paymentTransactionId: string | null = null;
  if (attempt?.payment_request_id && (outcome.kind === "recorded" || outcome.kind === "already_final")) {
    const { data: transaction } = await supabaseAdmin
      .from("payment_transactions")
      .select("id")
      .eq("idempotency_key", attempt.idempotency_key)
      .maybeSingle<{ id: string }>();
    paymentTransactionId = transaction?.id ?? null;
  }
  const { error: eventUpdateError } = await supabaseAdmin
    .from("payment_provider_events")
    .update({
      ...processing,
      payment_transaction_id: paymentTransactionId,
      processed_at: new Date().toISOString(),
    })
    .eq("id", providerEvent.id);
  if (eventUpdateError) {
    console.error(`${LOG_TAG} provider event outcome could not be persisted:`, {
      provider_event_id: providerEventId,
      outcome: outcome.kind,
      error: eventUpdateError,
    });
    return NextResponse.json({ error: "Webhook event outcome could not be recorded." }, { status: 500 });
  }

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
