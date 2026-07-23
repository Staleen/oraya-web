/**
 * Remediation 3.2 — pricing engine: night iteration, boundary dates,
 * weekday/weekend (Beirut Fri+Sat), seasonal overrides, minimum stay.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/pricing/engine.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateStayPricing } from "./engine.ts";
import type { VillaPricingConfig } from "./types.ts";

const BASE: VillaPricingConfig = {
  base_price: 100,
  weekday_price: null,
  weekend_price: null,
  minimum_stay: null,
  seasonal_overrides: [],
};

test("night iteration: [check_in, check_out) — checkout night not charged", () => {
  const r = calculateStayPricing(BASE, { check_in: "2026-08-10", check_out: "2026-08-13" });
  assert.equal(r.nights, 3);
  assert.deepEqual(
    r.nightly.map((n) => n.date),
    ["2026-08-10", "2026-08-11", "2026-08-12"],
  );
  assert.equal(r.subtotal, 300);
  assert.equal(r.warnings.length, 0);
});

test("boundary dates: month and year rollover iterate correctly", () => {
  const m = calculateStayPricing(BASE, { check_in: "2026-08-31", check_out: "2026-09-02" });
  assert.deepEqual(m.nightly.map((n) => n.date), ["2026-08-31", "2026-09-01"]);

  const y = calculateStayPricing(BASE, { check_in: "2026-12-31", check_out: "2027-01-02" });
  assert.deepEqual(y.nightly.map((n) => n.date), ["2026-12-31", "2027-01-01"]);

  const leap = calculateStayPricing(BASE, { check_in: "2028-02-28", check_out: "2028-03-01" });
  assert.deepEqual(leap.nightly.map((n) => n.date), ["2028-02-28", "2028-02-29"]);
});

test("invalid / zero-night / reversed ranges produce nights=0, subtotal=null", () => {
  for (const input of [
    { check_in: "2026-08-10", check_out: "2026-08-10" },
    { check_in: "2026-08-13", check_out: "2026-08-10" },
    { check_in: "garbage", check_out: "2026-08-10" },
    { check_in: "2026-02-30", check_out: "2026-03-02" }, // impossible date
  ]) {
    const r = calculateStayPricing(BASE, input);
    assert.equal(r.nights, 0, JSON.stringify(input));
    assert.equal(r.subtotal, null);
  }
});

test("weekend detection is Beirut Fri+Sat; weekday/weekend prices apply", () => {
  const config: VillaPricingConfig = {
    ...BASE,
    weekday_price: 80,
    weekend_price: 150,
  };
  // 2026-08-13 Thu, 08-14 Fri, 08-15 Sat → checkout 08-16 (Sun not charged)
  const r = calculateStayPricing(config, { check_in: "2026-08-13", check_out: "2026-08-16" });
  assert.deepEqual(
    r.nightly.map((n) => ({ date: n.date, is_weekend: n.is_weekend, price: n.price, source: n.source })),
    [
      { date: "2026-08-13", is_weekend: false, price: 80, source: "weekday" },
      { date: "2026-08-14", is_weekend: true, price: 150, source: "weekend" },
      { date: "2026-08-15", is_weekend: true, price: 150, source: "weekend" },
    ],
  );
  assert.equal(r.subtotal, 380);
});

test("seasonal override applies per-night inside its inclusive window", () => {
  const config: VillaPricingConfig = {
    ...BASE,
    seasonal_overrides: [
      {
        id: "s1",
        start_date: "2026-08-11",
        end_date: "2026-08-11",
        base_price: 500,
        weekday_price: null,
        weekend_price: null,
        minimum_stay: null,
      },
    ],
  };
  const r = calculateStayPricing(config, { check_in: "2026-08-10", check_out: "2026-08-13" });
  assert.deepEqual(
    r.nightly.map((n) => ({ price: n.price, source: n.source })),
    [
      { price: 100, source: "base" },
      { price: 500, source: "seasonal" },
      { price: 100, source: "base" },
    ],
  );
  assert.equal(r.subtotal, 700);
});

test("unpriced nights: partial pricing warns; fully unpriced stay has null subtotal", () => {
  const config: VillaPricingConfig = {
    base_price: null,
    weekday_price: null,
    weekend_price: null,
    minimum_stay: null,
    seasonal_overrides: [
      {
        id: "s1",
        start_date: "2026-08-10",
        end_date: "2026-08-10",
        base_price: 200,
        weekday_price: null,
        weekend_price: null,
        minimum_stay: null,
      },
    ],
  };
  const partial = calculateStayPricing(config, { check_in: "2026-08-10", check_out: "2026-08-12" });
  assert.equal(partial.subtotal, 200); // only the priced night counts
  assert.deepEqual(partial.warnings, [{ kind: "unpriced_nights", count: 1 }]);

  const none = calculateStayPricing(
    { ...config, seasonal_overrides: [] },
    { check_in: "2026-08-10", check_out: "2026-08-12" },
  );
  assert.equal(none.subtotal, null);
});

test("minimum stay: villa-level and seasonal maxima produce the warning", () => {
  const r = calculateStayPricing(
    { ...BASE, minimum_stay: 3 },
    { check_in: "2026-08-10", check_out: "2026-08-12" },
  );
  assert.deepEqual(r.warnings, [{ kind: "minimum_stay", required: 3, actual: 2 }]);

  const seasonal = calculateStayPricing(
    {
      ...BASE,
      minimum_stay: 2,
      seasonal_overrides: [
        {
          id: "s1",
          start_date: "2026-08-10",
          end_date: "2026-08-20",
          base_price: null,
          weekday_price: null,
          weekend_price: null,
          minimum_stay: 5, // lengthens the requirement
        },
      ],
    },
    { check_in: "2026-08-10", check_out: "2026-08-13" },
  );
  assert.deepEqual(seasonal.warnings, [{ kind: "minimum_stay", required: 5, actual: 3 }]);

  const ok = calculateStayPricing(
    { ...BASE, minimum_stay: 2 },
    { check_in: "2026-08-10", check_out: "2026-08-12" },
  );
  assert.equal(ok.warnings.length, 0);
});
