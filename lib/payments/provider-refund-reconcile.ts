/**
 * Phase 16B — self-reconciliation for refunds whose gateway response could not
 * be verified.
 *
 * Before this module an unverifiable refund response left a pending ledger
 * claim and forced the operator to open Business Center, find the refund id by
 * hand and paste it back into Ops. Oraya holds CyberSource API credentials, so
 * asking a human to be the integration was a design failure, not a necessity.
 *
 * Contract:
 *  - This module NEVER decides that money moved on its own. It only reads a
 *    provider record and reports whether that record proves a refund of the
 *    exact requested amount and currency exists.
 *  - Anything unproven stays unproven: the caller keeps the pending claim, the
 *    do-not-retry lock, and the manual Business Center path.
 *
 * Pure helpers — relative .ts imports so node:test can load this module.
 */

import { verifyAuthorizedAmountDetails } from "./authorized-amount.ts";
import { readRefundResponseAmountDetails } from "./provider-refund.ts";

/** Statuses a settled/accepted credit can legitimately carry. */
export const RECONCILED_REFUND_STATUSES = [
  "PENDING",
  "TRANSMITTED",
  "SETTLED",
  "COMPLETED",
  "REFUNDED",
  "VOIDED",
] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** True when the transaction's application list shows a credit/refund ran. */
export function isRefundTransaction(payload: unknown): boolean {
  const record = asRecord(payload);
  if (!record) return false;
  const applicationInformation = asRecord(record.applicationInformation);
  const applications = applicationInformation?.applications;
  if (Array.isArray(applications)) {
    const named = applications.some((entry) => {
      const application = asRecord(entry);
      const name = readString(application?.name)?.toLowerCase() ?? "";
      return /credit|refund/.test(name);
    });
    if (named) return true;
  }
  // Fall back to the top-level echo the refunds endpoint returns.
  return Boolean(asRecord(record.creditAmountDetails));
}

export function isReconciledRefundStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (RECONCILED_REFUND_STATUSES as readonly string[]).includes(
    status.trim().toUpperCase(),
  );
}

export type RefundReconciliation =
  /** A refund of exactly this amount is proven to exist at the provider. */
  | { kind: "confirmed"; refund_id: string }
  /** The provider record exists but does not prove this refund. */
  | { kind: "unproven"; reason: string };

/**
 * Decide whether a provider transaction record proves the refund we attempted.
 * Fails closed on every doubt.
 */
export function reconcileRefundFromProviderRecord(input: {
  payload: unknown;
  requested_amount: number;
  requested_currency: string;
  /** The merchant reference Oraya sent with the refund (idempotency key). */
  merchant_reference?: string | null;
}): RefundReconciliation {
  const record = asRecord(input.payload);
  if (!record) return { kind: "unproven", reason: "no_provider_record" };

  const refundId = readString(record.id);
  if (!refundId) return { kind: "unproven", reason: "no_transaction_id" };

  if (!isRefundTransaction(record)) {
    return { kind: "unproven", reason: "not_a_refund_transaction" };
  }

  const status =
    readString(record.status) ??
    readString(asRecord(record.applicationInformation)?.status);
  if (status && !isReconciledRefundStatus(status)) {
    return { kind: "unproven", reason: `refund_status_${status.toLowerCase()}` };
  }

  // The merchant reference must match when both sides carry one — this is what
  // stops an unrelated credit on the same card being read as our refund.
  const expectedReference = input.merchant_reference?.trim();
  if (expectedReference) {
    const clientReference = readString(
      asRecord(record.clientReferenceInformation)?.code,
    );
    if (clientReference && clientReference !== expectedReference) {
      return { kind: "unproven", reason: "merchant_reference_mismatch" };
    }
  }

  const verification = verifyAuthorizedAmountDetails({
    requested_amount: input.requested_amount,
    requested_currency: input.requested_currency,
    response_amount_details: readRefundResponseAmountDetails(
      record as Parameters<typeof readRefundResponseAmountDetails>[0],
    ),
  });
  if (!verification.ok) {
    return { kind: "unproven", reason: `amount_${verification.reason}` };
  }

  return { kind: "confirmed", refund_id: refundId };
}

/** Build the Transaction Search query that finds our refund by merchant reference. */
export function buildRefundSearchQuery(merchantReference: string): string {
  return `clientReferenceInformation.code:"${merchantReference.replace(/"/g, "")}"`;
}

/**
 * Pick the refund transaction id out of a Transaction Search response.
 * Returns null when the search proves nothing.
 */
export function readRefundIdFromSearchResults(payload: unknown): string | null {
  const record = asRecord(payload);
  const embedded = record ? asRecord(record._embedded) : null;
  const summaries = embedded?.transactionSummaries;
  if (!Array.isArray(summaries)) return null;
  for (const entry of summaries) {
    const summary = asRecord(entry);
    if (!summary) continue;
    if (!isRefundTransaction(summary)) continue;
    const id = readString(summary.id);
    if (id) return id;
  }
  return null;
}
