/**
 * Remediation 3.2 — monetary rounding primitives.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/money.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { roundMoney, sumMoney } from "./money.ts";

test("roundMoney: 2-decimal rounding of float artifacts", () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(450.004), 450);
  assert.equal(roundMoney(450.005), 450.01);
  assert.equal(roundMoney(450), 450);
});

test("roundMoney: non-finite and negative inputs collapse to 0 (documented safety)", () => {
  assert.equal(roundMoney(NaN), 0);
  assert.equal(roundMoney(Infinity), 0);
  assert.equal(roundMoney(-Infinity), 0);
  assert.equal(roundMoney(-10), 0);
  // @ts-expect-error — runtime safety for non-number junk
  assert.equal(roundMoney("100"), 0);
});

test("sumMoney: per-addition rounding keeps totals consistent with line items", () => {
  assert.equal(sumMoney([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sumMoney([]), 0);
  assert.equal(sumMoney([100.005, 200.005]), 300.02); // each rounds to .01 first
  assert.equal(sumMoney([100, NaN, 50]), 150); // junk entries count as 0
});
