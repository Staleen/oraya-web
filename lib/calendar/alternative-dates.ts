/**
 * Phase 14K — Alternative Date Suggestions
 *
 * Admin-only, purely client-side helper. No server calls, no schema changes.
 *
 * Given a blocked booking (stay or event inquiry) and the list of confirmed
 * bookings for that villa, returns up to 3 safe alternative date ranges:
 *   1. Previous — nearest free window ending on or before check_in
 *   2. Next     — nearest free window starting on or after check_out
 *   3. Same weekday next week — check_in + 7 days (same dow), same duration
 *
 * Event operational rules from 14J are respected:
 *   - incoming event: operational range = [check_in - 1, check_out)
 *   - confirmed event: operational range = [check_in - 1, check_out)
 *   Both expansions are applied before the overlap test.
 */

import {
  addDaysToDateOnly,
  getOperationalRange,
  rangesOverlap,
  type DateRange,
} from "./event-block";

export interface AlternativeSuggestion {
  label: "Previous" | "Next" | "Same weekday next week";
  check_in: string;
  check_out: string;
  reason: string;
}

interface ConfirmedRow {
  id?: string | null;
  villa: string;
  check_in: string;
  check_out: string;
  event_type: string | null;
  message: string | null;
}

export interface FindAlternativesInput {
  villa: string;
  check_in: string;
  check_out: string;
  /** True when the blocked booking is itself an event inquiry. */
  isEvent: boolean;
  /** All confirmed bookings across all villas — filtered internally to the requested villa. */
  confirmedBookings: ConfirmedRow[];
  /** ID of the booking being analyzed — excluded from conflict tests. */
  excludeBookingId?: string | null;
}

/** Duration in whole days between two YYYY-MM-DD date strings. */
function durationDays(checkIn: string, checkOut: string): number {
  const parseMs = (iso: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return 0;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  return Math.round((parseMs(checkOut) - parseMs(checkIn)) / 86_400_000);
}

/** Returns true if a candidate window is free from all confirmed blockers. */
function isCandidateFree(
  candidateIn: string,
  candidateOut: string,
  isEvent: boolean,
  blockers: ConfirmedRow[],
): boolean {
  const candidateRange: DateRange = isEvent
    ? { check_in: addDaysToDateOnly(candidateIn, -1), check_out: candidateOut }
    : { check_in: candidateIn, check_out: candidateOut };

  for (const blocker of blockers) {
    const blockerRange = getOperationalRange(blocker);
    if (rangesOverlap(candidateRange, blockerRange)) return false;
  }
  return true;
}

/**
 * Returns up to 3 safe alternative date ranges for a blocked booking.
 * Pure function — no side effects, no async, no server calls.
 */
export function findAlternativeDateSuggestions(
  input: FindAlternativesInput,
): AlternativeSuggestion[] {
  const { villa, check_in, check_out, isEvent, confirmedBookings, excludeBookingId } = input;

  const blockers = confirmedBookings.filter(
    (b) => b.villa === villa && b.id !== excludeBookingId,
  );

  const duration = durationDays(check_in, check_out);
  if (duration <= 0) return [];

  const suggestions: AlternativeSuggestion[] = [];

  // 1. Previous: scan backward — find nearest free window ending on or before check_in
  {
    let candidateOut = check_in;
    let found = false;
    for (let attempt = 0; attempt < 60 && !found; attempt++) {
      const candidateIn = addDaysToDateOnly(candidateOut, -duration);
      if (isCandidateFree(candidateIn, candidateOut, isEvent, blockers)) {
        suggestions.push({
          label: "Previous",
          check_in: candidateIn,
          check_out: candidateOut,
          reason: "Available slot before requested dates",
        });
        found = true;
      } else {
        candidateOut = addDaysToDateOnly(candidateOut, -1);
      }
    }
  }

  // 2. Next: scan forward — find nearest free window starting on or after check_out
  {
    let candidateIn = check_out;
    let found = false;
    for (let attempt = 0; attempt < 60 && !found; attempt++) {
      const candidateOut = addDaysToDateOnly(candidateIn, duration);
      if (isCandidateFree(candidateIn, candidateOut, isEvent, blockers)) {
        suggestions.push({
          label: "Next",
          check_in: candidateIn,
          check_out: candidateOut,
          reason: "Available slot after requested dates",
        });
        found = true;
      } else {
        candidateIn = addDaysToDateOnly(candidateIn, 1);
      }
    }
  }

  // 3. Same weekday next week: check_in + 7 days, same duration
  {
    const candidateIn = addDaysToDateOnly(check_in, 7);
    const candidateOut = addDaysToDateOnly(candidateIn, duration);
    const alreadyCovered = suggestions.some(
      (s) => s.check_in === candidateIn && s.check_out === candidateOut,
    );
    if (!alreadyCovered && isCandidateFree(candidateIn, candidateOut, isEvent, blockers)) {
      suggestions.push({
        label: "Same weekday next week",
        check_in: candidateIn,
        check_out: candidateOut,
        reason: "Same day of week, one week later",
      });
    }
  }

  return suggestions.slice(0, 3);
}
