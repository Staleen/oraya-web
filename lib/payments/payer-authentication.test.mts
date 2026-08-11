/**
 * 3-D Secure: requested through actionList, decided on the response.
 *
 * Runner: node --experimental-strip-types --test lib/payments/payer-authentication.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSUMER_AUTHENTICATION_ACTION,
  decidePayerAuthentication,
  parsePayerAuthenticationMode,
  payerAuthenticationActions,
  readPayerAuthenticationResult,
  validatePayerAuthenticationSetting,
} from "./payer-authentication.ts";
import { buildTransientTokenPaymentRequest } from "./transient-token-payment-request.ts";

test("off requests nothing; both on-modes request authentication", () => {
  assert.deepEqual(payerAuthenticationActions("off"), []);
  assert.deepEqual(payerAuthenticationActions("frictionless_only"), [CONSUMER_AUTHENTICATION_ACTION]);
  assert.deepEqual(payerAuthenticationActions("required"), [CONSUMER_AUTHENTICATION_ACTION]);
});

test("off leaves today's request byte-for-byte unchanged", () => {
  const base = {
    booking_id: "b1",
    provider_session_id: "s1",
    transient_token: "jwt",
    amount_due: 240,
    currency: "USD" as const,
  };
  const before = buildTransientTokenPaymentRequest(base);
  const after = buildTransientTokenPaymentRequest({ ...base, payer_authentication: "off" });
  assert.deepEqual(after, before);
  assert.deepEqual(before.processingInformation.actionList, ["DECISION_SKIP"]);
});

test("3DS and the Decision Manager skip travel in one actionList", () => {
  const req = buildTransientTokenPaymentRequest({
    booking_id: "b1",
    provider_session_id: "s1",
    transient_token: "jwt",
    amount_due: 240,
    currency: "USD",
    payer_authentication: "required",
  });
  assert.deepEqual(req.processingInformation.actionList, ["DECISION_SKIP", "CONSUMER_AUTHENTICATION"]);
});

test("an empty actionList is omitted rather than sent as []", () => {
  const req = buildTransientTokenPaymentRequest({
    booking_id: "b1",
    provider_session_id: "s1",
    transient_token: "jwt",
    amount_due: 240,
    currency: "USD",
    skip_decision_manager: false,
    payer_authentication: "off",
  });
  assert.equal("actionList" in req.processingInformation, false);
});

test("off never refuses anything", () => {
  const decision = decidePayerAuthentication("off", { eci: "07", cavv: "", status: "AUTHORIZED" });
  assert.deepEqual(decision, { action: "proceed", authenticated: false });
});

test("a silently verified cardholder proceeds with liability shifted", () => {
  for (const eci of ["05", "02", "06", "01"]) {
    const d = decidePayerAuthentication("required", { eci, cavv: "AAABBB==", status: "AUTHORIZED" });
    assert.deepEqual(d, { action: "proceed", authenticated: true }, `eci ${eci}`);
  }
});

test("ECI 7 with an empty CAVV — what Oraya sees live — is not authentication", () => {
  const lenient = decidePayerAuthentication("frictionless_only", { eci: "07", cavv: "", status: "AUTHORIZED" });
  assert.deepEqual(lenient, { action: "proceed", authenticated: false });

  const strict = decidePayerAuthentication("required", { eci: "07", cavv: "", status: "AUTHORIZED" });
  assert.equal(strict.action, "refuse");
  assert.equal(strict.action === "refuse" && strict.reason, "not_authenticated");
});

test("an ECI without a CAVV proves nothing, whatever the ECI says", () => {
  const d = decidePayerAuthentication("required", { eci: "05", cavv: "   ", status: "AUTHORIZED" });
  assert.equal(d.action, "refuse");
});

test("a bank challenge never strands the guest in lenient mode", () => {
  const d = decidePayerAuthentication("frictionless_only", {
    status: "PENDING_AUTHENTICATION",
    stepUpUrl: "https://issuer.example/step-up",
  });
  assert.deepEqual(d, { action: "proceed", authenticated: false });
});

test("a bank challenge is refused in strict mode, with copy the guest can act on", () => {
  const d = decidePayerAuthentication("required", {
    status: "PENDING_AUTHENTICATION",
    stepUpUrl: "https://issuer.example/step-up",
  });
  assert.equal(d.action, "refuse");
  assert.equal(d.action === "refuse" && d.reason, "challenge_required");
  assert.match(d.action === "refuse" ? d.guestMessage : "", /Nothing was charged/);
  assert.match(d.action === "refuse" ? d.guestMessage : "", /another card/);
});

test("a step-up URL alone counts as a challenge even without the status", () => {
  const d = decidePayerAuthentication("required", { stepUpUrl: "https://issuer.example/step-up" });
  assert.equal(d.action === "refuse" && d.reason, "challenge_required");
});

test("strict 3DS cannot be paired with immediate capture", () => {
  const conflict = validatePayerAuthenticationSetting({
    payer_authentication: "required",
    capture_immediately: true,
  });
  assert.equal(conflict.ok, false);
  assert.match(conflict.ok === false ? conflict.message : "", /hold/i);

  assert.deepEqual(
    validatePayerAuthenticationSetting({ payer_authentication: "required", capture_immediately: false }),
    { ok: true },
  );
  // The lenient mode never refuses, so it never needs to release a hold.
  assert.deepEqual(
    validatePayerAuthenticationSetting({ payer_authentication: "frictionless_only", capture_immediately: true }),
    { ok: true },
  );
});

test("the result is read from either ECI field name", () => {
  assert.equal(
    readPayerAuthenticationResult({ consumerAuthenticationInformation: { ecommerceIndicator: "05" } }).eci,
    "05",
  );
  assert.equal(
    readPayerAuthenticationResult({ consumerAuthenticationInformation: { eci: "07", ecommerceIndicator: "05" } }).eci,
    "07",
  );
  assert.deepEqual(readPayerAuthenticationResult(null), {
    eci: null, cavv: null, status: null, stepUpUrl: null,
  });
});

test("an unknown stored mode falls back to off rather than silently enabling 3DS", () => {
  for (const raw of ["", "yes", "true", null, undefined, 1, {}]) {
    assert.equal(parsePayerAuthenticationMode(raw), "off");
  }
  assert.equal(parsePayerAuthenticationMode("REQUIRED"), "required");
  assert.equal(parsePayerAuthenticationMode(" frictionless_only "), "frictionless_only");
});
