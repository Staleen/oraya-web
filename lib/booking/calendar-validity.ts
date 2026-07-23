// Relative .ts import so node:test can load this module (repo test convention).
import { addDaysToDateOnly, rangesOverlap } from "../calendar/event-block.ts";

/**
 * Remediation 5.3 — the guest calendar validity rules, extracted verbatim from
 * app/book/page.tsx (stay rules) and app/events/inquiry/page.tsx (event
 * rules) into a pure, testable module. The pages build the rule set once per
 * relevant state change (useMemo) instead of re-declaring closures every
 * render — which is what forced their exhaustive-deps suppressions.
 */

export type CalendarRange = { check_in: string; check_out: string };
export type BlockedRange = { from: Date; to: Date };

/** Local-time date from YYYY-MM-DD (matches the pages' parseLocalISO). */
export function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addLocalDays(day: Date, days: number): Date {
  const next = new Date(day.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Blocked day ranges for the calendar: check_in through (check_out - 1 day)
 * inclusive, so the check_out day itself remains selectable as a new check-in.
 */
export function buildBookedRangeList(confirmedRanges: CalendarRange[]): BlockedRange[] {
  return confirmedRanges.flatMap((r) => {
    const from = parseLocalISO(r.check_in);
    const to = parseLocalISO(r.check_out);
    to.setDate(to.getDate() - 1);
    if (to < from) return [];
    return [{ from, to }];
  });
}

export type StayCalendarRules = {
  isCalendarDateBlocked: (d: Date) => boolean;
  isStayRangeAvailable: (checkInDay: Date, checkOutDay: Date) => boolean;
  hasValidCheckoutFromCheckIn: (checkInDay: Date) => boolean;
  isDeadCheckInDate: (day: Date) => boolean;
  isValidCheckoutFrom: (checkIn: Date, checkout: Date) => boolean;
};

export function createStayCalendarRules(input: {
  today: Date;
  bookedRangeList: BlockedRange[];
  minStayNights: number;
}): StayCalendarRules {
  const { today, bookedRangeList } = input;
  const effectiveMinStayNights = Math.max(1, input.minStayNights);

  function isCalendarDateBlocked(d: Date): boolean {
    if (d < today) return true;
    return bookedRangeList.some((r) => d >= r.from && d <= r.to);
  }

  function isStayRangeAvailable(checkInDay: Date, checkOutDay: Date): boolean {
    if (checkOutDay <= checkInDay) return false;
    for (
      let night = new Date(checkInDay.getTime());
      night < checkOutDay;
      night.setDate(night.getDate() + 1)
    ) {
      if (isCalendarDateBlocked(night)) return false;
    }
    return true;
  }

  function hasValidCheckoutFromCheckIn(checkInDay: Date): boolean {
    if (isCalendarDateBlocked(checkInDay)) return false;
    // Search up to one year for a checkout where every occupied night is open.
    for (let n = effectiveMinStayNights; n <= 366; n++) {
      const candidateCheckout = addLocalDays(checkInDay, n);
      if (!isCalendarDateBlocked(candidateCheckout) && isStayRangeAvailable(checkInDay, candidateCheckout)) {
        return true;
      }
    }
    return false;
  }

  function isDeadCheckInDate(day: Date): boolean {
    return !isCalendarDateBlocked(day) && !hasValidCheckoutFromCheckIn(day);
  }

  // A checkout date is valid only if every condition holds:
  // 1. checkout is strictly after check-in (minimum 1 night)
  // 2. checkout day itself is not in the middle of a blocked stay
  // 3. every night from check-in up to checkout-1 is free (continuous stay)
  function isValidCheckoutFrom(checkIn: Date, checkout: Date): boolean {
    if (checkout <= checkIn) return false;
    if (isCalendarDateBlocked(checkout)) return false;
    for (
      let night = new Date(checkIn.getTime());
      night < checkout;
      night.setDate(night.getDate() + 1)
    ) {
      if (isCalendarDateBlocked(night)) return false;
    }
    return true;
  }

  return {
    isCalendarDateBlocked,
    isStayRangeAvailable,
    hasValidCheckoutFromCheckIn,
    isDeadCheckInDate,
    isValidCheckoutFrom,
  };
}

export type EventCalendarRules = {
  isCalendarDateBlocked: (d: Date) => boolean;
  isEventOperationalSpanClear: (eventStart: Date, eventCheckout: Date) => boolean;
  incomingOperationalOverlapsConfirmed: (eventStart: Date, eventCheckout: Date) => boolean;
  isValidEventCheckoutFrom: (eventStart: Date, eventCheckout: Date) => boolean;
  hasValidEventCheckoutFromCheckIn: (checkInDay: Date) => boolean;
  isDeadEventCheckInDate: (day: Date) => boolean;
};

export function createEventCalendarRules(input: {
  today: Date;
  confirmedRanges: CalendarRange[];
  bookedRangeList: BlockedRange[];
  minEventNights: number;
}): EventCalendarRules {
  const { today, confirmedRanges, bookedRangeList, minEventNights } = input;

  function isCalendarDateBlocked(d: Date): boolean {
    if (d < today) return true;
    return bookedRangeList.some((r) => d >= r.from && d <= r.to);
  }

  /** Every calendar day in [check_in − 1, check_out) must be free — mirrors incoming event overlap in findAvailabilityConflict (event-block.ts). */
  function isEventOperationalSpanClear(eventStart: Date, eventCheckout: Date): boolean {
    if (eventCheckout <= eventStart) return false;
    const setupISO = addDaysToDateOnly(toLocalISO(eventStart), -1);
    let d = parseLocalISO(setupISO);
    for (; d < eventCheckout; d = addLocalDays(d, 1)) {
      if (isCalendarDateBlocked(d)) return false;
    }
    return true;
  }

  function incomingOperationalOverlapsConfirmed(eventStart: Date, eventCheckout: Date): boolean {
    const incomingOp = {
      check_in: addDaysToDateOnly(toLocalISO(eventStart), -1),
      check_out: toLocalISO(eventCheckout),
    };
    return confirmedRanges.some((r) =>
      rangesOverlap(incomingOp, { check_in: r.check_in, check_out: r.check_out }),
    );
  }

  function isValidEventCheckoutFrom(eventStart: Date, eventCheckout: Date): boolean {
    if (eventCheckout <= eventStart) return false;
    if (isCalendarDateBlocked(eventCheckout)) return false;
    return isEventOperationalSpanClear(eventStart, eventCheckout);
  }

  function hasValidEventCheckoutFromCheckIn(checkInDay: Date): boolean {
    const setupISO = addDaysToDateOnly(toLocalISO(checkInDay), -1);
    if (isCalendarDateBlocked(parseLocalISO(setupISO))) return false;

    for (let n = minEventNights; n <= 366; n++) {
      const candidateCheckout = addLocalDays(checkInDay, n);
      if (isValidEventCheckoutFrom(checkInDay, candidateCheckout)) return true;
    }
    return false;
  }

  function isDeadEventCheckInDate(day: Date): boolean {
    return !isCalendarDateBlocked(day) && !hasValidEventCheckoutFromCheckIn(day);
  }

  return {
    isCalendarDateBlocked,
    isEventOperationalSpanClear,
    incomingOperationalOverlapsConfirmed,
    isValidEventCheckoutFrom,
    hasValidEventCheckoutFromCheckIn,
    isDeadEventCheckInDate,
  };
}
