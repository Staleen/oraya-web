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

/**
 * Root cause of the two stuck production refunds on 2026-08-11: CyberSource
 * answers a follow-on refund with refundAmountDetails, and Oraya only read
 * creditAmountDetails. Amount verification failed, the outcome was classified
 * ambiguous, and the operator was sent to Business Center for a refund that
 * had in fact succeeded.
 */

test("a real refund response verifies from refundAmountDetails", () => {
  const verified = verifyRefundAmountDetails({
    requested_amount: 240,
    requested_currency: "USD",
    payload: {
      refundAmountDetails: { refundAmount: "240.00", currency: "USD" },
    },
  });
  assert.equal(verified.ok, true);
});

test("that response now classifies as approved, not ambiguous", () => {
  const outcome = classifyProviderRefundOutcome({
    http_ok: true,
    http_status: 201,
    status: "PENDING",
    refund_id: "7864700292896974704899",
    amount_verified: verifyRefundAmountDetails({
      requested_amount: 240,
      requested_currency: "USD",
      payload: { refundAmountDetails: { refundAmount: "240.00", currency: "USD" } },
    }).ok,
  });
  assert.equal(outcome, "approved");
});

test("the old shape still verifies — PIN debit credits are unaffected", () => {
  assert.equal(
    verifyRefundAmountDetails({
      requested_amount: 240,
      requested_currency: "USD",
      payload: { creditAmountDetails: { creditAmount: "240.00", currency: "USD" } },
    }).ok,
    true,
  );
});

test("a wrong amount or currency still fails closed", () => {
  assert.equal(
    verifyRefundAmountDetails({
      requested_amount: 240,
      requested_currency: "USD",
      payload: { refundAmountDetails: { refundAmount: "120.00", currency: "USD" } },
    }).ok,
    false,
  );
  assert.equal(
    verifyRefundAmountDetails({
      requested_amount: 240,
      requested_currency: "USD",
      payload: { refundAmountDetails: { refundAmount: "240.00", currency: "LBP" } },
    }).ok,
    false,
  );
  // A response with no amount at all must never verify.
  assert.equal(
    verifyRefundAmountDetails({
      requested_amount: 240,
      requested_currency: "USD",
      payload: { refundAmountDetails: { currency: "USD" } },
    }).ok,
    false,
  );
});
