/**
 * Plan 4 Phase 2 (2.2) — webhook verification must fail closed: missing
 * config is detected (the endpoint 503s), unsigned/tampered payloads are
 * refused (the endpoint 401s), and only signed payloads verify.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/credit-libanais-webhook.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeWebhookSignature,
  parseCreditLibanaisWebhookEvent,
  readCreditLibanaisWebhookConfig,
  verifyCreditLibanaisWebhookSignature,
  WEBHOOK_KEY_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  type CreditLibanaisWebhookConfig,
} from "./credit-libanais-webhook.ts";

const SECRET = Buffer.from("plan4-webhook-test-secret").toString("base64");

const CONFIG: CreditLibanaisWebhookConfig = {
  keyId: "mle-key-1",
  privateKey: SECRET,
  certificateId: "cert-1",
};

function signedHeaders(rawBody: string, overrides: Record<string, string> = {}) {
  return {
    [WEBHOOK_SIGNATURE_HEADER]: computeWebhookSignature(rawBody, SECRET),
    [WEBHOOK_KEY_ID_HEADER]: CONFIG.keyId,
    ...overrides,
  };
}

// ── config ──────────────────────────────────────────────────────────────────

test("config: all three MLE env vars present ⇒ ok", () => {
  const result = readCreditLibanaisWebhookConfig({
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID: "mle-key-1",
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY: SECRET,
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID: "cert-1",
  });
  assert.equal(result.ok, true);
});

test("config: any missing/blank MLE env var ⇒ not ok with the missing names (endpoint 503s)", () => {
  const result = readCreditLibanaisWebhookConfig({
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID: "mle-key-1",
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY: "   ",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.missing, [
    "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY",
    "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID",
  ]);
});

// ── signature ────────────────────────────────────────────────────────────────

test("signature: correctly signed payload verifies", () => {
  const rawBody = JSON.stringify({ eventType: "payments.payments.accept" });
  const v = verifyCreditLibanaisWebhookSignature({
    rawBody,
    headers: signedHeaders(rawBody),
    config: CONFIG,
  });
  assert.deepEqual(v, { ok: true });
});

test("signature: unsigned payload is refused (endpoint 401s)", () => {
  const rawBody = JSON.stringify({ eventType: "payments.payments.accept" });
  const v = verifyCreditLibanaisWebhookSignature({ rawBody, headers: {}, config: CONFIG });
  assert.deepEqual(v, { ok: false, reason: "missing_signature" });
});

test("signature: tampered body is refused", () => {
  const rawBody = JSON.stringify({ eventType: "payments.payments.accept", amount: "100" });
  const headers = signedHeaders(rawBody);
  const tampered = rawBody.replace('"100"', '"999"');
  const v = verifyCreditLibanaisWebhookSignature({ rawBody: tampered, headers, config: CONFIG });
  assert.deepEqual(v, { ok: false, reason: "signature_mismatch" });
});

test("signature: signature made with the wrong key is refused", () => {
  const rawBody = JSON.stringify({ eventType: "payments.payments.accept" });
  const wrongKey = Buffer.from("some-other-secret").toString("base64");
  const headers = signedHeaders(rawBody, {
    [WEBHOOK_SIGNATURE_HEADER]: computeWebhookSignature(rawBody, wrongKey),
  });
  const v = verifyCreditLibanaisWebhookSignature({ rawBody, headers, config: CONFIG });
  assert.deepEqual(v, { ok: false, reason: "signature_mismatch" });
});

test("signature: mismatched v-c-key-id is refused", () => {
  const rawBody = JSON.stringify({ eventType: "payments.payments.accept" });
  const headers = signedHeaders(rawBody, { [WEBHOOK_KEY_ID_HEADER]: "someone-elses-key" });
  const v = verifyCreditLibanaisWebhookSignature({ rawBody, headers, config: CONFIG });
  assert.deepEqual(v, { ok: false, reason: "key_id_mismatch" });
});

// ── event parsing ────────────────────────────────────────────────────────────

test("parse: capture-accept event with nested reference and transaction id", () => {
  const event = parseCreditLibanaisWebhookEvent(
    JSON.stringify({
      eventType: "payments.captures.accept",
      payload: {
        data: {
          id: "envelope-should-not-win",
          transactionId: "716000000001",
          clientReferenceInformation: { code: "oraya-att-abc-123" },
          status: "CAPTURED",
        },
      },
    }),
  );
  assert.ok(event);
  assert.equal(event.outcome, "success");
  assert.equal(event.idempotency_key, "oraya-att-abc-123");
  assert.equal(event.provider_transaction_id, "716000000001");
});

test("parse: reject/decline events classify as failure", () => {
  for (const eventType of ["payments.payments.reject", "payments.voids.accept"]) {
    const event = parseCreditLibanaisWebhookEvent(
      JSON.stringify({
        eventType,
        payload: { clientReferenceInformation: { code: "oraya-att-x" } },
      }),
    );
    assert.ok(event);
    assert.equal(event.outcome, "failure", eventType);
  }
});

test("parse: status alone classifies when eventType is absent", () => {
  const authorized = parseCreditLibanaisWebhookEvent(
    JSON.stringify({ data: { status: "AUTHORIZED", clientReferenceInformation: { code: "oraya-att-y" } } }),
  );
  assert.equal(authorized?.outcome, "success");
  const declined = parseCreditLibanaisWebhookEvent(
    JSON.stringify({ data: { status: "DECLINED" } }),
  );
  assert.equal(declined?.outcome, "failure");
});

test("parse: refund/credit notifications never classify as charge success", () => {
  const event = parseCreditLibanaisWebhookEvent(
    JSON.stringify({
      eventType: "payments.refunds.accept",
      payload: { clientReferenceInformation: { code: "oraya-att-z" }, status: "CAPTURED" },
    }),
  );
  assert.equal(event?.outcome, "unknown");
});

test("parse: non-JSON and non-object bodies return null", () => {
  assert.equal(parseCreditLibanaisWebhookEvent("not json"), null);
  assert.equal(parseCreditLibanaisWebhookEvent(JSON.stringify(["array"])), null);
});
