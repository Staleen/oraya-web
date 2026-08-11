import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHECKOUT_BEHAVIOUR,
  buildCaptureMandate,
  describeCheckoutBehaviour,
  parseCheckoutBehaviour,
} from "./checkout-behaviour.ts";

/**
 * Business Center cannot change these for our flow — the capture context and
 * the payment request override it. So they live in Oraya's settings instead.
 */

test("defaults reproduce today's live behaviour exactly", () => {
  assert.deepEqual(DEFAULT_CHECKOUT_BEHAVIOUR, {
    request_email: false,
    request_phone: false,
    billing_address: "full",
    skip_fraud_screening: true,
    capture_immediately: true,
  });
});

test("an unreadable setting can never change how money is taken", () => {
  for (const value of [null, undefined, "", "not json", "[]", 42, [], { billing_address: "weird" }]) {
    const parsed = parseCheckoutBehaviour(value);
    assert.equal(parsed.skip_fraud_screening, true, String(value));
    assert.equal(parsed.capture_immediately, true, String(value));
    assert.equal(parsed.billing_address, "full", String(value));
  }
});

test("stored settings are honoured, from JSON or from an object", () => {
  const stored = {
    request_email: true,
    request_phone: true,
    billing_address: "none",
    skip_fraud_screening: false,
    capture_immediately: false,
  };
  for (const value of [stored, JSON.stringify(stored)]) {
    assert.deepEqual(parseCheckoutBehaviour(value), stored);
  }
});

test("string booleans from a settings row are understood", () => {
  const parsed = parseCheckoutBehaviour({
    request_email: "true",
    request_phone: "off",
    skip_fraud_screening: "no",
    capture_immediately: "1",
  });
  assert.equal(parsed.request_email, true);
  assert.equal(parsed.request_phone, false);
  assert.equal(parsed.skip_fraud_screening, false);
  assert.equal(parsed.capture_immediately, true);
});

test("the capture mandate follows the setting", () => {
  const asksNothing = buildCaptureMandate(DEFAULT_CHECKOUT_BEHAVIOUR);
  assert.equal(asksNothing.requestEmail, false);
  assert.equal(asksNothing.requestPhone, false);
  assert.equal(asksNothing.billingType, "FULL");
  assert.equal(asksNothing.requestShipping, false);

  const noAddress = buildCaptureMandate({
    ...DEFAULT_CHECKOUT_BEHAVIOUR,
    billing_address: "none",
  });
  assert.equal(noAddress.billingType, "NONE");
});

test("saved credentials are never offered, whatever the setting says", () => {
  for (const behaviour of [
    DEFAULT_CHECKOUT_BEHAVIOUR,
    { ...DEFAULT_CHECKOUT_BEHAVIOUR, billing_address: "none" as const },
  ]) {
    assert.equal(buildCaptureMandate(behaviour).requestSaveCredentials, false);
  }
});

test("the operator is told in plain words what a change does to guests", () => {
  // Defaults still collect a billing address, so the summary must say so
  // rather than claiming the guest types nothing.
  const current = describeCheckoutBehaviour(DEFAULT_CHECKOUT_BEHAVIOUR);
  assert.ok(current.some((l) => /asked for their billing address/i.test(l)));
  assert.ok(current.some((l) => /Fraud screening is OFF/i.test(l)));

  // Nothing asked at all.
  const silent = describeCheckoutBehaviour({
    ...DEFAULT_CHECKOUT_BEHAVIOUR,
    billing_address: "none",
  });
  assert.ok(silent.some((l) => /only their card details/i.test(l)));

  const noisy = describeCheckoutBehaviour({
    request_email: true,
    request_phone: true,
    billing_address: "none",
    skip_fraud_screening: false,
    capture_immediately: false,
  });
  assert.ok(noisy.some((l) => /asked for their email, phone/i.test(l)));
  assert.ok(noisy.some((l) => /held only/i.test(l)));
  assert.ok(noisy.some((l) => /address verification cannot run/i.test(l)));
});
