/**
 * Remediation 2.1 — member date-change repricing mirrors the booking POST
 * pricing/snapshot path.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/pricing/reprice.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { repriceBookingForDateChange } from "./reprice.ts";

const PRICING_SETTING = JSON.stringify([
  {
    villa: "Villa Mechmech",
    base_price: 100,
    weekday_price: null,
    weekend_price: null,
    minimum_stay: null,
    seasonal_overrides: [],
  },
]);

test("repricing produces the POST-shaped snapshot fields for the new dates", () => {
  const r = repriceBookingForDateChange({
    villa: "Villa Mechmech",
    check_in: "2026-08-10",
    check_out: "2026-08-13", // 3 nights @ 100
    message: null,
    sleeping_guests: 4,
    addons_snapshot: [{ price: 50 }, { price: null }],
    pricing_setting_value: PRICING_SETTING,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.update.pricing_subtotal, 300); // full-villa subtotal, like the POST
  assert.equal(r.update.pricing_nights.length, 3);
  const snap = r.update.pricing_snapshot;
  assert.equal(snap.full_villa_subtotal, 300);
  assert.equal(snap.bedrooms_to_be_used, 3); // default when message has no bedroom count
  assert.equal(typeof snap.adjusted_stay_subtotal, "number");
  // estimated_total = adjusted stay + finite addon prices (50)
  assert.equal(snap.estimated_total, (snap.adjusted_stay_subtotal ?? 0) + 50);
  assert.ok(snap.internal_intelligence);
});

test("bedroom count from the message drives the bedroom factor", () => {
  const r = repriceBookingForDateChange({
    villa: "Villa Mechmech",
    check_in: "2026-08-10",
    check_out: "2026-08-12",
    message: "Bedrooms to be used: 2",
    sleeping_guests: 4,
    addons_snapshot: null,
    pricing_setting_value: PRICING_SETTING,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.update.pricing_snapshot.bedrooms_to_be_used, 2);
});

test("minimum-stay violation on the new dates blocks with a clear 400", () => {
  const setting = JSON.stringify([
    {
      villa: "Villa Mechmech",
      base_price: 100,
      weekday_price: null,
      weekend_price: null,
      minimum_stay: 3,
      seasonal_overrides: [],
    },
  ]);
  const r = repriceBookingForDateChange({
    villa: "Villa Mechmech",
    check_in: "2026-08-10",
    check_out: "2026-08-11", // 1 night < min 3
    message: null,
    sleeping_guests: 2,
    addons_snapshot: null,
    pricing_setting_value: setting,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 400);
  assert.ok(r.reasons.includes("minimum_stay_violation"));
});

test("invalid range is rejected", () => {
  const r = repriceBookingForDateChange({
    villa: "Villa Mechmech",
    check_in: "2026-08-13",
    check_out: "2026-08-10",
    message: null,
    sleeping_guests: 2,
    addons_snapshot: null,
    pricing_setting_value: PRICING_SETTING,
  });
  assert.equal(r.ok, false);
});
