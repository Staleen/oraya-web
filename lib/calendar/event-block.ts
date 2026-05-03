/**
 * Phase 14J — Event Availability Enforcement
 *
 * Shared helpers for date-only arithmetic and event operational blocking.
 *
 * Stay rule:
 *   stay range = [check_in, check_out)  (check_in inclusive, check_out exclusive — unchanged)
 *
 * Event rule:
 *   confirmed event creates an *operational block* range:
 *     block_start = check_in - 1 day  (previous overnight — setup/pre-event preparation)
 *     block_end   = check_out          (check_out remains exclusive — same as stays)
 *
 *   Example: event check_in=2026-06-10, check_out=2026-06-11 → block range = [2026-06-09, 2026-06-11)
 *     stay 2026-06-09 → 2026-06-10 = blocked   (overlaps the setup day)
 *     stay 2026-06-10 → 2026-06-11 = blocked   (overlaps the event day)
 *     stay 2026-06-08 → 2026-06-09 = allowed
 *     stay 2026-06-11 → 2026-06-12 = allowed
 *
 * No teardown-day blocking is applied (per business rule — explicit non-goal in 14J).
 *
 * Detection: a booking is treated as an event when both conditions hold:
 *   - event_type is non-empty
 *   - message contains the literal "[Event Inquiry]" marker
 * (Same detection used elsewhere in the codebase since Phase 13I/14B.)
 */

export interface EventDetectableRow {
  event_type?: string | null;
  message?: string | null;
}

export interface DateRange {
  check_in: string;
  check_out: string;
}

/** Date-only addition that avoids local-time / DST / timezone shifts. Uses UTC arithmetic only. */
export function addDaysToDateOnly(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Returns true if the row is classified as an event (per 13I/14B detector). */
export function isEventBookingRow(row: EventDetectableRow): boolean {
  return Boolean(row.event_type) && typeof row.message === "string" && row.message.includes("[Event Inquiry]");
}

/**
 * Returns the operational block range for a booking:
 *   - stays: original [check_in, check_out)
 *   - events: expanded [check_in - 1 day, check_out)
 */
export function getOperationalRange(row: EventDetectableRow & DateRange): DateRange {
  if (isEventBookingRow(row)) {
    return {
      check_in: addDaysToDateOnly(row.check_in, -1),
      check_out: row.check_out,
    };
  }
  return { check_in: row.check_in, check_out: row.check_out };
}

/**
 * Standard half-open range overlap on date-only strings (lexicographic compare is correct for YYYY-MM-DD).
 *   a = [a.check_in, a.check_out), b = [b.check_in, b.check_out)
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.check_in < b.check_out && b.check_in < a.check_out;
}
