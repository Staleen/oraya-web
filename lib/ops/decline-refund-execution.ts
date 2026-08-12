/**
 * Declining a stay the guest already paid for returns their money as part of
 * declining — not as a second errand somebody has to remember.
 *
 * This joins the two halves that already exist and does nothing else:
 *   - lib/ops/decline-refund.ts   decides WHETHER to refund (and says why not)
 *   - lib/payments/execute-refund.ts  performs ONE refund with the full
 *     claim-before-provider contract
 *
 * Standing decisions this module implements (David, 2026-08-12):
 *
 *  - ORDER. The caller writes `cancelled` FIRST and only then calls this. A
 *    failed refund must never roll the booking back to confirmed — that would
 *    re-block the calendar and contradict what the guest was already told. So
 *    this module NEVER writes booking status, and never throws into the
 *    decline path: every failure is a returned value the operator can act on.
 *  - PER CHARGE. Every confirmed card payment on the booking is refunded
 *    NEWEST FIRST, each as its own call with its own deterministic key.
 *    Execution STOPS at the first non-success and records what actually
 *    happened — pressing on after an unproven outcome is how money moves twice.
 *  - UNSETTLED AUTHORIZATION. `requires_void` is reported, never actioned. An
 *    unreleased authorization expires on its own; firing a second money
 *    instrument on an unattended path is out of scope.
 *
 * Dependencies are injected (prior art: lib/payments/execute-refund.ts) so every
 * branch is reachable from node:test. Relative .ts imports, no node built-ins,
 * so the module also loads in the client bundle for the confirmation copy.
 */

import { decideDeclineRefund, type DeclineRefundDecision } from "./decline-refund.ts";
import type { CardRefundInput, RefundCurrency, RefundExecution } from "../payments/execute-refund.ts";

/**
 * A card payment recorded on the booking's ledger, as this module needs it.
 * `effective_at` is what "newest first" is ordered by.
 */
export type DeclineRefundCharge = {
  payment_transaction_id: string;
  amount: number;
  currency: RefundCurrency;
  effective_at: string;
};

export type DeclineRefundAttempt = {
  payment_transaction_id: string;
  amount: number;
  currency: RefundCurrency;
  /** Exactly what executeCardRefund returned. Nothing is re-interpreted here. */
  execution: RefundExecution;
};

export type DeclineRefundNotAttemptedReason =
  | "nothing_paid"
  | "already_refunded"
  | "refund_in_flight"
  | "not_automatically_refundable";

export type DeclineRefundExecution =
  /** The decision half said no. The stay is still cancelled by the caller. */
  | {
      kind: "not_attempted";
      reason: DeclineRefundNotAttemptedReason;
      /** decideDeclineRefund's own operator sentence, or null when there is nothing to say. */
      operator_note: string | null;
    }
  /**
   * The booking says card money was taken, but no confirmed card charge is on
   * the ledger to return. Never silent: a guest cancelled and not refunded is
   * the exact failure this feature exists to prevent.
   */
  | { kind: "no_charges_found"; expected_amount: number }
  /** The ledger could not be read. Nothing was attempted. */
  | { kind: "lookup_failed" }
  /** Every charge came back successful. */
  | {
      kind: "completed";
      attempts: DeclineRefundAttempt[];
      refunded_amount: number;
      currency: RefundCurrency | null;
    }
  /** Stopped at the first non-success. Earlier attempts already succeeded. */
  | {
      kind: "stopped";
      attempts: DeclineRefundAttempt[];
      refunded_amount: number;
      stopped_on: DeclineRefundAttempt;
      /** The provider says this authorization never settled — release the hold by hand. */
      requires_void: boolean;
      /** Charges never reached because execution stopped. */
      not_attempted_count: number;
    }
  /**
   * The refund sequence itself threw. executeCardRefund is documented never to,
   * but the stay is already cancelled by the time this runs, so an exception
   * here must become a reported value rather than a 500 on the decline.
   */
  | {
      kind: "errored";
      attempts: DeclineRefundAttempt[];
      refunded_amount: number;
      payment_transaction_id: string;
    };

export type DeclineRefundDeps = {
  /** Confirmed card payments on this booking, in any order. */
  loadCardCharges(
    bookingId: string,
  ): Promise<{ ok: true; charges: DeclineRefundCharge[] } | { ok: false; error?: string | null }>;
  executeRefund(input: CardRefundInput): Promise<RefundExecution>;
  /** Hex digest. Injected so this module stays free of node built-ins. */
  hash(input: string): string;
  log?(message: string, detail?: unknown): void;
};

export type DeclineRefundExecutionInput = {
  booking_id: string;
  amount_paid: number | null;
  refund_amount: number | null;
  refund_status: string | null;
  /** `bookings.payment_method` as stored. See normalizeBookingPaymentMethod. */
  payment_method: string | null;
  /** `bookings.payment_link_provider` as stored. */
  payment_provider: string | null;
  staff_id: string | null;
};

/**
 * `bookings.payment_method` stores **`card_manual`** for every card payment —
 * it is what decideSetPaidUpdate writes (lib/payments/webhook-set-paid.ts) and
 * what every live card booking carries. decideDeclineRefund recognises only
 * `card` and `apple_pay`, so passing the stored value straight through would
 * refuse to refund every genuine card payment.
 *
 * The mapping happens HERE, at the call site, rather than by editing the
 * decision module: `card_manual` is a card payment through the provider, which
 * is exactly what that module documents as automatically refundable.
 */
export function normalizeBookingPaymentMethod(method: string | null | undefined): string {
  const value = String(method ?? "").trim().toLowerCase();
  if (value === "apple_pay") return "apple_pay";
  // card, card_manual, and any future card_* the set-paid writer introduces.
  if (value === "card" || value.startsWith("card_")) return "card";
  return value;
}

/**
 * The decision, taken on booking fields alone. Exported so the decline
 * confirmation UI states the same consequence the server will act on, from one
 * definition rather than two.
 */
export function decideDeclineRefundForBooking(input: {
  amount_paid: number | null | undefined;
  refund_amount: number | null | undefined;
  refund_status: string | null | undefined;
  payment_method: string | null | undefined;
  payment_provider: string | null | undefined;
}): DeclineRefundDecision {
  return decideDeclineRefund({
    amountPaid: input.amount_paid,
    refundAmount: input.refund_amount,
    refundStatus: input.refund_status,
    method: normalizeBookingPaymentMethod(input.payment_method),
    provider: input.payment_provider,
  });
}

/**
 * Deterministic, so a double-clicked decline cannot become two refunds.
 *
 * The key is capped at 50 characters by the refund route's own contract AND is
 * sent to CyberSource as the merchant reference, so a raw UUID pair does not
 * fit. `oraya-dcl-` (10) + 32 hex characters = 42, comfortably inside the cap,
 * and 128 bits of digest is not going to collide across one booking's charges.
 *
 * Keyed on the payment transaction, not the attempt, so retrying a decline
 * lands on the same key and the ledger's own idempotency absorbs it.
 */
export function declineRefundIdempotencyKey(
  hash: (input: string) => string,
  bookingId: string,
  paymentTransactionId: string,
): string {
  return `oraya-dcl-${hash(`decline:${bookingId}:${paymentTransactionId}`).slice(0, 32)}`;
}

/** `refunded` and `idempotent` both mean the money is back (or already was). */
function isSuccess(execution: RefundExecution): boolean {
  return execution.kind === "refunded" || execution.kind === "idempotent";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Refund every confirmed card payment on a booking that has just been
 * cancelled. Never writes booking status, never retries, never throws.
 */
export async function runDeclineRefund(
  input: DeclineRefundExecutionInput,
  deps: DeclineRefundDeps,
): Promise<DeclineRefundExecution> {
  const decision = decideDeclineRefundForBooking({
    amount_paid: input.amount_paid,
    refund_amount: input.refund_amount,
    refund_status: input.refund_status,
    payment_method: input.payment_method,
    payment_provider: input.payment_provider,
  });

  if (!decision.refund) {
    return {
      kind: "not_attempted",
      reason: decision.reason,
      operator_note: decision.operatorNote,
    };
  }

  let loaded: Awaited<ReturnType<DeclineRefundDeps["loadCardCharges"]>>;
  try {
    loaded = await deps.loadCardCharges(input.booking_id);
  } catch (error) {
    deps.log?.("card charge lookup threw", error);
    return { kind: "lookup_failed" };
  }
  if (!loaded.ok) {
    deps.log?.("could not read the booking's card charges", { error: loaded.error });
    return { kind: "lookup_failed" };
  }

  // Newest first: the most recent charge is the one the guest remembers, and
  // the one most likely to still be inside the provider's refund window.
  const charges = [...loaded.charges].sort((a, b) => {
    if (a.effective_at === b.effective_at) {
      return a.payment_transaction_id < b.payment_transaction_id ? 1 : -1;
    }
    return a.effective_at < b.effective_at ? 1 : -1;
  });

  if (charges.length === 0) {
    return { kind: "no_charges_found", expected_amount: decision.amount };
  }

  const attempts: DeclineRefundAttempt[] = [];
  let refunded = 0;

  for (let index = 0; index < charges.length; index += 1) {
    const charge = charges[index];
    let execution: RefundExecution;
    try {
      execution = await deps.executeRefund({
        payment_transaction_id: charge.payment_transaction_id,
        amount: charge.amount,
        idempotency_key: declineRefundIdempotencyKey(
          deps.hash,
          input.booking_id,
          charge.payment_transaction_id,
        ),
        staff_id: input.staff_id,
        notes: "Refunded automatically when the booking was declined",
      });
    } catch (error) {
      // The stay is already cancelled. Never turn this into a thrown decline.
      deps.log?.("refund execution threw", {
        payment_transaction_id: charge.payment_transaction_id,
        error,
      });
      return {
        kind: "errored",
        attempts,
        refunded_amount: round(refunded),
        payment_transaction_id: charge.payment_transaction_id,
      };
    }

    const attempt: DeclineRefundAttempt = {
      payment_transaction_id: charge.payment_transaction_id,
      amount: charge.amount,
      currency: charge.currency,
      execution,
    };
    attempts.push(attempt);

    if (!isSuccess(execution)) {
      deps.log?.("decline refund stopped on a non-success outcome", {
        payment_transaction_id: charge.payment_transaction_id,
        kind: execution.kind,
      });
      return {
        kind: "stopped",
        attempts,
        refunded_amount: round(refunded),
        stopped_on: attempt,
        requires_void: execution.kind === "requires_void",
        not_attempted_count: charges.length - index - 1,
      };
    }

    // `idempotent` means the ledger already held this refund — the money is
    // back, but this decline did not move it, so it is not counted again.
    if (execution.kind === "refunded") refunded += execution.amount;
  }

  return {
    kind: "completed",
    attempts,
    refunded_amount: round(refunded),
    currency: charges[0]?.currency ?? null,
  };
}
