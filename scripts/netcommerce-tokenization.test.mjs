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
