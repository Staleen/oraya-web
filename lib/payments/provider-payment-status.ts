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
 * Statuses that prove NO money moved — safe to release the attempt claim so the
 * guest can try again. Anything not listed here stays `unknown`, which locks
 * the booking until a human reconciles it, so a status only belongs here once
 * it is known never to leave a charge or a hold behind.
 */
export const RETRY_SAFE_PROVIDER_PAYMENT_STATUSES = [
  "DECLINED",
  "INVALID_REQUEST",
  "INVALID_DATA",
  "VALIDATION_ERROR",
  "MISSING_FIELD",
  // 3-D Secure step-up (reason 475). The issuer wants to challenge the
  // cardholder, so CyberSource stopped BEFORE authorizing: no payment resource
  // exists, no hold was placed, no money moved. Treating it as "unknown" locked
  // the booking behind an ambiguous attempt only a human could clear — a guest
  // whose bank simply asked a question could never pay Oraya again. It belongs
  // here with the other non-charge statuses until a step-up screen exists
  // (W7 slices 3–6; docs/system/PHASE_16B_W7_STEP_UP_PLAN.md).
  "PENDING_AUTHENTICATION",
] as const;

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
