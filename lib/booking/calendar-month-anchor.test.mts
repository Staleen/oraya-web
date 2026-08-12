/**
 * The money defect, pinned.
 *
 * Live on 2026-08-12: aiming at 21 Sep produced 19 Oct — 29 nights and $7,380
 * instead of 1 night and $270 — because the calendar re-anchored to the check-in
 * month after the first click and every cell moved underneath the second one.
 *
 * These tests fail if anything ever moves the months between the two clicks of
 * a range again.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking/calendar-month-anchor.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nextCalendarMonth,
  startOfCalendarMonth,
  visibleCalendarMonths,
  type CalendarMonthEvent,
} from "./calendar-month-anchor.ts";

/** "2026-09" style label, so a failure says which month rather than which epoch. */
function label(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const AUGUST = new Date(2026, 7, 1);

test("a range selection cannot produce a different month than the one clicked", () => {
  // The exact live case: two panes showing August | September, check-in
  // clicked on 21 September in the RIGHT pane.
  let displayed = AUGUST;
  assert.deepEqual(visibleCalendarMonths(displayed, 2).map(label), ["2026-08", "2026-09"]);

  displayed = nextCalendarMonth(displayed, { kind: "day_clicked" });

  // The panes the guest is aiming the SECOND click at are the same two panes.
  assert.deepEqual(
    visibleCalendarMonths(displayed, 2).map(label),
    ["2026-08", "2026-09"],
    "the months moved between the two clicks of a range — the second click now lands elsewhere",
  );

  // And the second click does not move them either.
  displayed = nextCalendarMonth(displayed, { kind: "day_clicked" });
  assert.deepEqual(visibleCalendarMonths(displayed, 2).map(label), ["2026-08", "2026-09"]);
});

test("no number of day clicks ever shifts the calendar", () => {
  let displayed = AUGUST;
  for (let i = 0; i < 25; i++) {
    displayed = nextCalendarMonth(displayed, { kind: "day_clicked" });
  }
  assert.equal(label(displayed), "2026-08");
});

test("a day click returns the same object, so React re-renders nothing", () => {
  const displayed = AUGUST;
  assert.equal(nextCalendarMonth(displayed, { kind: "day_clicked" }), displayed);
});

test("the guest's own month navigation still moves the calendar", () => {
  const displayed = nextCalendarMonth(AUGUST, { kind: "user_navigated", month: new Date(2026, 10, 14) });
  assert.equal(label(displayed), "2026-11");
  assert.equal(displayed.getDate(), 1, "navigation anchors to the first of the month");
});

test("prefilled dates still bring their month into view", () => {
  // The Butler handoff sets the month BEFORE any range exists, so it never
  // falls between two clicks.
  const displayed = nextCalendarMonth(AUGUST, { kind: "dates_prefilled", from: new Date(2027, 2, 9) });
  assert.equal(label(displayed), "2027-03");
});

test("a prefill followed by two clicks stays on the prefilled month", () => {
  const events: CalendarMonthEvent[] = [
    { kind: "dates_prefilled", from: new Date(2026, 8, 21) },
    { kind: "day_clicked" },
    { kind: "day_clicked" },
  ];
  const displayed = events.reduce(nextCalendarMonth, AUGUST);
  assert.deepEqual(visibleCalendarMonths(displayed, 2).map(label), ["2026-09", "2026-10"]);
});

test("startOfCalendarMonth normalises to local midnight on the first", () => {
  const d = startOfCalendarMonth(new Date(2026, 8, 21, 17, 45, 3));
  assert.equal(label(d), "2026-09");
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
});

test("visibleCalendarMonths rolls over a year boundary", () => {
  assert.deepEqual(
    visibleCalendarMonths(new Date(2026, 11, 1), 2).map(label),
    ["2026-12", "2027-01"],
  );
});
