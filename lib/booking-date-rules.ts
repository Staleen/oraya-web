/**
 * Remediation 1.3 — route-boundary stay-date rules, applied before the pricing
 * engine in POST /api/bookings and in the member modification PATCH.
 * Pure so it can be unit-tested; the route passes today's UTC date.
 */

export const MAX_STAY_NIGHTS = 60;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC-midnight timestamp for a YYYY-MM-DD string, or null when malformed. */
function dateOnlyUtcMs(value: string): number | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function nightsBetween(checkIn: string, checkOut: string): number | null {
  const a = dateOnlyUtcMs(checkIn);
  const b = dateOnlyUtcMs(checkOut);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Today as YYYY-MM-DD in UTC (lenient for guests ahead of UTC: today is always allowed). */
export function todayIsoUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type StayDateRuleError = {
  status: 400;
  error: string;
  reason: "invalid_dates" | "past_check_in" | "stay_too_long";
};

/**
 * Returns null when the stay passes, or a 400 payload. Assumes basic format
 * and ordering checks already ran (it re-checks defensively anyway).
 */
export function validateStayDateRules(input: {
  check_in: string;
  check_out: string;
  todayIso: string;
}): StayDateRuleError | null {
  const nights = nightsBetween(input.check_in, input.check_out);
  if (nights === null || nights <= 0) {
    return { status: 400, error: "Invalid booking dates.", reason: "invalid_dates" };
  }
  if (input.check_in < input.todayIso) {
    return {
      status: 400,
      error: "Check-in date cannot be in the past.",
      reason: "past_check_in",
    };
  }
  if (nights > MAX_STAY_NIGHTS) {
    return {
      status: 400,
      error: `Stays are limited to ${MAX_STAY_NIGHTS} nights. Please contact us for longer stays.`,
      reason: "stay_too_long",
    };
  }
  return null;
}
