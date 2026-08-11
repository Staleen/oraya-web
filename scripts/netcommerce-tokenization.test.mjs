import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/payments/credit-libanais.ts", import.meta.url),
  "utf8",
);
const paymentRequestSource = readFileSync(
  new URL("../lib/payments/transient-token-payment-request.ts", import.meta.url),
  "utf8",
);

test("NetCommerce capture context disables saved-card consent", () => {
  // The capture mandate moved into lib/payments/checkout-behaviour.ts so the
  // operator can control the guest-facing fields. Saved credentials stay a
  // hard false there — they are a separately gated workstream, never a toggle.
  const behaviour = readFileSync("lib/payments/checkout-behaviour.ts", "utf8");
  assert.match(behaviour, /requestSaveCredentials:\s*false/);
  assert.doesNotMatch(behaviour, /requestSaveCredentials:\s*true/);
  assert.doesNotMatch(source, /requestSaveCredentials:\s*true/);
});

test("Apple Pay is an exact, separate provider-enrollment opt-in", () => {
  assert.match(source, /NETCOMMERCE_CYBERSOURCE_APPLE_PAY_ENABLED/);
  assert.match(source, /=== "true"/);
  assert.match(source, /CYBERSOURCE_APPLE_PAY_PAYMENT_TYPE = "APPLEPAY"/);
  assert.match(source, /if \(requestedMethods\.includes\("apple_pay"\)\)/);
  assert.match(source, /Apple Pay is not enrolled and verified/);
});

test("NetCommerce checkout does not request reusable token creation", () => {
  assert.doesNotMatch(source, /completeMandate\s*:/);
  assert.doesNotMatch(source, /tokenCreate\s*:\s*true/);
  assert.doesNotMatch(source, /TMS_TOKEN/);
});

test("NetCommerce payment authorization uses only transient payment tokens", () => {
  assert.match(paymentRequestSource, /tokenInformation\s*:\s*{\s*transientTokenJwt:/s);
  assert.doesNotMatch(paymentRequestSource, /paymentInstrument/);
  assert.doesNotMatch(paymentRequestSource, /instrumentIdentifier/);
  assert.doesNotMatch(paymentRequestSource, /consumerPreference/);
  // A partial billing override would supersede the UC token's full address.
  assert.doesNotMatch(paymentRequestSource, /\bbillTo\s*:/);
  assert.match(source, /buildTransientTokenPaymentRequest/);
});

test("NetCommerce request MLE is an exact opt-in (default plaintext payment body)", () => {
  assert.match(source, /NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_ENABLED/);
  assert.match(source, /requestMleEnabled:\s*readEnv\("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_ENABLED"\) === "true"/);
  assert.match(source, /if \(config\.requestMleEnabled\)/);
});

test("NetCommerce production checkout is gated by the fail-closed live rollout switch (Plan 4 Phase 3)", () => {
  // The old hardcoded sandbox-only gate is gone ON PURPOSE — readiness now
  // delegates to the pure fail-closed decision (sandbox, or production +
  // webhook/MLE env + payments_live_enabled === "true"; anything else ⇒ not
  // ready). Pin the delegation and the settings-row read.
  assert.doesNotMatch(source, /const checkoutReady = configured && config\.environment === "sandbox"/);
  assert.match(source, /decideCreditLibanaisCheckoutReady\(\{/);
  assert.match(source, /readPaymentsLiveSetting\(\)/);
  assert.match(source, /Production checkout is DISABLED \(fail closed\)/);
});
