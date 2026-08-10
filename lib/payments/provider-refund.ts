/**
 * Pure helpers for money-safe card refund UX.
 */

import { roundMoney } from "../money.ts";
import { verifyAuthorizedAmountDetails, type AuthorizedAmountDetails } from "./authorized-amount.ts";

export const PROVIDER_REFUND_SUCCESS_STATUSES = [
  "PENDING",
  "TRANSMITTED",
  "SETTLED",
  "COMPLETED",
  "REFUNDED",
] as const;

export type ProviderRefundOutcome = "approved" | "declined" | "ambiguous";

export function remainingRefundableAmount(input: {
  payment_amount: number;
  already_refunded: number;
}): number {
  return Math.max(
    0,
    roundMoney(roundMoney(input.payment_amount) - roundMoney(input.already_refunded)),
  );
}

export function isProviderRefundSuccessStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (PROVIDER_REFUND_SUCCESS_STATUSES as readonly string[]).includes(
    status.trim().toUpperCase(),
  );
}

export function validateRefundAmount(input: {
  amount: number;
  remaining: number;
}): { ok: true; amount: number } | { ok: false; reason: string } {
  const amount = roundMoney(input.amount);
  const remaining = roundMoney(input.remaining);
  if (!(amount > 0)) return { ok: false, reason: "invalid_amount" };
  if (amount > remaining) return { ok: false, reason: "refund_exceeds_payment" };
  return { ok: true, amount };
}

/**
 * Prefer CyberSource refund echo fields, then generic amountDetails.
 */
export function readRefundResponseAmountDetails(payload: {
  creditAmountDetails?: { creditAmount?: unknown; currency?: unknown } | null;
  orderInformation?: { amountDetails?: AuthorizedAmountDetails } | null;
} | null | undefined): AuthorizedAmountDetails {
  const credit = payload?.creditAmountDetails;
  if (credit && typeof credit === "object") {
    return {
      authorizedAmount: credit.creditAmount,
      totalAmount: credit.creditAmount,
      currency: credit.currency,
    };
  }
  return payload?.orderInformation?.amountDetails ?? null;
}

export function verifyRefundAmountDetails(input: {
  requested_amount: number;
  requested_currency: string;
  payload: {
    creditAmountDetails?: { creditAmount?: unknown; currency?: unknown } | null;
    orderInformation?: { amountDetails?: AuthorizedAmountDetails } | null;
  } | null | undefined;
}) {
  return verifyAuthorizedAmountDetails({
    requested_amount: input.requested_amount,
    requested_currency: input.requested_currency,
    response_amount_details: readRefundResponseAmountDetails(input.payload),
  });
}

/**
 * Classify a parsed refund gateway response.
 * Declined = safe to release the pending claim and retry.
 * Ambiguous = money may have moved; do not retry provider.
 */
export function classifyProviderRefundOutcome(input: {
  http_ok: boolean;
  http_status: number;
  status: string | null;
  refund_id: string | null;
  amount_verified: boolean;
  decrypt_failed?: boolean;
}): ProviderRefundOutcome {
  if (input.decrypt_failed) return "ambiguous";
  if (
    input.http_ok &&
    input.refund_id &&
    isProviderRefundSuccessStatus(input.status) &&
    input.amount_verified
  ) {
    return "approved";
  }
  // Apparent success without verifiable amount — fail closed as ambiguous.
  if (input.http_ok && input.refund_id && isProviderRefundSuccessStatus(input.status)) {
    return "ambiguous";
  }
  if (input.refund_id) return "ambiguous";
  if (!input.http_ok && input.http_status >= 400 && input.http_status < 500) {
    return "declined";
  }
  return "ambiguous";
}
