/**
 * Remediation 2.4 — shared checkout-day expiry helper (reconciled from nine
 * per-file copies; the strict payments/checkout variant won, hardened against
 * Date.UTC rollover).
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/checkout-expiry.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkOutExpiryUnix } from "./checkout-expiry.ts";

test("valid dates produce 23:59:59 UTC of the check-out day", () => {
  assert.equal(
    checkOutExpiryUnix("2026-08-20"),
    Math.floor(Date.UTC(2026, 7, 20, 23, 59, 59) / 1000),
  );
  // identical to the legacy lenient formula for valid input
  assert.equal(
    checkOutExpiryUnix("2026-08-20"),
    Math.floor(new Date("2026-08-20T23:59:59Z").getTime() / 1000),
  );
});

test("malformed and impossible dates throw instead of returning NaN or rolling over", () => {
  assert.throws(() => checkOutExpiryUnix("not-a-date"));
  assert.throws(() => checkOutExpiryUnix("2026-8-20"));
  assert.throws(() => checkOutExpiryUnix(""));
  assert.throws(() => checkOutExpiryUnix("2026-99-99")); // Date.UTC would roll this over
  assert.throws(() => checkOutExpiryUnix("2026-02-30"));
});

test("leap-day handling", () => {
  assert.equal(
    checkOutExpiryUnix("2028-02-29"),
    Math.floor(Date.UTC(2028, 1, 29, 23, 59, 59) / 1000),
  );
  assert.throws(() => checkOutExpiryUnix("2026-02-29")); // not a leap year
});
