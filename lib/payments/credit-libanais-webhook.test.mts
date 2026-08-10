import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { CompactEncrypt, importSPKI } from "jose";

import {
  buildCreditLibanaisWebhookReplayKey,
  decryptCreditLibanaisWebhookPayload,
  formatWebhookSignatureHeader,
  parseCreditLibanaisWebhookEvent,
  readCreditLibanaisWebhookConfig,
  verifyCreditLibanaisWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  type CreditLibanaisWebhookConfig,
} from "./credit-libanais-webhook.ts";

const SIGNATURE_SECRET = Buffer.from("phase-16b-webhook-signature-secret").toString("base64");
const NOW = 1_800_000_000_000;
const TIMESTAMP = String(NOW);
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const CONFIG: CreditLibanaisWebhookConfig = {
  mleKeyId: "mle-key-1",
  mlePrivateKey: privateKey,
  mleCertificateId: "mle-cert-1",
  signatureKeyId: "signature-key-1",
  signatureSecret: SIGNATURE_SECRET,
};

function signedHeaders(payload: string, overrides: Record<string, string> = {}) {
  return {
    [WEBHOOK_SIGNATURE_HEADER]: formatWebhookSignatureHeader({
      payload,
      keyId: CONFIG.signatureKeyId,
      signatureSecret: SIGNATURE_SECRET,
      timestamp: TIMESTAMP,
    }),
    ...overrides,
  };
}

async function encryptPayload(payload: string, keyId = CONFIG.mleKeyId) {
  const encryptionKey = await importSPKI(publicKey, "RSA-OAEP-256");
  const jwe = await new CompactEncrypt(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid: keyId })
    .encrypt(encryptionKey);
  return JSON.stringify({ encryptedPayload: jwe });
}

test("config requires separate MLE and digital-signature credentials", () => {
  const result = readCreditLibanaisWebhookConfig({
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID: "mle-key-1",
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY: privateKey,
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID: "mle-cert-1",
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_KEY_ID: "signature-key-1",
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_SECRET: SIGNATURE_SECRET,
  });
  assert.equal(result.ok, true);
});

test("config fails closed when digital-signature credentials are missing", () => {
  const result = readCreditLibanaisWebhookConfig({
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID: "mle-key-1",
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY: privateKey,
    NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID: "mle-cert-1",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.missing, [
    "NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_KEY_ID",
    "NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_SECRET",
  ]);
});

test("MLE decrypts an A256GCM compact JWE envelope", async () => {
  const payload = JSON.stringify({ eventType: "uc.orders.transactionresults", status: "AUTHORIZED" });
  const decrypted = await decryptCreditLibanaisWebhookPayload({
    rawBody: await encryptPayload(payload),
    config: CONFIG,
  });
  assert.deepEqual(decrypted, {
    signature_payload: payload,
    event_payload: payload,
    payload_encrypted: true,
  });
});

test("MLE supports an encrypted payload nested inside notification metadata", async () => {
  const payload = JSON.stringify({
    details: {
      status: "AUTHORIZED",
      clientReferenceInformation: { code: "oraya-att-nested" },
    },
  });
  const envelope = JSON.parse(await encryptPayload(payload)) as { encryptedPayload: string };
  const decrypted = await decryptCreditLibanaisWebhookPayload({
    rawBody: JSON.stringify({
      eventType: "uc.orders.transactionresults",
      transactionTraceId: "trace-nested",
      payload: envelope.encryptedPayload,
    }),
    config: CONFIG,
  });
  assert.equal(decrypted.signature_payload, payload);
  const event = parseCreditLibanaisWebhookEvent(decrypted.event_payload);
  assert.equal(event?.event_type, "uc.orders.transactionresults");
  assert.equal(event?.idempotency_key, "oraya-att-nested");
  assert.equal(event?.transaction_trace_id, "trace-nested");
});

test("MLE refuses an unexpected protected key id", async () => {
  const rawBody = await encryptPayload(JSON.stringify({ eventType: "x" }), "someone-elses-key");
  await assert.rejects(
    () => decryptCreditLibanaisWebhookPayload({ rawBody, config: CONFIG }),
    /webhook_mle_key_id_mismatch/,
  );
});

test("signature verifies timestamp dot decrypted-payload with the signature key", () => {
  const payload = JSON.stringify({ eventType: "payments.payments.accept" });
  const verification = verifyCreditLibanaisWebhookSignature({
    payload,
    headers: signedHeaders(payload),
    config: CONFIG,
    now: NOW,
  });
  assert.deepEqual(verification, { ok: true, timestamp: TIMESTAMP, key_id: "signature-key-1" });
});

test("signature rejects unsigned, malformed, stale, wrong-key, and tampered payloads", () => {
  const payload = JSON.stringify({ eventType: "payments.payments.accept" });
  assert.deepEqual(
    verifyCreditLibanaisWebhookSignature({ payload, headers: {}, config: CONFIG, now: NOW }),
    { ok: false, reason: "missing_signature" },
  );
  assert.deepEqual(
    verifyCreditLibanaisWebhookSignature({
      payload,
      headers: { [WEBHOOK_SIGNATURE_HEADER]: "not-a-signature" },
      config: CONFIG,
      now: NOW,
    }),
    { ok: false, reason: "malformed_signature" },
  );
  assert.deepEqual(
    verifyCreditLibanaisWebhookSignature({
      payload,
      headers: {
        [WEBHOOK_SIGNATURE_HEADER]: formatWebhookSignatureHeader({
          payload,
          keyId: CONFIG.signatureKeyId,
          signatureSecret: SIGNATURE_SECRET,
          timestamp: NOW - 6 * 60 * 1000,
        }),
      },
      config: CONFIG,
      now: NOW,
    }),
    { ok: false, reason: "timestamp_out_of_tolerance" },
  );
  assert.deepEqual(
    verifyCreditLibanaisWebhookSignature({
      payload,
      headers: {
        [WEBHOOK_SIGNATURE_HEADER]: formatWebhookSignatureHeader({
          payload,
          keyId: "wrong-key",
          signatureSecret: SIGNATURE_SECRET,
          timestamp: TIMESTAMP,
        }),
      },
      config: CONFIG,
      now: NOW,
    }),
    { ok: false, reason: "key_id_mismatch" },
  );
  assert.deepEqual(
    verifyCreditLibanaisWebhookSignature({
      payload: payload.replace("accept", "reject"),
      headers: signedHeaders(payload),
      config: CONFIG,
      now: NOW,
    }),
    { ok: false, reason: "signature_mismatch" },
  );
});

test("parse extracts Unified Checkout reference, transaction, occurrence, and trace", () => {
  const event = parseCreditLibanaisWebhookEvent(JSON.stringify({
    eventType: "uc.orders.transactionresults",
    eventDate: "2026-08-08T20:00:00Z",
    transactionTraceId: "trace-1",
    payload: {
      details: {
        transactionId: "716000000001",
        clientReferenceInformation: { code: "oraya-att-abc-123" },
        status: "AUTHORIZED",
      },
    },
  }));
  assert.ok(event);
  assert.equal(event.outcome, "success");
  assert.equal(event.idempotency_key, "oraya-att-abc-123");
  assert.equal(event.provider_transaction_id, "716000000001");
  assert.equal(event.occurred_at, "2026-08-08T20:00:00Z");
  assert.equal(event.transaction_trace_id, "trace-1");
});

test("parse keeps refunds unknown and classifies terminal declines", () => {
  assert.equal(parseCreditLibanaisWebhookEvent(JSON.stringify({
    eventType: "payments.refunds.accept",
    payload: { status: "CAPTURED" },
  }))?.outcome, "unknown");
  assert.equal(parseCreditLibanaisWebhookEvent(JSON.stringify({
    eventType: "payments.payments.reject",
    payload: { status: "DECLINED" },
  }))?.outcome, "failure");
  assert.equal(parseCreditLibanaisWebhookEvent(JSON.stringify({
    eventType: "uc.orders.transactionresults",
    payload: { status: "DECLINED" },
  }))?.outcome, "failure");
});

test("replay key is stable across provider delivery retries", () => {
  const base = parseCreditLibanaisWebhookEvent(JSON.stringify({
    eventType: "payments.payments.accept",
    transactionTraceId: "delivery-1",
    payload: {
      transactionId: "txn-1",
      clientReferenceInformation: { code: "oraya-att-1" },
      status: "AUTHORIZED",
    },
  }));
  const retry = base && { ...base, transaction_trace_id: "delivery-2" };
  assert.ok(base && retry);
  assert.equal(buildCreditLibanaisWebhookReplayKey(base), buildCreditLibanaisWebhookReplayKey(retry));
});

test("parse rejects non-JSON and non-object decrypted payloads", () => {
  assert.equal(parseCreditLibanaisWebhookEvent("not json"), null);
  assert.equal(parseCreditLibanaisWebhookEvent(JSON.stringify(["array"])), null);
});

// ---------------------------------------------------------------------------
// Org-contract plaintext deliveries (payloadEncryption=false, 2026-08-10)
// ---------------------------------------------------------------------------

test("plaintext org-contract delivery is accepted as JSON and marked unencrypted", async () => {
  const rawBody = JSON.stringify({
    webhookId: "wh-1",
    eventType: "uc.orders.transactionresults",
    payload: JSON.stringify({
      status: "AUTHORIZED",
      clientReferenceInformation: { code: "oraya-att-1" },
    }),
  });
  const decrypted = await decryptCreditLibanaisWebhookPayload({ rawBody, config: CONFIG });
  assert.equal(decrypted.payload_encrypted, false);
  assert.equal(decrypted.signature_payload, rawBody);
  const event = JSON.parse(decrypted.event_payload);
  assert.equal(event.payload.status, "AUTHORIZED");
  assert.equal(event.payload.clientReferenceInformation.code, "oraya-att-1");
});

test("plaintext delivery signature verifies over the exact raw body", async () => {
  const rawBody = JSON.stringify({ eventType: "uc.orders.transactionresults", payload: "{}" });
  const decrypted = await decryptCreditLibanaisWebhookPayload({ rawBody, config: CONFIG });
  const verification = verifyCreditLibanaisWebhookSignature({
    payload: decrypted.signature_payload,
    headers: signedHeaders(rawBody),
    config: CONFIG,
    now: NOW,
  });
  assert.equal(verification.ok, true);
});

test("plaintext delivery without a signature is still refused (missing_signature)", async () => {
  const rawBody = JSON.stringify({ eventType: "uc.orders.transactionresults" });
  const decrypted = await decryptCreditLibanaisWebhookPayload({ rawBody, config: CONFIG });
  const verification = verifyCreditLibanaisWebhookSignature({
    payload: decrypted.signature_payload,
    headers: {},
    config: CONFIG,
    now: NOW,
  });
  assert.equal(verification.ok, false);
  if (!verification.ok) assert.equal(verification.reason, "missing_signature");
});

test("plaintext delivery with a tampered body fails signature verification", async () => {
  const rawBody = JSON.stringify({ eventType: "uc.orders.transactionresults", amount: "10.00" });
  const tampered = rawBody.replace("10.00", "99.00");
  const verification = verifyCreditLibanaisWebhookSignature({
    payload: tampered,
    headers: signedHeaders(rawBody),
    config: CONFIG,
    now: NOW,
  });
  assert.equal(verification.ok, false);
  if (!verification.ok) assert.equal(verification.reason, "signature_mismatch");
});

test("non-JSON webhook bodies are still rejected", async () => {
  await assert.rejects(
    () => decryptCreditLibanaisWebhookPayload({ rawBody: "not-json-not-jwe", config: CONFIG }),
    /webhook_mle_invalid_envelope/,
  );
});

test("encrypted deliveries are marked payload_encrypted", async () => {
  const payload = JSON.stringify({ eventType: "uc.orders.transactionresults", status: "AUTHORIZED" });
  const rawBody = await encryptPayload(payload);
  const decrypted = await decryptCreditLibanaisWebhookPayload({ rawBody, config: CONFIG });
  assert.equal(decrypted.payload_encrypted, true);
});
