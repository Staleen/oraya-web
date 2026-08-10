import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProviderRefundOutcome,
  isProviderRefundSuccessStatus,
  remainingRefundableAmount,
  validateRefundAmount,
  verifyRefundAmountDetails,
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

test("refund amount verification accepts creditAmountDetails", () => {
  assert.deepEqual(
    verifyRefundAmountDetails({
      requested_amount: 1,
      requested_currency: "USD",
      payload: { creditAmountDetails: { creditAmount: "1.00", currency: "USD" } },
    }),
    { ok: true },
  );
  assert.equal(
    verifyRefundAmountDetails({
      requested_amount: 1,
      requested_currency: "USD",
      payload: { creditAmountDetails: { creditAmount: "2.00", currency: "USD" } },
    }).ok,
    false,
  );
});

test("classifyProviderRefundOutcome is fail-closed for ambiguous money outcomes", () => {
  assert.equal(
    classifyProviderRefundOutcome({
      http_ok: true,
      http_status: 201,
      status: "PENDING",
      refund_id: "rfnd-1",
      amount_verified: true,
    }),
    "approved",
  );
  assert.equal(
    classifyProviderRefundOutcome({
      http_ok: true,
      http_status: 201,
      status: "PENDING",
      refund_id: "rfnd-1",
      amount_verified: false,
    }),
    "ambiguous",
  );
  assert.equal(
    classifyProviderRefundOutcome({
      http_ok: false,
      http_status: 400,
      status: "INVALID_REQUEST",
      refund_id: null,
      amount_verified: false,
    }),
    "declined",
  );
  assert.equal(
    classifyProviderRefundOutcome({
      http_ok: false,
      http_status: 500,
      status: null,
      refund_id: null,
      amount_verified: false,
    }),
    "ambiguous",
  );
  assert.equal(
    classifyProviderRefundOutcome({
      http_ok: true,
      http_status: 201,
      status: "PENDING",
      refund_id: null,
      amount_verified: true,
      decrypt_failed: true,
    }),
    "ambiguous",
  );
});
