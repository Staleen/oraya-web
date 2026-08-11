/**
 * One honest line per booking: approval AND money, never one hiding the other.
 *
 * Live incident 2026-08-11: `app/ops/bookings/page.tsx` returned
 * "Awaiting your approval" for any pending stay **before** it looked at money,
 * so a fully paid booking was indistinguishable from an unpaid one. The
 * operator concluded a real $240 card payment had not registered and recorded
 * a manual $240 on top.
 *
 * Rules encoded here:
 *  1. A pending booking still says it needs approval — that is true and
 *     actionable — but it also says what has been paid.
 *  2. "Paid in full" is never claimed from a NULL or zero total. Money with no
 *     total to measure it against is "payment recorded", not "settled".
 *  3. A cancelled booking holding money is the loudest state on the screen.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

import { roundMoney } from "../money.ts";

export type BookingStateTone = "ok" | "warn" | "bad" | "info" | "neutral";

export type BookingStateLine = {
  tone: BookingStateTone;
  /** Approval half — what the operator must decide. */
  label: string;
  /** Money half — null when there is nothing worth saying. */
  money: string | null;
};

export type BookingStateInput = {
  status: string | null | undefined;
  amountPaid: number | null | undefined;
  amountTotal: number | null | undefined;
  refundedAt: string | null | undefined;
};

function money(value: number): string {
  return `USD ${roundMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Describes money without ever asserting more than the numbers support. */
export function describeBookingMoney(input: BookingStateInput): string | null {
  const paid = Number(input.amountPaid);
  const total = Number(input.amountTotal);
  const hasPaid = Number.isFinite(paid) && paid > 0;
  const hasTotal = Number.isFinite(total) && total > 0;

  if (!hasPaid) return hasTotal ? `${money(total)} outstanding` : null;

  // Money exists but no total to measure it against — say only what is true.
  if (!hasTotal) return `${money(paid)} received`;

  const outstanding = roundMoney(total - paid);
  if (Math.round(outstanding * 100) <= 0) return `Paid in full · ${money(paid)}`;
  return `${money(paid)} of ${money(total)} · ${money(outstanding)} outstanding`;
}

export function describeBookingState(input: BookingStateInput): BookingStateLine {
  const status = (input.status ?? "").toLowerCase();
  const paid = Number(input.amountPaid);
  const hasPaid = Number.isFinite(paid) && paid > 0;
  const moneyLine = describeBookingMoney(input);

  if (status === "cancelled") {
    return hasPaid && !input.refundedAt
      ? { tone: "bad", label: "Cancelled — refund owed", money: moneyLine }
      : { tone: "neutral", label: "Cancelled", money: moneyLine };
  }

  if (status === "pending") {
    // Still needs approval — but never hide what has been paid.
    return { tone: "warn", label: "Awaiting your approval", money: moneyLine };
  }

  const total = Number(input.amountTotal);
  const hasTotal = Number.isFinite(total) && total > 0;
  if (hasTotal && hasPaid && Math.round((total - paid) * 100) <= 0) {
    return { tone: "ok", label: "Confirmed", money: moneyLine };
  }
  if (hasPaid) return { tone: "info", label: "Confirmed", money: moneyLine };
  return { tone: "info", label: "Confirmed", money: moneyLine };
}
