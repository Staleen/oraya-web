/**
 * Instant booking — automatic confirmation on full payment.
 *
 * Standing Phase 16B rule: money must never confirm, approve, or cancel a
 * booking; approval is an availability decision. Instant Book is the single,
 * deliberate exception to that rule, and this module is the only place it
 * applies. It is OFF by default and every gate below must pass.
 *
 * Owner decision 2026-08-11: **full payment only**. A deposit never
 * auto-confirms — nobody receives arrival details while still owing money.
 *
 * Pure decision core: no Supabase, no Next. The caller performs the
 * availability re-check and the row-count-verified conditional update, so a
 * "confirm" here is a candidate, never a completed confirmation.
 */

export const INSTANT_AUTO_CONFIRM_SETTING_KEY = "instant_booking_auto_confirm";

export type InstantConfirmBooking = {
  status: string | null;
  villa: string | null;
  event_type: string | null;
  message: string | null;
  addons_snapshot: unknown;
  amount_paid: number | null;
  amount_total: number | null;
  check_out: string | null;
};

export type InstantConfirmSettings = {
  /** Global master switch. Default false. */
  auto_confirm_enabled: boolean;
  /** Per-villa instant booking flag (existing lib/instant-booking-settings). */
  villa_instant_enabled: boolean;
};

export type InstantConfirmSkipReason =
  | "auto_confirm_disabled"
  | "villa_not_instant"
  | "not_pending"
  | "event_inquiry"
  | "has_addons"
  | "has_special_request"
  | "total_unknown"
  | "not_paid_in_full"
  | "stay_already_over";

export type InstantConfirmDecision =
  | { confirm: true }
  | { confirm: false; reason: InstantConfirmSkipReason };

function hasAddons(snapshot: unknown): boolean {
  return Array.isArray(snapshot) && snapshot.length > 0;
}

function hasSpecialRequest(message: string | null): boolean {
  return typeof message === "string" && message.trim().length > 0;
}

function isEventInquiry(booking: InstantConfirmBooking): boolean {
  return typeof booking.event_type === "string" && booking.event_type.trim().length > 0;
}

/**
 * Decide whether a paid booking qualifies for automatic confirmation.
 * Every gate is a hard AND. Anything unknown fails closed.
 */
export function decideInstantConfirmation(input: {
  booking: InstantConfirmBooking;
  settings: InstantConfirmSettings;
  /** Today's UTC calendar date, YYYY-MM-DD (injectable for tests). */
  today_utc: string;
}): InstantConfirmDecision {
  const { booking, settings } = input;

  if (!settings.auto_confirm_enabled) return { confirm: false, reason: "auto_confirm_disabled" };
  if (!settings.villa_instant_enabled) return { confirm: false, reason: "villa_not_instant" };
  if ((booking.status ?? "").toLowerCase() !== "pending") {
    return { confirm: false, reason: "not_pending" };
  }
  if (isEventInquiry(booking)) return { confirm: false, reason: "event_inquiry" };
  if (hasAddons(booking.addons_snapshot)) return { confirm: false, reason: "has_addons" };
  if (hasSpecialRequest(booking.message)) return { confirm: false, reason: "has_special_request" };

  const total = Number(booking.amount_total);
  if (!Number.isFinite(total) || total <= 0) return { confirm: false, reason: "total_unknown" };

  const paid = Number(booking.amount_paid);
  // Full payment only. Compared in cents so float noise cannot block a guest
  // who genuinely paid everything.
  if (!Number.isFinite(paid) || Math.round(paid * 100) < Math.round(total * 100)) {
    return { confirm: false, reason: "not_paid_in_full" };
  }

  // A stay that already ended must never auto-confirm and ship arrival details.
  if (booking.check_out && booking.check_out < input.today_utc) {
    return { confirm: false, reason: "stay_already_over" };
  }

  return { confirm: true };
}

/** Owner-facing explanation for why a paid booking was not auto-confirmed. */
export function describeInstantConfirmSkip(reason: InstantConfirmSkipReason): string {
  switch (reason) {
    case "auto_confirm_disabled": return "Instant confirmation is switched off.";
    case "villa_not_instant": return "This villa does not offer instant booking.";
    case "not_pending": return "This booking was no longer awaiting approval.";
    case "event_inquiry": return "Event inquiries are always reviewed by a person.";
    case "has_addons": return "The stay includes add-ons, so it needs your review.";
    case "has_special_request": return "The guest left a special request, so it needs your review.";
    case "total_unknown": return "The stay total is not set, so payment cannot be checked against it.";
    case "not_paid_in_full": return "The stay is not paid in full.";
    case "stay_already_over": return "The stay has already ended.";
  }
}
