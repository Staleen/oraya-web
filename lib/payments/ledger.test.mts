import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveRequestStatus,
  formatPaymentAmount,
  isPublicRequestPayable,
  manualRailToLedger,
  parseCreatePaymentRequestInput,
  remainingRequestAmount,
} from "./ledger.ts";
import {
  createPaymentRequestToken,
  decryptPaymentRequestToken,
  encryptPaymentRequestToken,
  hashPaymentRequestToken,
} from "./ledger-token.ts";

test("payment request input accepts standalone cash and card collection", () => {
  const parsed = parseCreatePaymentRequestInput({
    payer_name: "David Smith",
    payer_email: "david@example.com",
    description: "Villa deposit",
    purpose: "deposit",
    amount: "300.00",
    currency: "USD",
    allowed_methods: ["cash", "card", "cash"],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.amount, 300);
    assert.deepEqual(parsed.value.allowed_methods, ["cash", "card"]);
    assert.equal(parsed.value.booking_id, null);
  }
});

test("payment request input rejects zero amounts, past expiry, and missing methods", () => {
  const base = { payer_name: "D", description: "Deposit", purpose: "deposit", currency: "USD" };
  assert.equal(parseCreatePaymentRequestInput({ ...base, amount: 0, allowed_methods: ["cash"] }).ok, false);
  assert.equal(parseCreatePaymentRequestInput({ ...base, amount: 5, allowed_methods: [] }).ok, false);
  assert.equal(parseCreatePaymentRequestInput({
    ...base, amount: 5, allowed_methods: ["cash"], expires_at: "2020-01-01T00:00:00Z",
  }).ok, false);
});

test("booking-linked requests stay in the booking ledger currency", () => {
  const parsed = parseCreatePaymentRequestInput({
    booking_id: "6d9a4e25-7dc0-4bd3-837f-71d7350d6291",
    payer_name: "D",
    description: "Deposit",
    purpose: "deposit",
    amount: 5000000,
    currency: "LBP",
    allowed_methods: ["cash"],
  });
  assert.equal(parsed.ok, false);
});

test("manual rails map provider and method independently", () => {
  assert.deepEqual(manualRailToLedger("Cash"), { method: "cash", provider: "manual" });
  assert.deepEqual(manualRailToLedger("Whish"), { method: "wallet", provider: "whish" });
  assert.deepEqual(manualRailToLedger("Western Union"), { method: "transfer", provider: "western_union" });
  assert.equal(manualRailToLedger("Card"), null);
});

test("request projections support partial and full payment", () => {
  assert.equal(deriveRequestStatus(300, 0), "active");
  assert.equal(deriveRequestStatus(300, 100), "partially_paid");
  assert.equal(deriveRequestStatus(300, 300), "paid");
  assert.equal(remainingRequestAmount(300, 125.25), 174.75);
});

test("public payable check respects terminal states and expiry", () => {
  assert.equal(isPublicRequestPayable({ status: "active", expires_at: null }), true);
  assert.equal(isPublicRequestPayable({ status: "partially_paid", expires_at: "2099-01-01T00:00:00Z" }), true);
  assert.equal(isPublicRequestPayable({ status: "paid", expires_at: null }), false);
  assert.equal(isPublicRequestPayable({ status: "active", expires_at: "2020-01-01T00:00:00Z" }), false);
});

test("payment request tokens are high entropy, hashable, and encrypted at rest", () => {
  const token = createPaymentRequestToken();
  const secret = "test-secret-that-is-not-real";
  const encrypted = encryptPaymentRequestToken(token, secret);
  assert.ok(token.length >= 40);
  assert.equal(hashPaymentRequestToken(token).length, 64);
  assert.equal(encrypted.includes(token), false);
  assert.equal(decryptPaymentRequestToken(encrypted, secret), token);
  assert.equal(decryptPaymentRequestToken(encrypted, "wrong-secret"), null);
});

test("money formatting keeps request currency explicit", () => {
  assert.equal(formatPaymentAmount(10.5, "USD"), "$10.50");
  assert.equal(formatPaymentAmount(9000000, "LBP"), "9,000,000 LBP");
});
