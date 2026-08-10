/**
 * Pure helpers for reading CyberSource /pts/v2/payments status fields and
 * deciding which statuses can count as an approved charge once amount/currency
 * verification has passed.
 */

/** Statuses that prove money was authorized or taken when amount verifies. */
export const APPROVED_PROVIDER_PAYMENT_STATUSES = [
  "AUTHORIZED",
  "CAPTURED",
  "SETTLED",
  "TRANSMITTED",
] as const;

export type ApprovedProviderPaymentStatus =
  (typeof APPROVED_PROVIDER_PAYMENT_STATUSES)[number];

/**
 * Unified Checkout / Payments responses may expose the decision on `status`
 * and/or `outcome`. Prefer `status`; fall back to `outcome` when it is a
 * known payments status string (not a free-form message).
 */
export function readCyberSourcePaymentStatus(payload: {
  status?: unknown;
  outcome?: unknown;
} | null | undefined): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.status === "string" && payload.status.trim()) {
    return payload.status.trim().toUpperCase();
  }
  if (typeof payload.outcome === "string" && payload.outcome.trim()) {
    const outcome = payload.outcome.trim().toUpperCase();
    if (
      (APPROVED_PROVIDER_PAYMENT_STATUSES as readonly string[]).includes(outcome) ||
      outcome === "DECLINED" ||
      outcome === "PENDING" ||
      outcome === "AUTHORIZED_PENDING_REVIEW" ||
      outcome === "PENDING_AUTHENTICATION"
    ) {
      return outcome;
    }
  }
  return null;
}

export function isApprovedProviderPaymentStatus(
  status: string | null | undefined,
): status is ApprovedProviderPaymentStatus {
  if (!status) return false;
  return (APPROVED_PROVIDER_PAYMENT_STATUSES as readonly string[]).includes(
    status.trim().toUpperCase(),
  );
}
