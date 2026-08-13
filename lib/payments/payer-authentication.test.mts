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
  resolveEffectivePayerAuthenticationMode,
  validatePayerAuthenticationSetting,
} from "./payer-authentication.ts";
import {
  RETRY_SAFE_PROVIDER_PAYMENT_STATUSES,
  isApprovedProviderPaymentStatus,
} from "./provider-payment-status.ts";
import { classifyProviderAuthorizationOutcome } from "./unified-checkout-completion.ts";
import { buildTransientTokenPaymentRequest } from "./transient-token-payment-request.ts";

test("only strict mode requests authentication; the retired mode requests nothing", () => {
  assert.deepEqual(payerAuthenticationActions("off"), []);
  assert.deepEqual(payerAuthenticationActions("required"), [CONSUMER_AUTHENTICATION_ACTION]);
  assert.deepEqual(
    payerAuthenticationActions("frictionless_only"),
    [],
    "retired: a legacy stored value must not activate 3DS at runtime",
  );
});

test("the retired mode resolves to off, never to strict", () => {
  assert.equal(resolveEffectivePayerAuthenticationMode("off"), "off");
  assert.equal(resolveEffectivePayerAuthenticationMode("required"), "required");
  // Resolving to "required" would start refusing real cards on a setting
  // nobody deliberately chose.
  assert.equal(resolveEffectivePayerAuthenticationMode("frictionless_only"), "off");
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
  const off = decidePayerAuthentication("off", { eci: "07", cavv: "", status: "AUTHORIZED" });
  assert.deepEqual(off, { action: "proceed", authenticated: false });

  const strict = decidePayerAuthentication("required", { eci: "07", cavv: "", status: "AUTHORIZED" });
  assert.equal(strict.action, "refuse");
  assert.equal(strict.action === "refuse" && strict.reason, "not_authenticated");
});

test("an ECI without a CAVV proves nothing, whatever the ECI says", () => {
  const d = decidePayerAuthentication("required", { eci: "05", cavv: "   ", status: "AUTHORIZED" });
  assert.equal(d.action, "refuse");
});

test("the retired mode never reaches the challenge verdict at all", () => {
  // It requests no authentication, so a step-up cannot arise; and if a stale
  // response somehow carried one, the mode behaves as `off`.
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
});

test("the retired mode is refused at save time, not silently stored as off", () => {
  for (const capture_immediately of [true, false]) {
    const conflict = validatePayerAuthenticationSetting({
      payer_authentication: "frictionless_only",
      capture_immediately,
    });
    assert.equal(conflict.ok, false, `capture_immediately=${capture_immediately}`);
    // The operator must be told what to pick instead, not just refused.
    assert.match(conflict.ok === false ? conflict.message : "", /no longer available/i);
    assert.match(conflict.ok === false ? conflict.message : "", /Off/);
  }
});

test("the retired mode still parses, so the save path can see it and object", () => {
  // If parsing swallowed it to "off", validate would never fire and an
  // operator's explicit choice would vanish with nothing to see.
  assert.equal(parsePayerAuthenticationMode("frictionless_only"), "frictionless_only");
  assert.equal(
    validatePayerAuthenticationSetting({
      payer_authentication: parsePayerAuthenticationMode("frictionless_only"),
      capture_immediately: true,
    }).ok,
    false,
  );
});

test("a 3-D Secure step-up releases the attempt instead of locking the booking", () => {
  // Reason 475: CyberSource stopped before authorizing, so no money moved and
  // the guest must be free to try again. Classifying it "unknown" left the
  // booking behind an ambiguous attempt only a human could clear.
  assert.ok(
    (RETRY_SAFE_PROVIDER_PAYMENT_STATUSES as readonly string[]).includes("PENDING_AUTHENTICATION"),
  );
  assert.equal(isApprovedProviderPaymentStatus("PENDING_AUTHENTICATION"), false);

  const outcome = classifyProviderAuthorizationOutcome({
    response_ok: true,
    status: "PENDING_AUTHENTICATION",
    approved_statuses: ["AUTHORIZED", "CAPTURED"],
    retry_safe_decline_statuses: RETRY_SAFE_PROVIDER_PAYMENT_STATUSES,
    approval_verified: false,
  });
  assert.equal(outcome, "declined");
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
  // W7 slice 4 added accessToken and authenticationTransactionId to the shape.
  // Both were previously dropped on the floor; an absent payload yields null
  // for every field, as before.
  assert.deepEqual(readPayerAuthenticationResult(null), {
    eci: null,
    cavv: null,
    status: null,
    stepUpUrl: null,
    accessToken: null,
    authenticationTransactionId: null,
  });
});

test("an unknown stored mode falls back to off rather than silently enabling 3DS", () => {
  for (const raw of ["", "yes", "true", null, undefined, 1, {}]) {
    assert.equal(parsePayerAuthenticationMode(raw), "off");
  }
  assert.equal(parsePayerAuthenticationMode("REQUIRED"), "required");
  assert.equal(parsePayerAuthenticationMode(" frictionless_only "), "frictionless_only");
});
