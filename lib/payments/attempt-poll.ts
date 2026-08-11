/**
 * Polled reconciliation — the webhook that can never arrive.
 *
 * Oraya authorizes server-side against `/pts/v2/payments` with a transient
 * token, deliberately: the amount is verified against Oraya's own booking, the
 * attempt is claimed before the bank is called, and the browser's return stays
 * informational. The cost is that the only webhook event this merchant account
 * offers — `uc.orders.transactionresults` — fires solely for payments made
 * through Unified Checkout's *complete* method, which Oraya does not use.
 * Confirmed 2026-08-11 in Business Center: one delivery ever, and it was the
 * manual test.
 *
 * So a guest who closes the tab after 3DS leaves an attempt in flight and money
 * possibly taken, with nothing to reconcile it. This module lets a scheduled
 * job ask the provider directly and feed the answer into the SAME
 * reconciliation core the webhook uses (lib/payments/webhook-reconciliation),
 * inheriting its monotonic transitions and its refusal to rewrite terminal
 * states.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

import type { ReconciliationEvent } from "./webhook-reconciliation.ts";
import { isApprovedProviderPaymentStatus } from "./provider-payment-status.ts";

/** Statuses that prove the provider refused; the attempt may be released. */
export const POLL_DECLINED_STATUSES = [
  "DECLINED",
  "INVALID_REQUEST",
  "INVALID_DATA",
  "VALIDATION_ERROR",
  "MISSING_FIELD",
  "AUTHORIZED_RISK_DECLINED",
  "CANCELLED",
  "VOIDED",
  "REVERSED",
] as const;

/**
 * Attempt states worth polling. Terminal states are never re-examined — a
 * `recorded` or `failed` attempt has already been decided.
 */
export const POLLABLE_ATTEMPT_STATUSES = ["claimed", "authorized", "ambiguous"] as const;

export function isPollableAttemptStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (POLLABLE_ATTEMPT_STATUSES as readonly string[]).includes(status);
}

/**
 * An attempt is only worth polling once the browser has had a fair chance to
 * finish. Polling a 5-second-old attempt races the guest's own redirect.
 */
export function isAttemptStaleEnough(input: {
  created_at: string | null | undefined;
  now?: number;
  minimum_age_ms?: number;
}): boolean {
  const created = input.created_at ? Date.parse(input.created_at) : Number.NaN;
  if (!Number.isFinite(created)) return false;
  const now = input.now ?? Date.now();
  const minimumAge = input.minimum_age_ms ?? 10 * 60 * 1000;
  return now - created >= minimumAge;
}

export type PolledOutcome = "success" | "failure" | "unknown";

/**
 * Turn a retrieved provider payment into the outcome the reconciliation core
 * understands. Fails closed: an approved status whose amount cannot be
 * verified is `unknown`, never `success`.
 */
export function classifyPolledPayment(input: {
  provider_status: string | null;
  amount_verified: boolean;
}): PolledOutcome {
  const status = input.provider_status?.trim().toUpperCase() ?? "";
  if (!status) return "unknown";
  if ((POLL_DECLINED_STATUSES as readonly string[]).includes(status)) return "failure";
  if (isApprovedProviderPaymentStatus(status)) {
    return input.amount_verified ? "success" : "unknown";
  }
  return "unknown";
}

/**
 * Build the event the webhook core consumes. `event_type` is explicit so a
 * polled reconciliation is distinguishable from a real provider delivery in
 * logs and in `payment_provider_events`.
 */
export function buildPolledReconciliationEvent(input: {
  idempotency_key: string | null;
  provider_transaction_id: string | null;
  provider_status: string | null;
  amount_verified: boolean;
}): ReconciliationEvent {
  return {
    outcome: classifyPolledPayment({
      provider_status: input.provider_status,
      amount_verified: input.amount_verified,
    }),
    idempotency_key: input.idempotency_key,
    provider_transaction_id: input.provider_transaction_id,
    event_type: "oraya.polled.transactionresults",
    raw_status: input.provider_status,
  };
}
