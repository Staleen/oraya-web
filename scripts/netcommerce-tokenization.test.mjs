import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/payments/credit-libanais.ts", import.meta.url),
  "utf8",
);

test("NetCommerce capture context disables saved-card consent", () => {
  assert.match(source, /requestSaveCredentials:\s*false/);
  assert.doesNotMatch(source, /requestSaveCredentials:\s*true/);
});

test("NetCommerce checkout does not request reusable token creation", () => {
  assert.doesNotMatch(source, /completeMandate\s*:/);
  assert.doesNotMatch(source, /tokenCreate\s*:\s*true/);
  assert.doesNotMatch(source, /TMS_TOKEN/);
});

test("NetCommerce payment authorization uses only transient payment tokens", () => {
  assert.match(source, /tokenInformation\s*:\s*{\s*transientTokenJwt:/s);
  assert.doesNotMatch(source, /paymentInstrument/);
  assert.doesNotMatch(source, /instrumentIdentifier/);
  assert.doesNotMatch(source, /consumerPreference/);
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
