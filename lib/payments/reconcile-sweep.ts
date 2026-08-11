import "server-only";
import { retrieveCreditLibanaisPaymentForReconcile } from "@/lib/payments/credit-libanais";
import { recordPaymentOnBooking } from "@/lib/payments/credit-libanais-webhook-handler";
import { supabasePaymentAttemptStore } from "@/lib/payments/payment-attempts-store";
import {
  reconcileWebhookEvent,
  type ReconciliationAttempt,
} from "@/lib/payments/webhook-reconciliation";
import {
  POLLABLE_ATTEMPT_STATUSES,
  buildPolledReconciliationEvent,
  isAttemptStaleEnough,
} from "@/lib/payments/attempt-poll";
import { notifyMoneyEvent } from "@/lib/payments/money-event-dispatch-server";
import { maybeInstantConfirmBooking } from "@/lib/bookings/instant-confirm-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Polled payment reconciliation — the observer this merchant account cannot
 * deliver by webhook.
 *
 * `uc.orders.transactionresults` is the only event available here and it fires
 * solely for payments made through Unified Checkout's *complete* method. Oraya
 * authorizes server-side with a transient token on purpose (amount verified
 * against Oraya's own booking, attempt claimed before the bank is called,
 * browser return informational), so that event never fires. Verified in
 * Business Center 2026-08-11: one delivery ever, the manual test.
 *
 * Without this, a guest who closes the tab after 3DS leaves money taken and
 * nothing recorded. This asks the provider directly and feeds the answer to the
 * SAME reconciliation core the webhook uses, so every money-safety rule applies
 * unchanged: monotonic transitions, terminal states never rewritten, money
 * never invented.
 *
 * Read-only against the provider. It never authorizes, refunds or reverses.
 *
 * Run from two places, because Vercel Hobby allows only ONE cron per day:
 *   - the daily cron, as a guaranteed floor;
 *   - opportunistically whenever an operator opens the payments desk, which in
 *     practice reconciles within seconds of anyone looking.
 */

const LOG_TAG = "[payments/reconcile-sweep]";

export type ReconcileSweepSummary = {
  in_flight: number;
  examined: number;
  skipped_too_fresh: number;
  skipped_no_provider_id: number;
  provider_unreachable: number;
  recorded: number;
  marked_failed: number;
  unchanged: number;
};

type StaleAttemptRow = ReconciliationAttempt & { created_at: string };

const EMPTY: ReconcileSweepSummary = {
  in_flight: 0,
  examined: 0,
  skipped_too_fresh: 0,
  skipped_no_provider_id: 0,
  provider_unreachable: 0,
  recorded: 0,
  marked_failed: 0,
  unchanged: 0,
};

/**
 * Reconcile in-flight payment attempts against the provider.
 * Never throws — a failure here must never break the caller's page or job.
 */
export async function runPaymentAttemptReconciliation(
  options: { limit?: number } = {},
): Promise<ReconcileSweepSummary> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 50));
  const summary: ReconcileSweepSummary = { ...EMPTY };

  try {
    const { data, error } = await supabaseAdmin
      .from("payment_attempts")
      .select(
        "id, booking_id, payment_request_id, status, amount, currency, idempotency_key, provider_transaction_id, created_at",
      )
      .in("status", [...POLLABLE_ATTEMPT_STATUSES])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error(`${LOG_TAG} could not load in-flight attempts:`, error.message);
      return summary;
    }

    const attempts = (data ?? []) as StaleAttemptRow[];
    summary.in_flight = attempts.length;

    for (const attempt of attempts) {
      // Give the guest's own redirect a fair chance before polling behind it.
      if (!isAttemptStaleEnough({ created_at: attempt.created_at })) {
        summary.skipped_too_fresh += 1;
        continue;
      }
      // No provider id means no payment resource was ever created; there is
      // nothing to ask about. Those stay for a human.
      if (!attempt.provider_transaction_id) {
        summary.skipped_no_provider_id += 1;
        continue;
      }

      summary.examined += 1;
      const lookup = await retrieveCreditLibanaisPaymentForReconcile({
        payment_id: attempt.provider_transaction_id,
        amount: Number(attempt.amount),
        currency: attempt.currency === "LBP" ? "LBP" : "USD",
      });
      if (!lookup.ok) {
        summary.provider_unreachable += 1;
        continue;
      }

      const outcome = await reconcileWebhookEvent(
        {
          findAttempt: async () => attempt,
          recordPaymentOnBooking,
          markAttempt: (attemptId, expectedStatuses, patch) =>
            supabasePaymentAttemptStore.transitionAttempt(attemptId, expectedStatuses, patch),
          log: (message, detail) => console.error(`${LOG_TAG} ${message}`, detail ?? {}),
        },
        buildPolledReconciliationEvent({
          idempotency_key: attempt.idempotency_key,
          provider_transaction_id: attempt.provider_transaction_id,
          provider_status: lookup.provider_status,
          amount_verified: lookup.amount_verified,
        }),
      );

      if (outcome.kind === "recorded") {
        summary.recorded += 1;
        // Same downstream as the webhook. Both are at-most-once by construction.
        await notifyMoneyEvent({
          outcome: "recorded",
          source: "webhook",
          amount: Number(attempt.amount),
          currency: attempt.currency,
          method: "card",
          booking_id: attempt.booking_id,
          payment_request_id: attempt.payment_request_id,
          provider_transaction_id: attempt.provider_transaction_id,
          idempotency_key: attempt.idempotency_key,
        });
        await maybeInstantConfirmBooking(attempt.booking_id);
      } else if (outcome.kind === "marked_failed") {
        summary.marked_failed += 1;
      } else {
        summary.unchanged += 1;
      }
    }
  } catch (error) {
    console.error(`${LOG_TAG} sweep failed`, error);
  }

  return summary;
}
