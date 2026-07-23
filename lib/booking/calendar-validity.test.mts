/**
 * Remediation 5.3 — extracted guest calendar validity rules.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking/calendar-validity.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBookedRangeList,
  createEventCalendarRules,
  createStayCalendarRules,
  parseLocalISO,
} from "./calendar-validity.ts";

const TODAY = parseLocalISO("2026-08-01");
const RANGES = [{ check_in: "2026-08-10", check_out: "2026-08-13" }];
const BOOKED = buildBookedRangeList(RANGES);

test("buildBookedRangeList blocks nights but keeps the checkout day open", () => {
  assert.equal(BOOKED.length, 1);
  assert.equal(BOOKED[0].from.getTime(), parseLocalISO("2026-08-10").getTime());
  assert.equal(BOOKED[0].to.getTime(), parseLocalISO("2026-08-12").getTime()); // last night
});

test("stay rules: blocked/past days, valid checkout, dead check-in", () => {
  const rules = createStayCalendarRules({ today: TODAY, bookedRangeList: BOOKED, minStayNights: 1 });

  assert.equal(rules.isCalendarDateBlocked(parseLocalISO("2026-07-31")), true); // past
  assert.equal(rules.isCalendarDateBlocked(parseLocalISO("2026-08-11")), true); // booked night
  assert.equal(rules.isCalendarDateBlocked(parseLocalISO("2026-08-13")), false); // checkout day

  // Checkout may land ON the next stay's check-in day boundary? check_in 08-08
  // → checkout 08-10 (the blocked stay's check-in): 08-10 is blocked, invalid.
  assert.equal(
    rules.isValidCheckoutFrom(parseLocalISO("2026-08-08"), parseLocalISO("2026-08-10")),
    false,
  );
  assert.equal(
    rules.isValidCheckoutFrom(parseLocalISO("2026-08-08"), parseLocalISO("2026-08-09")),
    true,
  );
  // Straddling the blocked range is invalid.
  assert.equal(
    rules.isValidCheckoutFrom(parseLocalISO("2026-08-08"), parseLocalISO("2026-08-14")),
    false,
  );

  assert.equal(rules.hasValidCheckoutFromCheckIn(parseLocalISO("2026-08-05")), true);
  assert.equal(rules.isDeadCheckInDate(parseLocalISO("2026-08-05")), false);
});

test("stay rules: dead check-in when the minimum stay cannot fit in a gap", () => {
  // Blocks 08-10..08-13 and 08-15..08-18 leave a one-night gap on 08-13/08-14.
  const twoBlocks = buildBookedRangeList([
    { check_in: "2026-08-10", check_out: "2026-08-13" },
    { check_in: "2026-08-15", check_out: "2026-08-18" },
  ]);
  // With min stay 1 the guest can do 08-13 → 08-14, so 08-13 is not dead.
  const oneNight = createStayCalendarRules({ today: TODAY, bookedRangeList: twoBlocks, minStayNights: 1 });
  assert.equal(oneNight.isDeadCheckInDate(parseLocalISO("2026-08-13")), false);
  // With min stay 2 every candidate checkout is blocked or crosses the second
  // block, so 08-13 becomes a dead check-in.
  const twoNights = createStayCalendarRules({ today: TODAY, bookedRangeList: twoBlocks, minStayNights: 2 });
  assert.equal(twoNights.isDeadCheckInDate(parseLocalISO("2026-08-13")), true);
  // Also: the day right before a block is dead (checkout would land on the
  // block's check-in day, which the UI treats as blocked).
  assert.equal(oneNight.isDeadCheckInDate(parseLocalISO("2026-08-09")), true);
});

test("event rules: setup day before the event must also be free", () => {
  const rules = createEventCalendarRules({
    today: TODAY,
    confirmedRanges: RANGES,
    bookedRangeList: BOOKED,
    minEventNights: 1,
  });

  // Event starting 08-13 (checkout day of the block): its setup day 08-12 is
  // still occupied → invalid.
  assert.equal(
    rules.isValidEventCheckoutFrom(parseLocalISO("2026-08-13"), parseLocalISO("2026-08-14")),
    false,
  );
  // Event starting 08-14 → setup day 08-13 is free → valid.
  assert.equal(
    rules.isValidEventCheckoutFrom(parseLocalISO("2026-08-14"), parseLocalISO("2026-08-15")),
    true,
  );
  assert.equal(
    rules.incomingOperationalOverlapsConfirmed(parseLocalISO("2026-08-13"), parseLocalISO("2026-08-14")),
    true,
  );
  assert.equal(
    rules.incomingOperationalOverlapsConfirmed(parseLocalISO("2026-08-14"), parseLocalISO("2026-08-15")),
    false,
  );
  assert.equal(rules.isDeadEventCheckInDate(parseLocalISO("2026-08-13")), true);
  assert.equal(rules.isDeadEventCheckInDate(parseLocalISO("2026-08-14")), false);
});
