import assert from "node:assert/strict";
import test from "node:test";
import {
  isProviderRefundSuccessStatus,
  remainingRefundableAmount,
  validateRefundAmount,
} from "./provider-refund.ts";

test("remaining refundable amount never goes negative", () => {
  assert.equal(remainingRefundableAmount({ payment_amount: 1, already_refunded: 0 }), 1);
  assert.equal(remainingRefundableAmount({ payment_amount: 10, already_refunded: 4 }), 6);
  assert.equal(remainingRefundableAmount({ payment_amount: 1, already_refunded: 1 }), 0);
  assert.equal(remainingRefundableAmount({ payment_amount: 1, already_refunded: 2 }), 0);
});

test("validateRefundAmount enforces remaining balance", () => {
  assert.deepEqual(validateRefundAmount({ amount: 1, remaining: 1 }), { ok: true, amount: 1 });
  assert.equal(validateRefundAmount({ amount: 0, remaining: 1 }).ok, false);
  assert.equal(validateRefundAmount({ amount: 1.01, remaining: 1 }).ok, false);
});

test("CyberSource refund acceptance statuses", () => {
  assert.equal(isProviderRefundSuccessStatus("PENDING"), true);
  assert.equal(isProviderRefundSuccessStatus("TRANSMITTED"), true);
  assert.equal(isProviderRefundSuccessStatus("DECLINED"), false);
  assert.equal(isProviderRefundSuccessStatus(null), false);
});
