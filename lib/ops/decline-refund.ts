/**
 * Declining a stay the guest already paid for.
 *
 * With instant booking OFF, a guest can pay and the booking still waits for
 * the owner's approval — money in hand, decision outstanding. If the owner
 * then declines, the guest is holding a cancelled booking and Oraya is holding
 * their money until somebody remembers to press Refund. That gap is where a
 * guest gets cancelled and left out of pocket. Reported 2026-08-12.
 *
 * So declining returns the money as part of declining. Not a second errand.
 *
 * This module only DECIDES; the caller performs the refund through the same
 * provider path an operator would use, so there is one refund implementation
 * and one set of guarantees.
 *
 * Fails closed in every uncertain direction — an unknown amount, a refund
 * already under way, or money taken by a route Oraya cannot reverse all mean
 * "do not attempt", and the operator is told to handle it by hand. A missed
 * automatic refund is recoverable; a wrong one is somebody else's money.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type DeclineRefundInput = {
  /** Money recorded against the booking. */
  amountPaid: number | null | undefined;
  /** Already returned, if anything. */
  refundAmount: number | null | undefined;
  /** `bookings.refund_status`. */
  refundStatus: string | null | undefined;
  /**
   * How the money arrived. Only a card payment through the provider can be
   * returned automatically; cash and bank transfers are outside Oraya.
   */
  method: string | null | undefined;
  provider: string | null | undefined;
};

export type DeclineRefundDecision =
  | { refund: true; amount: number }
  | {
      refund: false;
      reason: "nothing_paid" | "already_refunded" | "refund_in_flight" | "not_automatically_refundable";
      /** Shown to the operator. Null when there is simply nothing to say. */
      operatorNote: string | null;
    };

function money(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function decideDeclineRefund(input: DeclineRefundInput): DeclineRefundDecision {
  const paid = money(input.amountPaid);
  if (paid <= 0) {
    return { refund: false, reason: "nothing_paid", operatorNote: null };
  }

  const status = String(input.refundStatus ?? "").trim().toLowerCase();
  if (status === "pending" || status === "processing") {
    return {
      refund: false,
      reason: "refund_in_flight",
      operatorNote:
        "A refund is already under way on this booking. Declining will not start a second one — check Payments once it settles.",
    };
  }

  const outstanding = paid - money(input.refundAmount);
  if (outstanding <= 0) {
    return { refund: false, reason: "already_refunded", operatorNote: null };
  }

  const method = String(input.method ?? "").trim().toLowerCase();
  const provider = String(input.provider ?? "").trim().toLowerCase();
  const automatic = provider === "credit_libanais" && (method === "card" || method === "apple_pay");
  if (!automatic) {
    return {
      refund: false,
      reason: "not_automatically_refundable",
      operatorNote:
        "This guest did not pay by card, so Oraya cannot return the money itself. Declining will cancel the stay — you must return the payment the same way it arrived.",
    };
  }

  return { refund: true, amount: Number(outstanding.toFixed(2)) };
}

/** What the decline confirmation should promise, before anything is sent. */
export function describeDeclineRefund(
  decision: DeclineRefundDecision,
  currency = "USD",
): string {
  if (decision.refund) {
    return `Declining will also refund ${currency} ${decision.amount.toFixed(2)} to the guest's card.`;
  }
  return decision.operatorNote ?? "No money has been taken for this booking.";
}
