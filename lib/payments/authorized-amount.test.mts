/**
 * Remediation 1.7 — CyberSource authorized amount/currency verification.
 * Mocked-response cases: the adapter treats any failed verification as a
 * failed payment and records nothing.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/authorized-amount.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyAuthorizedAmountDetails } from "./authorized-amount.ts";

test("matching amount + currency verifies (string amounts, as CyberSource sends)", () => {
  assert.deepEqual(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: { authorizedAmount: "450.00", currency: "USD" },
    }),
    { ok: true },
  );
  // totalAmount fallback when authorizedAmount is absent
  assert.deepEqual(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "usd",
      response_amount_details: { totalAmount: "450.00", currency: "usd" },
    }),
    { ok: true },
  );
});

test("amount mismatch fails — the mocked tampered response is rejected", () => {
  const r = verifyAuthorizedAmountDetails({
    requested_amount: 450,
    requested_currency: "USD",
    response_amount_details: { authorizedAmount: "45.00", currency: "USD" },
  });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /amount_mismatch/);
});

test("currency mismatch fails even when the number matches", () => {
  const r = verifyAuthorizedAmountDetails({
    requested_amount: 450,
    requested_currency: "USD",
    response_amount_details: { authorizedAmount: "450.00", currency: "LBP" },
  });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /currency_mismatch/);
});

test("missing or unparsable amount details fail closed", () => {
  assert.equal(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: undefined,
    }).ok,
    false,
  );
  assert.equal(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: {},
    }).ok,
    false,
  );
  assert.equal(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: { authorizedAmount: "not-a-number", currency: "USD" },
    }).ok,
    false,
  );
  assert.equal(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: { authorizedAmount: "450.00" }, // currency missing
    }).ok,
    false,
  );
});

test("settlementAmount and amount are accepted when authorized/total are absent", () => {
  assert.deepEqual(
    verifyAuthorizedAmountDetails({
      requested_amount: 1,
      requested_currency: "USD",
      response_amount_details: { settlementAmount: "1.00", currency: "USD" },
    }),
    { ok: true },
  );
  assert.deepEqual(
    verifyAuthorizedAmountDetails({
      requested_amount: 1,
      requested_currency: "USD",
      response_amount_details: { amount: "1.00", currency: "usd" },
    }),
    { ok: true },
  );
});

test("authorizedAmount takes precedence over a differing totalAmount", () => {
  const r = verifyAuthorizedAmountDetails({
    requested_amount: 450,
    requested_currency: "USD",
    response_amount_details: { authorizedAmount: "400.00", totalAmount: "450.00", currency: "USD" },
  });
  assert.equal(r.ok, false); // authorized 400 != requested 450 — must fail
});

test("rounding: 450 vs '450.004' verifies, '450.01' does not", () => {
  assert.equal(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: { authorizedAmount: "450.004", currency: "USD" },
    }).ok,
    true,
  );
  assert.equal(
    verifyAuthorizedAmountDetails({
      requested_amount: 450,
      requested_currency: "USD",
      response_amount_details: { authorizedAmount: "450.01", currency: "USD" },
    }).ok,
    false,
  );
});
