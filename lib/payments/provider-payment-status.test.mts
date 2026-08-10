import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedProviderPaymentStatus,
  readCyberSourcePaymentStatus,
} from "./provider-payment-status.ts";

test("reads status, then outcome fallback for approved decisions", () => {
  assert.equal(readCyberSourcePaymentStatus({ status: "AUTHORIZED" }), "AUTHORIZED");
  assert.equal(readCyberSourcePaymentStatus({ outcome: "AUTHORIZED" }), "AUTHORIZED");
  assert.equal(
    readCyberSourcePaymentStatus({ status: "pending", outcome: "AUTHORIZED" }),
    "PENDING",
  );
  assert.equal(readCyberSourcePaymentStatus({ outcome: "Request processed successfully." }), null);
});

test("approved statuses include settled/transmitted capture outcomes", () => {
  assert.equal(isApprovedProviderPaymentStatus("AUTHORIZED"), true);
  assert.equal(isApprovedProviderPaymentStatus("CAPTURED"), true);
  assert.equal(isApprovedProviderPaymentStatus("SETTLED"), true);
  assert.equal(isApprovedProviderPaymentStatus("TRANSMITTED"), true);
  assert.equal(isApprovedProviderPaymentStatus("PENDING"), false);
  assert.equal(isApprovedProviderPaymentStatus("DECLINED"), false);
});
