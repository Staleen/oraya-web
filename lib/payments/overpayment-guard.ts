/**
 * Recording money on a booking that is already settled.
 *
 * Live incident 2026-08-11: a $240 card payment was recorded correctly, but the
 * Ops booking list shows "Awaiting your approval" for a pending stay and never
 * shows its payment state — so the operator believed the payment had not
 * registered and recorded a manual $240 on top. The booking then read $480
 * against a $240 total. Nothing objected, because the ledger's concurrency
 * guard only checks that `expected_amount_paid` still matches; it has no
 * opinion about a booking that is already paid in full.
 *
 * Rule: money may not be recorded onto a booking that is already fully paid.
 * Correcting a mistake is Reverse, not another payment. Partial top-ups on a
 * part-paid booking are untouched — only the already-settled case is refused.
 *
 * Pure helper — relative .ts imports so node:test can load it.
 */

import { roundMoney } from "../money.ts";

export type OverpaymentDecision =
  | { allowed: true }
  | { allowed: false; reason: "already_paid_in_full"; message: string };

export function decideManualPaymentAllowed(input: {
  /** Money already recorded on the booking. */
  amountPaid: number | null | undefined;
  /** The stay total, when it is known. */
  amountTotal: number | null | undefined;
  /** The amount about to be recorded. */
  amount: number;
  /** Operator override — deliberate over-payment, e.g. an extra service. */
  allowOverpayment?: boolean;
}): OverpaymentDecision {
  if (input.allowOverpayment) return { allowed: true };

  const total = Number(input.amountTotal);
  const paid = Number(input.amountPaid);
  // An unknown or zero total cannot prove anything — never block on a guess.
  if (!Number.isFinite(total) || total <= 0) return { allowed: true };
  if (!Number.isFinite(paid) || paid <= 0) return { allowed: true };

  // Compared in cents so float noise cannot block a legitimate top-up.
  if (Math.round(paid * 100) < Math.round(total * 100)) return { allowed: true };

  return {
    allowed: false,
    reason: "already_paid_in_full",
    message:
      `This booking is already paid in full — ${formatUsd(paid)} of ${formatUsd(total)} is recorded. ` +
      `Recording another ${formatUsd(roundMoney(input.amount))} would put it over the total. ` +
      `If an earlier entry was wrong, reverse that entry instead of adding a new one.`,
  };
}

function formatUsd(value: number): string {
  return `USD ${roundMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
