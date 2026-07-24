/**
 * Plan 4 Phase 1 (KNOWN_BUGS #15) — manual-first refunds.
 *
 * Refunds are EXECUTED by hand in the NetCommerce Business Center; the admin
 * UI only RECORDS them (docs/system/REFUND_RUNBOOK.md). A recorded refund must
 * carry the Business Center refund/transaction reference so every money-back
 * entry is traceable to a provider-side operation. Recording an executed
 * refund without that reference is refused (400).
 *
 * Relative .ts imports so node:test can load this module (repo test convention).
 */

/**
 * refund_status values that assert money actually moved back to the guest.
 * `refund_pending` is an intent marker and does not require a reference yet.
 */
export const EXECUTED_REFUND_STATUSES = ["partial_refund", "refunded"] as const;

export type ManualRefundValidation =
  | { ok: true; records_executed_refund: false }
  | { ok: true; records_executed_refund: true; provider_reference: string }
  | { ok: false; error: string };

export const MISSING_REFUND_REFERENCE_ERROR =
  "A NetCommerce Business Center refund reference is required. Execute the refund in the Business Center first, then record it here with its reference (see docs/system/REFUND_RUNBOOK.md).";

export function validateManualRefundRecord(
  payload: Record<string, unknown>,
): ManualRefundValidation {
  const status = Object.prototype.hasOwnProperty.call(payload, "refund_status")
    ? payload.refund_status
    : undefined;
  const recordsExecutedRefund =
    typeof status === "string" &&
    (EXECUTED_REFUND_STATUSES as readonly string[]).includes(status);

  if (!recordsExecutedRefund) {
    return { ok: true, records_executed_refund: false };
  }

  const reference = payload.refund_provider_reference;
  if (typeof reference !== "string" || !reference.trim()) {
    return { ok: false, error: MISSING_REFUND_REFERENCE_ERROR };
  }

  return {
    ok: true,
    records_executed_refund: true,
    provider_reference: reference.trim(),
  };
}
