import crypto from "crypto";
import { compactDecrypt, decodeProtectedHeader, importPKCS8 } from "jose";
import {
  isDecisionManagerReject,
  readProviderReasonCode,
  readRiskDecision,
} from "./provider-settlement.ts";

/**
 * CyberSource webhook security follows the current Webhooks implementation
 * guide: payment/Unified Checkout payloads are compact JWE when the
 * organization's product registry enables payload encryption, and the
 * `v-c-signature` header signs `timestamp + "." + payload` with a separate
 * Base64-encoded digital-signature secret.
 *
 * Org-contract exception (2026-08-10, owner-approved): CyberSource's product
 * registry for Oraya's production organization reports
 * `payloadEncryption: false` for `unifiedCheckout` /
 * `uc.orders.transactionresults`, and live deliveries arrive as plaintext
 * JSON notifications. A plaintext body is therefore accepted ONLY when it is
 * a valid JSON object AND the timestamped `v-c-signature` verifies against
 * the distinct digital-signature key. Signature verification and durable
 * replay claiming remain mandatory for every delivery; encrypted (JWE)
 * payloads continue to be decrypted and key-checked exactly as before.
 */

export const WEBHOOK_SIGNATURE_HEADER = "v-c-signature";
export const WEBHOOK_TRACE_ID_HEADER = "v-c-transaction-trace-id";
export const WEBHOOK_ID_HEADER = "v-c-webhook-id";
export const WEBHOOK_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export const CREDIT_LIBANAIS_WEBHOOK_ENV_KEYS = [
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID",
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY",
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID",
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_KEY_ID",
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_SECRET",
] as const;

export type CreditLibanaisWebhookConfig = {
  mleKeyId: string;
  mlePrivateKey: string;
  mleCertificateId: string;
  signatureKeyId: string;
  signatureSecret: string;
};

export type WebhookConfigResult =
  | { ok: true; config: CreditLibanaisWebhookConfig }
  | { ok: false; missing: string[] };

export function readCreditLibanaisWebhookConfig(
  env: Record<string, string | undefined>,
): WebhookConfigResult {
  const missing = CREDIT_LIBANAIS_WEBHOOK_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim() === "";
  });
  if (missing.length > 0) return { ok: false, missing: [...missing] };
  return {
    ok: true,
    config: {
      mleKeyId: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID!.trim(),
      mlePrivateKey: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY!.trim(),
      mleCertificateId: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID!.trim(),
      signatureKeyId: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_KEY_ID!.trim(),
      signatureSecret: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_SECRET!.trim(),
    },
  };
}

function normalizePem(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

type WebhookBody =
  | { kind: "jwe"; compactJwe: string; envelope: Record<string, unknown> | null; nestedPayload: boolean }
  | { kind: "plaintext"; envelope: Record<string, unknown> };

function readWebhookBody(rawBody: string): WebhookBody {
  const trimmed = rawBody.trim();
  if (/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*){4}$/.test(trimmed)) {
    return { kind: "jwe", compactJwe: trimmed, envelope: null, nestedPayload: false };
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(trimmed);
  } catch {
    throw new Error("webhook_mle_invalid_envelope");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("webhook_mle_invalid_envelope");
  }
  const record = envelope as Record<string, unknown>;
  for (const key of ["encryptedPayload", "encryptedResponse", "encryptedRequest"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().split(".").length === 5) {
      return { kind: "jwe", compactJwe: value.trim(), envelope: record, nestedPayload: false };
    }
  }
  const nestedPayload = record.payload;
  if (typeof nestedPayload === "string" && nestedPayload.trim().split(".").length === 5) {
    return { kind: "jwe", compactJwe: nestedPayload.trim(), envelope: record, nestedPayload: true };
  }
  // No JWE anywhere in a valid JSON-object body: this is the org-contract
  // plaintext delivery (`payloadEncryption: false`). The caller MUST still
  // verify the `v-c-signature` header before trusting it.
  return { kind: "plaintext", envelope: record };
}

export async function decryptCreditLibanaisWebhookPayload({
  rawBody,
  config,
}: {
  rawBody: string;
  config: CreditLibanaisWebhookConfig;
}) {
  const body = readWebhookBody(rawBody);
  if (body.kind === "plaintext") {
    // Confidentiality is TLS-only on this path by provider contract; the
    // signature over `timestamp + "." + rawBody` is the authentication
    // boundary and is enforced by the caller before any state change.
    const nested = body.envelope.payload;
    if (typeof nested === "string") {
      let nestedParsed: unknown;
      try {
        nestedParsed = JSON.parse(nested);
      } catch {
        nestedParsed = null;
      }
      if (nestedParsed && typeof nestedParsed === "object") {
        return {
          signature_payload: rawBody,
          event_payload: JSON.stringify({ ...body.envelope, payload: nestedParsed }),
          payload_encrypted: false,
        };
      }
    }
    return { signature_payload: rawBody, event_payload: rawBody, payload_encrypted: false };
  }

  const encrypted = body;
  const decodedHeader = decodeProtectedHeader(encrypted.compactJwe);
  if (decodedHeader.alg !== "RSA-OAEP" && decodedHeader.alg !== "RSA-OAEP-256") {
    throw new Error("webhook_mle_unexpected_algorithm");
  }
  if (decodedHeader.enc !== "A256GCM") {
    throw new Error("webhook_mle_unexpected_encryption");
  }
  const privateKey = await importPKCS8(normalizePem(config.mlePrivateKey), decodedHeader.alg);
  const { plaintext, protectedHeader } = await compactDecrypt(encrypted.compactJwe, privateKey, {
    keyManagementAlgorithms: ["RSA-OAEP", "RSA-OAEP-256"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  if (
    protectedHeader.kid &&
    protectedHeader.kid !== config.mleKeyId &&
    protectedHeader.kid !== config.mleCertificateId
  ) {
    throw new Error("webhook_mle_key_id_mismatch");
  }
  const signaturePayload = new TextDecoder().decode(plaintext);
  if (!encrypted.nestedPayload || !encrypted.envelope) {
    return {
      signature_payload: signaturePayload,
      event_payload: signaturePayload,
      payload_encrypted: true,
    };
  }

  let decryptedNode: unknown;
  try {
    decryptedNode = JSON.parse(signaturePayload);
  } catch {
    throw new Error("webhook_mle_decrypted_payload_invalid_json");
  }
  return {
    signature_payload: signaturePayload,
    event_payload: JSON.stringify({ ...encrypted.envelope, payload: decryptedNode }),
    payload_encrypted: true,
  };
}

type ParsedSignature = { timestamp: string; keyId: string; signature: string };

export function parseWebhookSignatureHeader(value: string | undefined): ParsedSignature | null {
  if (!value?.trim()) return null;
  const fields = new Map<string, string>();
  for (const part of value.trim().replace(/^v-c-signature:\s*/i, "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    fields.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim().replace(/^"|"$/g, ""));
  }
  const timestamp = fields.get("t");
  const keyId = fields.get("keyId");
  const signature = fields.get("sig");
  return timestamp && keyId && signature ? { timestamp, keyId, signature } : null;
}

export function computeWebhookSignature(
  payload: string,
  signatureSecretBase64: string,
  timestamp: string | number,
) {
  return crypto
    .createHmac("sha256", Buffer.from(signatureSecretBase64, "base64"))
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("base64");
}

export function formatWebhookSignatureHeader({
  payload,
  keyId,
  signatureSecret,
  timestamp,
}: {
  payload: string;
  keyId: string;
  signatureSecret: string;
  timestamp: string | number;
}) {
  return `t=${timestamp};keyId=${keyId};sig=${computeWebhookSignature(payload, signatureSecret, timestamp)}`;
}

export type WebhookSignatureVerification =
  | { ok: true; timestamp: string; key_id: string }
  | {
      ok: false;
      reason:
        | "missing_signature"
        | "malformed_signature"
        | "key_id_mismatch"
        | "timestamp_out_of_tolerance"
        | "signature_mismatch";
    };

function timestampToMilliseconds(value: string) {
  if (!/^\d{10,16}$/.test(value)) return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) return null;
  return value.length <= 10 ? numeric * 1000 : numeric;
}

export function verifyCreditLibanaisWebhookSignature({
  payload,
  headers,
  config,
  now = Date.now(),
  toleranceMs = WEBHOOK_SIGNATURE_TOLERANCE_MS,
}: {
  payload: string;
  headers: Record<string, string>;
  config: CreditLibanaisWebhookConfig;
  now?: number;
  toleranceMs?: number;
}): WebhookSignatureVerification {
  const headerValue = headers[WEBHOOK_SIGNATURE_HEADER]?.trim();
  if (!headerValue) return { ok: false, reason: "missing_signature" };
  const parsed = parseWebhookSignatureHeader(headerValue);
  if (!parsed) return { ok: false, reason: "malformed_signature" };
  if (parsed.keyId !== config.signatureKeyId) {
    return { ok: false, reason: "key_id_mismatch" };
  }

  const timestampMs = timestampToMilliseconds(parsed.timestamp);
  if (timestampMs === null || Math.abs(now - timestampMs) > toleranceMs) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = Buffer.from(
    computeWebhookSignature(payload, config.signatureSecret, parsed.timestamp),
    "base64",
  );
  const provided = Buffer.from(parsed.signature, "base64");
  if (
    provided.length === 0 ||
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true, timestamp: parsed.timestamp, key_id: parsed.keyId };
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

export type CreditLibanaisWebhookOutcome = "success" | "failure" | "unknown";

export type CreditLibanaisWebhookEvent = {
  outcome: CreditLibanaisWebhookOutcome;
  idempotency_key: string | null;
  provider_transaction_id: string | null;
  event_type: string | null;
  raw_status: string | null;
  occurred_at: string | null;
  transaction_trace_id: string | null;
  /**
   * Phase 16B M1 — Decision Manager rejected the order (reason 481). The bank
   * may have approved the authorization, but settlement will never run, so the
   * event must never be treated as money received.
   */
  decision_manager_reject: boolean;
  provider_reason_code: string | null;
};

const SUCCESS_STATUSES = new Set(["AUTHORIZED", "CAPTURED", "TRANSMITTED", "SETTLED"]);
const FAILURE_STATUSES = new Set(["DECLINED", "FAILED", "VOIDED", "REVERSED", "INVALID_REQUEST"]);

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findFirstString(node: unknown, keys: readonly string[], depth: number): string | null {
  if (depth < 0 || !node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  if (!Array.isArray(node)) {
    for (const key of keys) {
      const direct = readTrimmedString(record[key]);
      if (direct) return direct;
    }
  }
  const children = Array.isArray(node) ? node : Object.values(record);
  for (const child of children) {
    const found = findFirstString(child, keys, depth - 1);
    if (found) return found;
  }
  return null;
}

function findClientReferenceCode(payload: unknown, depth: number): string | null {
  if (depth < 0 || !payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(payload)) {
    const cri = record.clientReferenceInformation;
    if (cri && typeof cri === "object" && !Array.isArray(cri)) {
      const code = readTrimmedString((cri as Record<string, unknown>).code);
      if (code) return code;
    }
  }
  const children = Array.isArray(payload) ? payload : Object.values(record);
  for (const child of children) {
    const found = findClientReferenceCode(child, depth - 1);
    if (found) return found;
  }
  return null;
}

function classifyOutcome(eventType: string | null, status: string | null): CreditLibanaisWebhookOutcome {
  const type = (eventType ?? "").toLowerCase();
  if (/refund|credit/.test(type)) return "unknown";
  const normalizedStatus = (status ?? "").toUpperCase();
  // Unified Checkout uses one transaction-results event type for both
  // approvals and declines, so an explicit provider status must win over the
  // generic event name.
  if (FAILURE_STATUSES.has(normalizedStatus)) return "failure";
  if (SUCCESS_STATUSES.has(normalizedStatus)) return "success";
  if (/reject|decline|void|reversal|fail/.test(type)) return "failure";
  if (/accept|capture|settle|transactionresults/.test(type)) return "success";
  return "unknown";
}

export function parseCreditLibanaisWebhookEvent(payload: string): CreditLibanaisWebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const eventType = readTrimmedString(record.eventType) ?? findFirstString(parsed, ["eventType"], 4);
  const status = findFirstString(parsed, ["status"], 5);
  const idempotencyKey = findClientReferenceCode(parsed, 6);
  const transactionId =
    findFirstString(parsed, ["transactionId"], 5) ??
    findFirstString(parsed, ["requestId"], 5) ??
    findFirstString(parsed, ["id"], 5);

  const reasonCode =
    readProviderReasonCode(parsed) ?? findFirstString(parsed, ["reasonCode"], 5);
  const decisionManagerReject = isDecisionManagerReject({
    reason_code: reasonCode,
    error_reason: findFirstString(parsed, ["reason"], 5),
    risk_decision: readRiskDecision(parsed) ?? findFirstString(parsed, ["decision"], 6),
    status,
  });

  return {
    // A Decision Manager rejection is never money received. Downgrade to
    // "unknown" so reconciliation changes nothing rather than inventing either
    // a payment or a decline from a payload this integration has not proven.
    outcome: decisionManagerReject ? "unknown" : classifyOutcome(eventType, status),
    idempotency_key: idempotencyKey,
    provider_transaction_id: transactionId,
    event_type: eventType,
    raw_status: status,
    occurred_at: readTrimmedString(record.eventDate),
    transaction_trace_id: readTrimmedString(record.transactionTraceId),
    decision_manager_reject: decisionManagerReject,
    provider_reason_code: reasonCode,
  };
}

export function buildCreditLibanaisWebhookReplayKey(event: CreditLibanaisWebhookEvent) {
  return crypto.createHash("sha256").update(JSON.stringify({
    event_type: event.event_type,
    idempotency_key: event.idempotency_key,
    provider_transaction_id: event.provider_transaction_id,
    outcome: event.outcome,
    raw_status: event.raw_status,
  })).digest("hex");
}
