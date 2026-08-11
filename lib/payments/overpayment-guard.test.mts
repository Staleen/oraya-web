import assert from "node:assert/strict";
import test from "node:test";
import { decideManualPaymentAllowed } from "./overpayment-guard.ts";

/**
 * Reproduces the 2026-08-11 incident: a $240 card payment was already recorded
 * against a $240 booking, and a manual $240 was added on top, giving $480.
 */

test("money cannot be recorded onto a booking that is already paid in full", () => {
  const decision = decideManualPaymentAllowed({
    amountPaid: 240,
    amountTotal: 240,
    amount: 240,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "already_paid_in_full");
  assert.match(
    decision.allowed === false ? decision.message : "",
    /reverse that entry instead/i,
  );
  // The operator is told the real numbers, not a generic refusal.
  assert.match(decision.allowed === false ? decision.message : "", /USD 240/);
});

test("a part-paid booking still accepts a top-up", () => {
  assert.deepEqual(
    decideManualPaymentAllowed({ amountPaid: 100, amountTotal: 240, amount: 140 }),
    { allowed: true },
  );
  // Even a top-up that overshoots is allowed while a balance is outstanding —
  // only the already-settled case is refused.
  assert.deepEqual(
    decideManualPaymentAllowed({ amountPaid: 100, amountTotal: 240, amount: 200 }),
    { allowed: true },
  );
});

test("an unpaid booking is never blocked", () => {
  assert.deepEqual(
    decideManualPaymentAllowed({ amountPaid: 0, amountTotal: 240, amount: 240 }),
    { allowed: true },
  );
  assert.deepEqual(
    decideManualPaymentAllowed({ amountPaid: null, amountTotal: 240, amount: 240 }),
    { allowed: true },
  );
});

test("an unknown total never blocks — the guard refuses to guess", () => {
  for (const amountTotal of [null, undefined, 0, Number.NaN]) {
    assert.deepEqual(
      decideManualPaymentAllowed({ amountPaid: 500, amountTotal, amount: 100 }),
      { allowed: true },
    );
  }
});

test("a booking short by a cent is still payable; exact-to-the-cent is settled", () => {
  // Outstanding, even barely — allowed.
  assert.deepEqual(
    decideManualPaymentAllowed({ amountPaid: 239.99, amountTotal: 240, amount: 0.01 }),
    { allowed: true },
  );
  // Float noise that lands on the same cent counts as settled, not as a gap.
  assert.equal(
    decideManualPaymentAllowed({ amountPaid: 0.1 + 0.2, amountTotal: 0.3, amount: 10 }).allowed,
    false,
  );
});

test("a deliberate over-payment is still possible with an explicit override", () => {
  assert.deepEqual(
    decideManualPaymentAllowed({
      amountPaid: 240,
      amountTotal: 240,
      amount: 50,
      allowOverpayment: true,
    }),
    { allowed: true },
  );
});
