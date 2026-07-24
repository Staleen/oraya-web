// Relative .ts imports so node:test can load this module (repo test convention).
import type { PaymentAttemptStatus } from "./unified-checkout-completion.ts";
import type { CreditLibanaisWebhookEvent } from "./credit-libanais-webhook.ts";

/**
 * Plan 4 Phase 2 (2.1) — pure orchestration core that makes VERIFIED webhooks
 * authoritative for payment-attempt outcomes.
 *
 * Contract:
 *  - Only verified events reach this module (the handler fails closed first).
 *  - A webhook-confirmed SUCCESS for an in-flight attempt (claimed /
 *    authorized / ambiguous) records the payment on the booking through the
 *    EXISTING idempotent set-paid discipline (deps.recordPaymentOnBooking must
 *    use decideSetPaidUpdate + the NULL-safe not-paid filter + matched-row
 *    check) and marks the attempt `recorded`. This auto-resolves most
 *    `ambiguous` states without human reconciliation.
 *  - A webhook-confirmed DECLINE/VOID for an in-flight attempt marks it
 *    `failed` (releasing the one-in-flight claim so the guest can retry).
 *  - A webhook that CONTRADICTS a terminal state (success for `failed`,
 *    failure for `recorded`) NEVER silently rewrites history — it logs
 *    RECONCILIATION REQUIRED and leaves state untouched for a human
 *    (docs/system/REFUND_RUNBOOK.md section 2).
 *  - Unknown outcomes and unmatched references change nothing.
 */

export type ReconciliationAttempt = {
  id: string;
  booking_id: string;
  status: PaymentAttemptStatus;
  amount: number;
  currency: string;
  idempotency_key: string;
  provider_transaction_id: string | null;
};

export type ReconciliationEvent = Pick<
  CreditLibanaisWebhookEvent,
  "outcome" | "idempotency_key" | "provider_transaction_id" | "event_type" | "raw_status"
>;

export type ReconciliationDeps = {
  /** Match by idempotency_key (clientReferenceInformation.code) or provider transaction id. */
  findAttempt(ref: {
    idempotency_key: string | null;
    provider_transaction_id: string | null;
  }): Promise<ReconciliationAttempt | null>;
  /**
   * Applies the webhook-confirmed payment to the booking. MUST reuse the
   * idempotent set-paid discipline (decideSetPaidUpdate + NULL-safe not-paid
   * guard + matched-row check). "already_paid" covers both the idempotent
   * decision and a zero-row guarded write (a concurrent recorder won).
   */
  recordPaymentOnBooking(
    attempt: ReconciliationAttempt,
    event: ReconciliationEvent,
  ): Promise<"recorded" | "already_paid" | "failed">;
  markAttempt(
    attemptId: string,
    patch: { status: PaymentAttemptStatus; provider_transaction_id?: string | null },
  ): Promise<{ ok: boolean }>;
  log(message: string, detail?: Record<string, unknown>): void;
};

export type ReconciliationOutcome =
  | { kind: "ignored"; reason: "unknown_outcome" | "no_reference" }
  | { kind: "no_attempt" }
  | { kind: "recorded"; attempt_id: string }
  | { kind: "already_final"; attempt_id: string; status: PaymentAttemptStatus }
  | { kind: "marked_failed"; attempt_id: string }
  | { kind: "conflict"; attempt_id: string }
  | { kind: "error"; attempt_id: string };

const IN_FLIGHT: readonly PaymentAttemptStatus[] = ["claimed", "authorized", "ambiguous"];

export async function reconcileWebhookEvent(
  deps: ReconciliationDeps,
  event: ReconciliationEvent,
): Promise<ReconciliationOutcome> {
  if (event.outcome === "unknown") {
    deps.log("webhook event outcome not classifiable — ignored, no state change", {
      event_type: event.event_type,
      raw_status: event.raw_status,
    });
    return { kind: "ignored", reason: "unknown_outcome" };
  }

  if (!event.idempotency_key && !event.provider_transaction_id) {
    deps.log("webhook event carries no attempt reference — ignored, no state change", {
      event_type: event.event_type,
    });
    return { kind: "ignored", reason: "no_reference" };
  }

  const attempt = await deps.findAttempt({
    idempotency_key: event.idempotency_key,
    provider_transaction_id: event.provider_transaction_id,
  });
  if (!attempt) {
    return { kind: "no_attempt" };
  }

  const transactionId = event.provider_transaction_id ?? attempt.provider_transaction_id;

  if (event.outcome === "success") {
    if (attempt.status === "recorded") {
      return { kind: "already_final", attempt_id: attempt.id, status: attempt.status };
    }
    if (attempt.status === "failed") {
      deps.log(
        "RECONCILIATION REQUIRED: webhook confirms success for an attempt marked failed — no state change",
        {
          attempt_id: attempt.id,
          booking_id: attempt.booking_id,
          idempotency_key: attempt.idempotency_key,
          provider_transaction_id: transactionId,
        },
      );
      return { kind: "conflict", attempt_id: attempt.id };
    }

    // claimed / authorized / ambiguous — the webhook is authoritative.
    const recorded = await deps.recordPaymentOnBooking(attempt, event);
    if (recorded === "failed") {
      deps.log(
        "RECONCILIATION REQUIRED: webhook-confirmed success but booking update failed — attempt marked ambiguous",
        {
          attempt_id: attempt.id,
          booking_id: attempt.booking_id,
          idempotency_key: attempt.idempotency_key,
          provider_transaction_id: transactionId,
        },
      );
      if (attempt.status !== "ambiguous") {
        await deps.markAttempt(attempt.id, {
          status: "ambiguous",
          provider_transaction_id: transactionId,
        });
      }
      return { kind: "error", attempt_id: attempt.id };
    }

    const marked = await deps.markAttempt(attempt.id, {
      status: "recorded",
      provider_transaction_id: transactionId,
    });
    if (!marked.ok) {
      deps.log("payment recorded on booking but attempt row could not be marked recorded", {
        attempt_id: attempt.id,
        booking_id: attempt.booking_id,
      });
      return { kind: "error", attempt_id: attempt.id };
    }
    deps.log("webhook-confirmed payment reconciled — attempt recorded", {
      attempt_id: attempt.id,
      booking_id: attempt.booking_id,
      previous_status: attempt.status,
      booking_write: recorded,
    });
    return { kind: "recorded", attempt_id: attempt.id };
  }

  // event.outcome === "failure"
  if (attempt.status === "failed") {
    return { kind: "already_final", attempt_id: attempt.id, status: attempt.status };
  }
  if (attempt.status === "recorded") {
    deps.log(
      "RECONCILIATION REQUIRED: webhook confirms decline/void for an attempt already recorded as paid — no state change",
      {
        attempt_id: attempt.id,
        booking_id: attempt.booking_id,
        idempotency_key: attempt.idempotency_key,
        provider_transaction_id: transactionId,
      },
    );
    return { kind: "conflict", attempt_id: attempt.id };
  }

  if (!IN_FLIGHT.includes(attempt.status)) {
    return { kind: "already_final", attempt_id: attempt.id, status: attempt.status };
  }

  const markedFailed = await deps.markAttempt(attempt.id, {
    status: "failed",
    provider_transaction_id: transactionId,
  });
  if (!markedFailed.ok) {
    deps.log("webhook-confirmed decline could not be persisted on the attempt", {
      attempt_id: attempt.id,
      booking_id: attempt.booking_id,
    });
    return { kind: "error", attempt_id: attempt.id };
  }
  deps.log("webhook-confirmed decline reconciled — attempt marked failed (claim released)", {
    attempt_id: attempt.id,
    booking_id: attempt.booking_id,
    previous_status: attempt.status,
  });
  return { kind: "marked_failed", attempt_id: attempt.id };
}
