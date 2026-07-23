// Relative .ts imports so node:test can load this module (repo test convention).
import { roundMoney } from "../money.ts";
import {
  computeFoundationAmountDue,
  derivePaymentFoundationStage,
  getFoundationAmountTotal,
  type PaymentFoundationBookingInput,
} from "../payment-foundation.ts";

/**
 * Remediation 1.6 — pure decision core for the webhook `set_paid` transition.
 *
 * Idempotency contract: once a booking's payment link is `paid`, NO further
 * `set_paid` delivery may add to `amount_paid` — neither a duplicate delivery
 * of the same event nor a second event with a different payment_reference for
 * the same provider session. The DB write in webhook-handler.ts additionally
 * guards with `payment_link_status <> 'paid'` and checks the matched-row
 * count, so two concurrent first deliveries cannot both apply.
 * (Distinct from KNOWN_BUGS #14, which is about the unified-checkout
 * completion route's provider-call idempotency.)
 */

export type SetPaidBookingState = PaymentFoundationBookingInput & {
  payment_link_status: string | null;
  payment_reference: string | null;
  amount_paid: number | null;
  amount_total: number | null;
};

export type SetPaidDelta = {
  amount_paid: number;
  payment_reference: string | null;
  payment_received_at: string | null;
};

export type SetPaidDecision =
  | { action: "idempotent"; reason: "same_reference" | "already_paid" }
  | { action: "apply"; updatePayload: Record<string, unknown> };

export function decideSetPaidUpdate(
  booking: SetPaidBookingState,
  delta: SetPaidDelta,
): SetPaidDecision {
  if (booking.payment_link_status === "paid") {
    return {
      action: "idempotent",
      reason:
        booking.payment_reference === delta.payment_reference
          ? "same_reference"
          : "already_paid",
    };
  }

  const amountTotal = roundMoney(
    typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total)
      ? booking.amount_total
      : getFoundationAmountTotal(booking) ?? 0,
  );
  const existingAmountPaid =
    typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
      ? roundMoney(booking.amount_paid)
      : 0;
  const nextAmountPaid = roundMoney(existingAmountPaid + delta.amount_paid);
  const nextStatus = amountTotal > 0 && nextAmountPaid >= amountTotal ? "paid_in_full" : "deposit_paid";

  return {
    action: "apply",
    updatePayload: {
      payment_status: nextStatus,
      payment_stage: derivePaymentFoundationStage(nextAmountPaid, amountTotal),
      payment_method: "card_manual",
      amount_total: amountTotal,
      amount_paid: nextAmountPaid,
      amount_due: computeFoundationAmountDue(amountTotal, nextAmountPaid),
      payment_received_at: delta.payment_received_at,
      payment_reference: delta.payment_reference,
      payment_link_status: "paid",
    },
  };
}
