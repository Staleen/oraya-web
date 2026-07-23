/**
 * Remediation 3.2 — deposit/full payment selection math edges.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/checkout-amount.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getMinimumDepositAmount,
  validatePaymentSelection,
} from "./checkout-amount.ts";
import { DEFAULT_PAYMENT_PUBLIC_SETTINGS } from "./settings.ts";

const DEFAULT_PCT = DEFAULT_PAYMENT_PUBLIC_SETTINGS.deposit_minimum_percentage;

test("full payment charges the exact total with zero remaining", () => {
  const r = validatePaymentSelection({ purpose: "full", amountTotal: 1234.56 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.chargeAmount, 1234.56);
  assert.equal(r.remainingBalance, 0);
});

test("deposit at exactly the minimum is accepted; one cent below is rejected", () => {
  const total = 1000;
  const minimum = getMinimumDepositAmount(total);
  assert.equal(minimum, (total * DEFAULT_PCT) / 100);

  const atMin = validatePaymentSelection({
    purpose: "deposit",
    amountTotal: total,
    requestedAmount: minimum,
  });
  assert.ok(atMin.ok);
  if (atMin.ok) {
    assert.equal(atMin.chargeAmount, minimum);
    assert.equal(atMin.remainingBalance, total - minimum);
  }

  const belowMin = validatePaymentSelection({
    purpose: "deposit",
    amountTotal: total,
    requestedAmount: minimum - 0.01,
  });
  assert.equal(belowMin.ok, false);
});

test("deposit above the total is rejected; deposit equal to the total is allowed", () => {
  assert.equal(
    validatePaymentSelection({ purpose: "deposit", amountTotal: 500, requestedAmount: 500.01 }).ok,
    false,
  );
  const exact = validatePaymentSelection({
    purpose: "deposit",
    amountTotal: 500,
    requestedAmount: 500,
  });
  assert.ok(exact.ok);
  if (exact.ok) assert.equal(exact.remainingBalance, 0);
});

test("zero/negative/missing amounts fail", () => {
  assert.equal(validatePaymentSelection({ purpose: "full", amountTotal: 0 }).ok, false);
  assert.equal(validatePaymentSelection({ purpose: "full", amountTotal: NaN }).ok, false);
  assert.equal(
    validatePaymentSelection({ purpose: "deposit", amountTotal: 500, requestedAmount: 0 }).ok,
    false,
  );
  assert.equal(
    validatePaymentSelection({ purpose: "deposit", amountTotal: 500, requestedAmount: -50 }).ok,
    false,
  );
  assert.equal(
    validatePaymentSelection({ purpose: "deposit", amountTotal: 500, requestedAmount: null }).ok,
    false,
  );
});

test("custom minimum-deposit percentage is honored", () => {
  const r = validatePaymentSelection({
    purpose: "deposit",
    amountTotal: 1000,
    requestedAmount: 100,
    minimumDepositPercentage: 10,
  });
  assert.ok(r.ok);
  const tooLow = validatePaymentSelection({
    purpose: "deposit",
    amountTotal: 1000,
    requestedAmount: 100,
    minimumDepositPercentage: 20,
  });
  assert.equal(tooLow.ok, false);
});

test("float-artifact amounts round to cents before comparison", () => {
  const r = validatePaymentSelection({
    purpose: "deposit",
    amountTotal: 0.1 + 0.2, // 0.30000000000000004
    requestedAmount: 0.3,
  });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.amountTotal, 0.3);
});
