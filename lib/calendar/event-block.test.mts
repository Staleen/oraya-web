/**
 * Remediation 3.2 — availability overlap semantics, including the event
 * operational-range expansion that findAvailabilityConflict builds on.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/calendar/event-block.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDaysToDateOnly,
  getOperationalRange,
  isEventBookingRow,
  rangesOverlap,
} from "./event-block.ts";

test("rangesOverlap: half-open [check_in, check_out) semantics", () => {
  const a = { check_in: "2026-08-10", check_out: "2026-08-13" };
  // back-to-back: checkout day == next check-in day → NOT a conflict
  assert.equal(rangesOverlap(a, { check_in: "2026-08-13", check_out: "2026-08-15" }), false);
  assert.equal(rangesOverlap(a, { check_in: "2026-08-07", check_out: "2026-08-10" }), false);
  // one shared night → conflict
  assert.equal(rangesOverlap(a, { check_in: "2026-08-12", check_out: "2026-08-14" }), true);
  // containment and identity → conflict
  assert.equal(rangesOverlap(a, { check_in: "2026-08-11", check_out: "2026-08-12" }), true);
  assert.equal(rangesOverlap(a, a), true);
  // disjoint → no conflict
  assert.equal(rangesOverlap(a, { check_in: "2026-08-20", check_out: "2026-08-22" }), false);
});

test("addDaysToDateOnly crosses month/year boundaries correctly", () => {
  assert.equal(addDaysToDateOnly("2026-08-01", -1), "2026-07-31");
  assert.equal(addDaysToDateOnly("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysToDateOnly("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToDateOnly("2028-02-28", 1), "2028-02-29"); // leap year
});

test("isEventBookingRow requires event_type AND the [Event Inquiry] marker", () => {
  assert.equal(
    isEventBookingRow({ event_type: "wedding", message: "x [Event Inquiry] y" }),
    true,
  );
  assert.equal(isEventBookingRow({ event_type: "wedding", message: "no marker" }), false);
  assert.equal(isEventBookingRow({ event_type: null, message: "[Event Inquiry]" }), false);
  assert.equal(isEventBookingRow({ event_type: null, message: null }), false);
});

test("getOperationalRange: events expand one setup day before check-in; stays don't", () => {
  const event = getOperationalRange({
    check_in: "2026-08-10",
    check_out: "2026-08-12",
    event_type: "wedding",
    message: "[Event Inquiry]",
  });
  assert.deepEqual(
    { check_in: event.check_in, check_out: event.check_out },
    { check_in: "2026-08-09", check_out: "2026-08-12" },
  );

  const stay = getOperationalRange({
    check_in: "2026-08-10",
    check_out: "2026-08-12",
    event_type: null,
    message: null,
  });
  assert.deepEqual(
    { check_in: stay.check_in, check_out: stay.check_out },
    { check_in: "2026-08-10", check_out: "2026-08-12" },
  );
});

test("event expansion makes a stay ending on the event's check-in day conflict", () => {
  // Stay checks out 08-10; event starts 08-10 → operational event range starts
  // 08-09, so the stay's last night (08-09→08-10) collides with setup day.
  const stay = { check_in: "2026-08-08", check_out: "2026-08-10" };
  const eventOperational = getOperationalRange({
    check_in: "2026-08-10",
    check_out: "2026-08-12",
    event_type: "wedding",
    message: "[Event Inquiry]",
  });
  assert.equal(rangesOverlap(stay, eventOperational), true);

  // Without event expansion the same pair would NOT conflict.
  assert.equal(
    rangesOverlap(stay, { check_in: "2026-08-10", check_out: "2026-08-12" }),
    false,
  );
});
