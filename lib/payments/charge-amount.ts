// Relative .ts import so node:test can load this module (repo test convention).
import { roundMoney } from "../money.ts";

/**
 * Remediation 2.4 — shared charge-amount resolution for the unified-checkout
 * routes (was duplicated verbatim in session + complete). Order of precedence:
 * deposit_amount, then amount_due, then amount_total; non-finite values count
 * as absent.
 */
export type ChargeAmountBookingFields = {
  deposit_amount: number | null;
  amount_due: number | null;
  amount_total: number | null;
};

export function getChargeAmount(booking: ChargeAmountBookingFields): number {
  const depositAmount =
    typeof booking.deposit_amount === "number" && Number.isFinite(booking.deposit_amount)
      ? roundMoney(booking.deposit_amount)
      : 0;
  const amountDue =
    typeof booking.amount_due === "number" && Number.isFinite(booking.amount_due)
      ? roundMoney(booking.amount_due)
      : 0;
  const amountTotal =
    typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
      ? roundMoney(booking.amount_total)
      : 0;
  return depositAmount > 0 ? depositAmount : amountDue > 0 ? amountDue : amountTotal;
}
