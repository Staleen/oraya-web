/**
 * Pure helpers for easy card refund UX (provider-executed or already done in BC).
 */

import { roundMoney } from "../money.ts";

export const PROVIDER_REFUND_SUCCESS_STATUSES = [
  "PENDING",
  "TRANSMITTED",
  "SETTLED",
  "COMPLETED",
  "REFUNDED",
] as const;

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
