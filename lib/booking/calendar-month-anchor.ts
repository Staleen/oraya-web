/**
 * Which month the stay calendar shows — and the one rule that makes a range
 * selection mean what the guest aimed at.
 *
 * The defect this exists to prevent (production, 2026-08-12): `/book` re-
 * anchored the two-pane calendar to the check-in month *after* accepting the
 * first click. A guest looking at August | September who clicked 21 Sep in the
 * right pane had the panes redrawn as September | October underneath them.
 * Every cell moved. The second click — aimed at the same place on the screen —
 * landed a month later: 19 Oct instead of 22 Sep, 29 nights instead of 1,
 * $7,380 instead of $270. Nothing announced the change except a summary line.
 *
 * So: **a click on a day never moves the months.** A day the guest can click is
 * a day already on screen, so there is nothing to bring into view. Only two
 * things may move the calendar — the guest navigating it themselves, and dates
 * arriving programmatically (the WhatsApp Butler handoff), which happens
 * *before* any range exists and therefore between no two clicks.
 *
 * Pure and dependency-free so the rule is testable; `/book` is a client
 * component and its own state is not reachable from a test.
 */

/** Local-time first day of `day`'s month, midnight. Mirrors /book's startOfLocalMonth. */
export function startOfCalendarMonth(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

export type CalendarMonthEvent =
  /** The guest pressed the calendar's own next/previous month control. */
  | { kind: "user_navigated"; month: Date }
  /** The guest clicked a day cell — check-in or check-out, either one. */
  | { kind: "day_clicked" }
  /** Dates arrived from outside the calendar (Butler prefill), before a range exists. */
  | { kind: "dates_prefilled"; from: Date };

/**
 * The month the calendar should display after `event`.
 *
 * Returns `current` **by identity** for a day click, so a caller passing this
 * to a React state setter re-renders nothing.
 */
export function nextCalendarMonth(current: Date, event: CalendarMonthEvent): Date {
  switch (event.kind) {
    case "user_navigated":
      return startOfCalendarMonth(event.month);
    case "dates_prefilled":
      return startOfCalendarMonth(event.from);
    case "day_clicked":
      // The whole point. See the module note above.
      return current;
  }
}

/**
 * The months rendered left-to-right for a `paneCount`-pane calendar anchored at
 * `current` — what the guest is actually looking at.
 */
export function visibleCalendarMonths(current: Date, paneCount: number): Date[] {
  const anchor = startOfCalendarMonth(current);
  const panes = Math.max(1, Math.floor(paneCount));
  return Array.from({ length: panes }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth() + i, 1));
}
