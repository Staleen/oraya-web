/**
 * Payment gate for the WhatsApp Arrival Guide.
 *
 * The arrival details ARE the product. Shipping them before the deposit
 * removes the guest's reason to pay. Live evidence 2026-08-11: 20 confirmed
 * bookings were unpaid, and three of them had already received the Arrival
 * Guide having paid nothing.
 *
 * Approval stays an availability decision — this gate never changes a booking
 * status and never blocks the confirmation email. It holds one deliverable.
 *
 * Off by default: with the setting unset, behaviour is byte-for-byte what it
 * was before this module existed.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export const ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY = "payment_gated_arrival_guide";

export type ArrivalGuideGateInput = {
  /** Master switch. Off means never hold. */
  enabled: boolean;
  amountPaid: number | null | undefined;
  amountTotal: number | null | undefined;
  /** The deposit Oraya asked for, when one was set. */
  depositAmount: number | null | undefined;
  /** Operator override — send this one regardless. */
  overrideSend?: boolean;
};

export type ArrivalGuideGateDecision =
  | { send: true }
  | { send: false; reason: "awaiting_deposit" };

/**
 * Decide whether the arrival guide may go out yet.
 *
 * The threshold is the deposit when one is set, otherwise the full total.
 * An unknown threshold never holds — a gate that guesses would silence a
 * legitimate guest, which is worse than sending early.
 */
export function decideArrivalGuideRelease(
  input: ArrivalGuideGateInput,
): ArrivalGuideGateDecision {
  if (!input.enabled) return { send: true };
  if (input.overrideSend) return { send: true };

  const deposit = Number(input.depositAmount);
  const total = Number(input.amountTotal);
  const threshold =
    Number.isFinite(deposit) && deposit > 0
      ? deposit
      : Number.isFinite(total) && total > 0
        ? total
        : null;

  // Nothing to measure against — never hold on a guess.
  if (threshold === null) return { send: true };

  const paid = Number(input.amountPaid);
  const paidCents = Number.isFinite(paid) ? Math.round(paid * 100) : 0;
  if (paidCents >= Math.round(threshold * 100)) return { send: true };

  return { send: false, reason: "awaiting_deposit" };
}

/** Owner-facing copy for a held guide. */
export const ARRIVAL_GUIDE_HELD_LABEL = "Arrival guide held — awaiting deposit";
