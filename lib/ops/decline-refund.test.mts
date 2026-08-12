/**
 * Declining a stay the guest already paid for must return their money as part
 * of declining — not as a second errand somebody has to remember.
 *
 * Runner: node --experimental-strip-types --test lib/ops/decline-refund.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideDeclineRefund, describeDeclineRefund } from "./decline-refund.ts";

const CARD = { method: "card", provider: "credit_libanais" } as const;

test("a paid card booking refunds the full amount on decline", () => {
  const d = decideDeclineRefund({ amountPaid: 270, refundAmount: null, refundStatus: null, ...CARD });
  assert.deepEqual(d, { refund: true, amount: 270 });
  assert.match(describeDeclineRefund(d), /refund USD 270\.00 to the guest's card/);
});

test("a partly refunded booking returns only what is still owed", () => {
  const d = decideDeclineRefund({ amountPaid: 270, refundAmount: 70, refundStatus: null, ...CARD });
  assert.deepEqual(d, { refund: true, amount: 200 });
});

test("an unpaid booking refunds nothing and says nothing", () => {
  const d = decideDeclineRefund({ amountPaid: 0, refundAmount: null, refundStatus: null, ...CARD });
  assert.equal(d.refund, false);
  assert.equal(d.refund === false && d.reason, "nothing_paid");
  assert.equal(d.refund === false && d.operatorNote, null);
});

test("a refund already under way never starts a second one", () => {
  for (const refundStatus of ["pending", "processing", "PENDING"]) {
    const d = decideDeclineRefund({ amountPaid: 270, refundAmount: null, refundStatus, ...CARD });
    assert.equal(d.refund, false, refundStatus);
    assert.equal(d.refund === false && d.reason, "refund_in_flight");
    assert.match(d.refund === false ? d.operatorNote ?? "" : "", /already under way/);
  }
});

test("an already fully refunded booking is left alone", () => {
  const d = decideDeclineRefund({ amountPaid: 270, refundAmount: 270, refundStatus: "refunded", ...CARD });
  assert.equal(d.refund === false && d.reason, "already_refunded");
});

test("cash and bank transfers are never refunded automatically — Oraya cannot reverse them", () => {
  for (const method of ["cash", "bank_transfer", "omt", "whish"]) {
    const d = decideDeclineRefund({
      amountPaid: 270, refundAmount: null, refundStatus: null,
      method, provider: "manual",
    });
    assert.equal(d.refund, false, method);
    assert.equal(d.refund === false && d.reason, "not_automatically_refundable");
    // The operator must be told, or the guest is cancelled and out of pocket.
    assert.match(d.refund === false ? d.operatorNote ?? "" : "", /return the payment the same way it arrived/);
  }
});

test("an unrecognised provider fails closed rather than guessing", () => {
  const d = decideDeclineRefund({
    amountPaid: 270, refundAmount: null, refundStatus: null,
    method: "card", provider: "some_other_gateway",
  });
  assert.equal(d.refund === false && d.reason, "not_automatically_refundable");
});

test("a nonsense amount is treated as nothing paid, never as a refund", () => {
  for (const amountPaid of [null, undefined, Number.NaN, -50]) {
    const d = decideDeclineRefund({ amountPaid, refundAmount: null, refundStatus: null, ...CARD });
    assert.equal(d.refund, false, String(amountPaid));
    assert.equal(d.refund === false && d.reason, "nothing_paid");
  }
});
