/**
 * Remediation 5.3 — extracted add-on availability rule from /book.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking/addon-availability.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAddonAvailability } from "./addon-availability.ts";

const NOW = new Date(2026, 6, 23, 12, 0, 0).getTime(); // local noon, 2026-07-23

test("no enforcement or no prep time → always available", () => {
  assert.equal(
    computeAddonAvailability(
      { id: "breakfast", label: "Breakfast", enforcement_mode: "none", preparation_time_hours: 48 },
      { checkIn: "2026-07-23", heatedPoolCarryover: false, now: NOW },
    ).available,
    true,
  );
  assert.equal(
    computeAddonAvailability(
      { id: "breakfast", label: "Breakfast", enforcement_mode: "strict", preparation_time_hours: 0 },
      { checkIn: "2026-07-23", heatedPoolCarryover: false, now: NOW },
    ).selectable,
    true,
  );
});

test("no check-in selected yet → optimistic availability", () => {
  const r = computeAddonAvailability(
    { id: "pool", label: "Heated Pool", enforcement_mode: "strict", preparation_time_hours: 48 },
    { checkIn: "", heatedPoolCarryover: false, now: NOW },
  );
  assert.deepEqual([r.available, r.selectable], [true, true]);
});

test("strict addon inside its prep window is not selectable; soft stays selectable with warning", () => {
  const strict = computeAddonAvailability(
    { id: "pool", label: "Heated Pool", enforcement_mode: "strict", preparation_time_hours: 48 },
    { checkIn: "2026-07-24", heatedPoolCarryover: false, now: NOW }, // 12h away < 48h
  );
  assert.equal(strict.available, false);
  assert.equal(strict.selectable, false);
  assert.match(strict.warning, /advance notice/);

  const soft = computeAddonAvailability(
    { id: "pool", label: "Heated Pool", enforcement_mode: "soft", preparation_time_hours: 48 },
    { checkIn: "2026-07-24", heatedPoolCarryover: false, now: NOW },
  );
  assert.equal(soft.available, false);
  assert.equal(soft.selectable, true);
  assert.match(soft.warning, /Short notice/);
});

test("enough lead time → available", () => {
  const r = computeAddonAvailability(
    { id: "pool", label: "Heated Pool", enforcement_mode: "strict", preparation_time_hours: 48 },
    { checkIn: "2026-07-30", heatedPoolCarryover: false, now: NOW },
  );
  assert.equal(r.available, true);
});

test("heated-pool carryover waives the strict prep window with a note", () => {
  const r = computeAddonAvailability(
    { id: "heated_pool", label: "Heated Pool", enforcement_mode: "strict", preparation_time_hours: 48 },
    { checkIn: "2026-07-24", heatedPoolCarryover: true, now: NOW },
  );
  assert.equal(r.available, true);
  assert.equal(r.selectable, true);
  assert.ok(r.carryoverNote);

  // Carryover does not waive a non-pool addon.
  const other = computeAddonAvailability(
    { id: "fireplace_diesel", label: "Fireplace Diesel", enforcement_mode: "strict", preparation_time_hours: 48 },
    { checkIn: "2026-07-24", heatedPoolCarryover: true, now: NOW },
  );
  assert.equal(other.selectable, false);
});
