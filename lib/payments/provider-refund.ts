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
 * Read the amount CyberSource echoes back on a refund.
 *
 * `POST /pts/v2/payments/{id}/refunds` answers with **refundAmountDetails**
 * (`refundAmount` + `currency`) — see the CyberSource REST model
 * PtsV2PaymentsRefundPost201Response. `creditAmountDetails` belongs to
 * standalone credits and PIN-debit credits, not to a follow-on refund.
 *
 * Reading only `creditAmountDetails` meant every successful refund failed
 * amount verification and was classified **ambiguous**: the money went back to
 * the guest, the ledger claim stayed pending, and the operator was sent to
 * Business Center to copy a reference by hand. Observed twice in production on
 * 2026-08-11 ($1 and $240). Both shapes are read now, refund first.
 */
export function readRefundResponseAmountDetails(payload: {
  refundAmountDetails?: { refundAmount?: unknown; creditAmount?: unknown; currency?: unknown } | null;
  creditAmountDetails?: { creditAmount?: unknown; currency?: unknown } | null;
  orderInformation?: { amountDetails?: AuthorizedAmountDetails } | null;
} | null | undefined): AuthorizedAmountDetails {
  const refund = payload?.refundAmountDetails;
  if (refund && typeof refund === "object") {
    const amount = refund.refundAmount ?? refund.creditAmount;
    if (amount !== undefined && amount !== null) {
      return { authorizedAmount: amount, totalAmount: amount, currency: refund.currency };
    }
  }
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
    refundAmountDetails?: { refundAmount?: unknown; creditAmount?: unknown; currency?: unknown } | null;
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
