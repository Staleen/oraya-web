/**
 * What happens to a guest's chosen dates when they leave the calendar.
 *
 * Two production defects, both 2026-08-12 (KNOWN_BUGS #27.1 and #27.2):
 *
 *  1. Switching villa **silently discarded the dates**. A 21-night selection
 *     and its $5,850 estimate vanished with no notice. The dates are the
 *     guest's work, not the villa's — a guest comparing two villas should not
 *     be re-picking September every time they look.
 *
 *  2. A **half-finished** range survived everything. Check-in chosen, no
 *     check-out, and the next click anywhere — after a villa change, after
 *     stepping forward and back — was read as the check-out. Live, a click
 *     meant as a fresh check-in produced a 4-night, $990 stay nobody chose.
 *
 * The rules pull in opposite directions and the distinction is exactly the
 * point: a **complete** range is a decision worth carrying, and a **pending**
 * one is a half-typed sentence. Carry the first, drop the second, and never do
 * either one silently.
 *
 * Pure and dependency-free — `/book` is a client component whose state no test
 * can reach, and these decide what a guest is buying.
 */

/** A stay selection as `/book` holds it: date-only ISO strings, check-out optional. */
export type StaySelection = {
  check_in: string;
  /** Absent while the guest has clicked a check-in and not yet a check-out. */
  check_out?: string | null;
};

export type SelectionOutcome =
  /** Nothing was selected; nothing to do. */
  | { kind: "none" }
  /** A complete range, still available at the new villa. Carried over. */
  | { kind: "kept"; check_in: string; check_out: string }
  /** A check-in with no check-out. Dropped so it cannot absorb a later click. */
  | { kind: "cleared_incomplete"; check_in: string }
  /** A complete range the new villa cannot host. Dropped, and said out loud. */
  | { kind: "cleared_unavailable"; check_in: string; check_out: string };

function complete(selection: StaySelection | null | undefined): { check_in: string; check_out: string } | null {
  const checkIn = selection?.check_in?.trim();
  const checkOut = selection?.check_out?.trim();
  if (!checkIn || !checkOut) return null;
  if (checkOut <= checkIn) return null;
  return { check_in: checkIn, check_out: checkOut };
}

/**
 * What to do with the current selection once the villa has changed and the new
 * villa's availability has settled.
 *
 * `isRangeAvailable` is the page's existing calendar rule, unchanged and
 * injected — this module decides policy, never availability.
 */
export function decideSelectionAfterVillaChange(
  selection: StaySelection | null | undefined,
  isRangeAvailable: (checkIn: string, checkOut: string) => boolean,
): SelectionOutcome {
  const checkIn = selection?.check_in?.trim();
  if (!checkIn) return { kind: "none" };

  const range = complete(selection);
  if (!range) return { kind: "cleared_incomplete", check_in: checkIn };

  return isRangeAvailable(range.check_in, range.check_out)
    ? { kind: "kept", ...range }
    : { kind: "cleared_unavailable", ...range };
}

/**
 * Whether a selection must be dropped because the guest is leaving the
 * calendar — moving to another step, or switching villa. Only a half-finished
 * range is dropped; a complete one is a decision and travels with them.
 *
 * Deliberately NOT applied to month navigation: paging forward to reach a
 * check-out in a later month is the normal way to book across a month
 * boundary, and is not leaving the calendar.
 */
export function shouldClearOnLeavingCalendar(selection: StaySelection | null | undefined): boolean {
  const checkIn = selection?.check_in?.trim();
  if (!checkIn) return false;
  return complete(selection) === null;
}

/**
 * The sentence the guest reads. Never returns empty for an outcome that lost
 * something — "cleared silently" is the defect, so silence is not on the menu.
 */
export function describeSelectionOutcome(
  outcome: SelectionOutcome,
  villa: string,
  formatDate: (iso: string) => string,
): string {
  switch (outcome.kind) {
    case "none":
    case "kept":
      return "";
    case "cleared_incomplete":
      return `Your check-in date (${formatDate(outcome.check_in)}) was cleared because you did not choose a check-out. Please select your dates again.`;
    case "cleared_unavailable":
      return `${villa} is not available ${formatDate(outcome.check_in)} – ${formatDate(outcome.check_out)}. Your dates were cleared — please choose new ones for this villa.`;
  }
}
