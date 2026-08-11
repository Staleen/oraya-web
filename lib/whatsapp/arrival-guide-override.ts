/**
 * "Send anyway" — the operator's override for an arrival guide the payment
 * gate is holding.
 *
 * The gate exists because the arrival details are the product: shipping them
 * before the deposit removes the guest's reason to pay. But an operator who
 * knows something the gate cannot — a bank transfer that lands tomorrow, a
 * friend of the family, a guest arriving tonight — must be able to release it.
 * A gate with no override becomes a gate the operator turns off entirely, and
 * then it protects nothing.
 *
 * Two rules make the override safe rather than a hole in the gate:
 *   1. It is only offered when the guide is ACTUALLY held. Offering it on a
 *      guide that already went out invites a duplicate send.
 *   2. It requires a written reason. The override is a decision about money,
 *      and a decision about money that nobody wrote down did not happen.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type ArrivalGuideOverrideContext = {
  /** Booking status, as stored. */
  status: string | null | undefined;
  /** The master gate switch. Off means nothing is ever held. */
  gateEnabled: boolean;
  /** Set once the guide has actually been dispatched. */
  whatsappConfirmationSentAt: string | null | undefined;
  amountPaid: number | null | undefined;
  amountTotal: number | null | undefined;
  depositAmount: number | null | undefined;
};

export type ArrivalGuideOverrideAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | "gate_disabled"
        | "booking_not_confirmed"
        | "already_sent"
        | "not_held";
    };

/** Minimum characters an operator must write to justify the override. */
export const OVERRIDE_REASON_MIN_LENGTH = 4;

export type OverrideReasonCheck =
  | { ok: true; reason: string }
  | { ok: false; error: "reason_required" };

export function validateOverrideReason(raw: unknown): OverrideReasonCheck {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < OVERRIDE_REASON_MIN_LENGTH) return { ok: false, error: "reason_required" };
  return { ok: true, reason };
}

/**
 * Is there a held guide to release?
 *
 * Deliberately re-derives "held" from the same inputs the gate uses rather
 * than trusting a stored flag, so the button can never disagree with the gate.
 */
export function assessArrivalGuideOverride(
  context: ArrivalGuideOverrideContext,
  decideRelease: (input: {
    enabled: boolean;
    amountPaid: number | null | undefined;
    amountTotal: number | null | undefined;
    depositAmount: number | null | undefined;
  }) => { send: boolean },
): ArrivalGuideOverrideAvailability {
  if (!context.gateEnabled) return { available: false, reason: "gate_disabled" };
  if (String(context.status ?? "").toLowerCase() !== "confirmed") {
    return { available: false, reason: "booking_not_confirmed" };
  }
  // The gate holds a guide WITHOUT consuming the at-most-once claim, so a
  // non-null timestamp means it genuinely went out. Overriding then would be
  // a second send, not a release.
  if (context.whatsappConfirmationSentAt) return { available: false, reason: "already_sent" };

  const decision = decideRelease({
    enabled: true,
    amountPaid: context.amountPaid,
    amountTotal: context.amountTotal,
    depositAmount: context.depositAmount,
  });
  if (decision.send) return { available: false, reason: "not_held" };

  return { available: true };
}

/** Operator-facing explanation for each refusal. */
export const OVERRIDE_REFUSAL_COPY: Record<
  Exclude<ArrivalGuideOverrideAvailability, { available: true }>["reason"],
  string
> = {
  gate_disabled: "The arrival-guide payment gate is off, so nothing is being held.",
  booking_not_confirmed: "Only a confirmed booking has an arrival guide to send.",
  already_sent: "This guest already has their arrival guide.",
  not_held: "This guide is not being held — the deposit has been met.",
};

/** Marks an override line in `bookings.payment_notes`. */
export const ARRIVAL_GUIDE_OVERRIDE_NOTE_PREFIX = "[arrival-guide override]";

/**
 * Append the override to the booking's payment notes.
 *
 * Appends, never replaces — the note column is the only durable record that
 * this guide went out before the money did, and overwriting it would erase
 * the previous decision. Follows the same convention as the payment reminder
 * note so the operator reads one history in one place.
 */
export function appendArrivalGuideOverrideNote(
  existingNotes: string | null | undefined,
  entry: { reason: string; by: string | null | undefined; atIso: string },
): string {
  const by = entry.by?.trim() || "ops";
  const line = `${ARRIVAL_GUIDE_OVERRIDE_NOTE_PREFIX} ${entry.atIso} · ${by} · sent before the deposit · ${entry.reason.trim()}`;
  const trimmed = existingNotes?.trim();
  return trimmed ? `${trimmed}\n${line}` : line;
}
