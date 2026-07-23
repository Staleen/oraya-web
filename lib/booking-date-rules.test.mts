/**
 * Remediation 1.3 — stay-length cap + past-check-in rejection.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking-date-rules.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_STAY_NIGHTS,
  nightsBetween,
  todayIsoUtc,
  validateStayDateRules,
} from "./booking-date-rules.ts";

const TODAY = "2026-07-23";

test("nightsBetween counts calendar nights and rejects malformed input", () => {
  assert.equal(nightsBetween("2026-07-23", "2026-07-24"), 1);
  assert.equal(nightsBetween("2026-07-23", "2026-09-21"), 60);
  assert.equal(nightsBetween("2026-12-30", "2027-01-02"), 3); // year boundary
  assert.equal(nightsBetween("not-a-date", "2026-07-24"), null);
  assert.equal(nightsBetween("2026-07-23", "2026-13-40"), null);
});

test("today check-in is allowed; yesterday is rejected", () => {
  assert.equal(
    validateStayDateRules({ check_in: TODAY, check_out: "2026-07-25", todayIso: TODAY }),
    null,
  );
  const err = validateStayDateRules({
    check_in: "2026-07-22",
    check_out: "2026-07-25",
    todayIso: TODAY,
  });
  assert.equal(err?.reason, "past_check_in");
  assert.equal(err?.status, 400);
});

test("exactly MAX_STAY_NIGHTS passes; one more night is rejected", () => {
  assert.equal(
    validateStayDateRules({ check_in: TODAY, check_out: "2026-09-21", todayIso: TODAY }),
    null, // 60 nights
  );
  const err = validateStayDateRules({
    check_in: TODAY,
    check_out: "2026-09-22", // 61 nights
    todayIso: TODAY,
  });
  assert.equal(err?.reason, "stay_too_long");
  assert.match(err?.error ?? "", new RegExp(String(MAX_STAY_NIGHTS)));
});

test("zero/negative-night and malformed ranges are invalid", () => {
  assert.equal(
    validateStayDateRules({ check_in: TODAY, check_out: TODAY, todayIso: TODAY })?.reason,
    "invalid_dates",
  );
  assert.equal(
    validateStayDateRules({ check_in: "2026-07-25", check_out: "2026-07-23", todayIso: TODAY })
      ?.reason,
    "invalid_dates",
  );
  assert.equal(
    validateStayDateRules({ check_in: "garbage", check_out: TODAY, todayIso: TODAY })?.reason,
    "invalid_dates",
  );
});

test("todayIsoUtc formats the UTC date", () => {
  assert.equal(todayIsoUtc(new Date("2026-07-23T15:04:05Z")), "2026-07-23");
  assert.equal(todayIsoUtc(new Date("2026-07-23T00:00:00Z")), "2026-07-23");
});
