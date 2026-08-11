/**
 * Phase 16B M2 — one "money was recorded" event, sent at most once.
 *
 * Before this module the money layer had three different notification
 * behaviours and one silent hole (audit 2026-08-11):
 *   B1 booking card link  → guest received NOTHING
 *   B2 payment link       → receipt only when a booking was attached
 *   B3 Ops manual receipt → receipt
 *   B4 CyberSource webhook→ notified nobody, ever
 * The webhook is the only observer guaranteed to see the money (a guest who
 * closes the tab after 3DS never reaches the completion route), so it must be
 * able to notify — without becoming a second place that can produce the same
 * message.
 *
 * Contract:
 *  1. NOTHING is sent before a durable claim on the payment's identity
 *     succeeds. The claim is an insert against a unique key, so two observers
 *     of the same payment produce exactly one receipt and one alert.
 *  2. A claim that cannot be made (storage error, migration not run) sends
 *     NOTHING. A duplicate receipt is worse than a late one.
 *  3. A notification failure NEVER fails, blocks, or rolls back a payment.
 *     This module never throws.
 *  4. It sends messages about money. It changes no booking status, no payment
 *     state, and no ledger row.
 *  5. Only a recorded payment produces a guest receipt. Failed and ambiguous
 *     outcomes produce an operator alert that says so — never a guest message.
 *
 * Prior art: the at-most-once claim in
 * lib/whatsapp/confirmed-stay-notification.ts.
 *
 * Pure orchestration — relative .ts imports so node:test can load it. The
 * Supabase/email wiring lives in money-event-dispatch-server.ts.
 */

export type MoneyEventOutcome = "recorded" | "failed" | "ambiguous";

export type MoneyEventSource =
  | "booking_link"
  | "payment_link"
  | "ops_manual"
  | "webhook";

export type MoneyEvent = {
  /** Stable across every observer of the same payment. See buildMoneyNotificationKey. */
  notification_key: string;
  outcome: MoneyEventOutcome;
  source: MoneyEventSource;
  amount: number;
  currency: string;
  /** Owner-safe method label, e.g. "card", "cash", "bank_transfer". */
  method: string;
  booking_id: string | null;
  payment_request_id: string | null;
  payment_transaction_id: string | null;
  /** Provider/receipt reference. Never a token, never a PAN. */
  provider_reference: string | null;
};

export type MoneyEventClaimResult =
  /** This caller owns the notification for this payment. */
  | "claimed"
  /** Another observer already claimed it — send nothing. */
  | "already"
  /** The claim store is missing (migration not run) — send nothing. */
  | "unavailable"
  /** Any other storage failure — send nothing. */
  | "error";

export type MoneyEventDeps = {
  claim(event: MoneyEvent): Promise<MoneyEventClaimResult>;
  /** Records which messages actually went out. Best-effort, never throws. */
  markSent?(
    event: MoneyEvent,
    sent: { guest_receipt: boolean; operator_alert: boolean },
  ): Promise<void>;
  sendGuestReceipt(event: MoneyEvent): Promise<boolean>;
  sendOperatorAlert(event: MoneyEvent): Promise<boolean>;
  log(message: string, detail?: Record<string, unknown>): void;
};

export type MoneyEventResult =
  | { kind: "sent"; guest_receipt: boolean; operator_alert: boolean }
  | { kind: "already_notified" }
  | { kind: "not_claimed"; reason: Exclude<MoneyEventClaimResult, "claimed" | "already"> };

/** Build the identity two observers of the same payment will agree on. */
export function buildMoneyNotificationKey(input: {
  outcome: MoneyEventOutcome;
  provider_transaction_id?: string | null;
  payment_transaction_id?: string | null;
  idempotency_key?: string | null;
}): string | null {
  const subject =
    trimmed(input.provider_transaction_id) ??
    trimmed(input.payment_transaction_id) ??
    trimmed(input.idempotency_key);
  if (!subject) return null;
  // The outcome is part of the key: a failed attempt and a later recorded
  // payment for the same subject are two different things to say.
  return `${input.outcome}:${subject}`.slice(0, 200);
}

function trimmed(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function dispatchMoneyEvent(
  deps: MoneyEventDeps,
  event: MoneyEvent,
): Promise<MoneyEventResult> {
  if (!event.notification_key.trim()) {
    deps.log("money event has no notification key — nothing sent", {
      source: event.source,
      outcome: event.outcome,
    });
    return { kind: "not_claimed", reason: "error" };
  }

  let claim: MoneyEventClaimResult;
  try {
    claim = await deps.claim(event);
  } catch (error) {
    deps.log("money event claim threw — nothing sent", {
      source: event.source,
      outcome: event.outcome,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "not_claimed", reason: "error" };
  }

  if (claim === "already") return { kind: "already_notified" };
  if (claim !== "claimed") {
    deps.log("money event could not be claimed — nothing sent", {
      source: event.source,
      outcome: event.outcome,
      reason: claim,
    });
    return { kind: "not_claimed", reason: claim };
  }

  // Claimed. From here nothing may throw: the payment already happened.
  let guestReceipt = false;
  if (event.outcome === "recorded") {
    try {
      guestReceipt = await deps.sendGuestReceipt(event);
    } catch (error) {
      deps.log("guest receipt failed — payment is unaffected", {
        source: event.source,
        booking_id: event.booking_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (!guestReceipt) {
      deps.log("guest receipt was not sent", {
        source: event.source,
        booking_id: event.booking_id,
        payment_request_id: event.payment_request_id,
      });
    }
  }

  let operatorAlert = false;
  try {
    operatorAlert = await deps.sendOperatorAlert(event);
  } catch (error) {
    deps.log("operator alert failed — payment is unaffected", {
      source: event.source,
      outcome: event.outcome,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (deps.markSent) {
    try {
      await deps.markSent(event, {
        guest_receipt: guestReceipt,
        operator_alert: operatorAlert,
      });
    } catch (error) {
      deps.log("money notification bookkeeping failed — messages already sent", {
        source: event.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { kind: "sent", guest_receipt: guestReceipt, operator_alert: operatorAlert };
}
