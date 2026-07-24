import crypto from "crypto";

/**
 * Plan 4 Phase 2 — CyberSource/NetCommerce webhook verification and event
 * parsing (pure; the Supabase wiring lives in
 * lib/payments/credit-libanais-webhook-handler.ts).
 *
 * Fail-closed contract (the part that is GUARANTEED regardless of the final
 * NetCommerce delivery spec):
 *   - verification config incomplete  ⇒ the endpoint refuses (503) and never
 *     processes the payload;
 *   - missing / mismatched signature  ⇒ 401 + structured log, no state change;
 *   - only a VERIFIED payload may transition any payment attempt or booking.
 *
 * Signature scheme implemented today: `v-c-signature` = Base64(
 * HMAC-SHA256(rawBody) ) keyed with the Base64-decoded
 * NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY, plus an exact
 * `v-c-key-id` match when that header is present. If NetCommerce's delivered
 * production spec differs (e.g. JWS over the body), adapt THIS module only —
 * the fail-closed contract and the reconciliation layer stay unchanged.
 *
 * Relative .ts imports so node:test can load this module (repo test convention).
 */

export const WEBHOOK_SIGNATURE_HEADER = "v-c-signature";
export const WEBHOOK_KEY_ID_HEADER = "v-c-key-id";

export const CREDIT_LIBANAIS_WEBHOOK_ENV_KEYS = [
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID",
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY",
  "NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID",
] as const;

export type CreditLibanaisWebhookConfig = {
  keyId: string;
  /** Base64 secret material used as the HMAC verification key. */
  privateKey: string;
  certificateId: string;
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
  if (missing.length > 0) {
    return { ok: false, missing: [...missing] };
  }
  return {
    ok: true,
    config: {
      keyId: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID!.trim(),
      privateKey: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY!.trim(),
      certificateId: env.NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID!.trim(),
    },
  };
}

export type WebhookSignatureVerification =
  | { ok: true }
  | { ok: false; reason: "missing_signature" | "key_id_mismatch" | "signature_mismatch" };

export function computeWebhookSignature(rawBody: string, privateKeyBase64: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(privateKeyBase64, "base64"))
    .update(rawBody, "utf8")
    .digest("base64");
}

export function verifyCreditLibanaisWebhookSignature({
  rawBody,
  headers,
  config,
}: {
  rawBody: string;
  /** Header names must already be lower-cased. */
  headers: Record<string, string>;
  config: CreditLibanaisWebhookConfig;
}): WebhookSignatureVerification {
  const signature = headers[WEBHOOK_SIGNATURE_HEADER]?.trim();
  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const keyIdHeader = headers[WEBHOOK_KEY_ID_HEADER]?.trim();
  if (keyIdHeader && keyIdHeader !== config.keyId) {
    return { ok: false, reason: "key_id_mismatch" };
  }

  const expected = computeWebhookSignature(rawBody, config.privateKey);
  const provided = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

export type CreditLibanaisWebhookOutcome = "success" | "failure" | "unknown";

export type CreditLibanaisWebhookEvent = {
  outcome: CreditLibanaisWebhookOutcome;
  /** clientReferenceInformation.code — our attempt-derived merchant reference. */
  idempotency_key: string | null;
  provider_transaction_id: string | null;
  event_type: string | null;
  raw_status: string | null;
};

const SUCCESS_STATUSES = new Set(["AUTHORIZED", "CAPTURED", "TRANSMITTED", "SETTLED"]);
const FAILURE_STATUSES = new Set(["DECLINED", "FAILED", "VOIDED", "REVERSED", "INVALID_REQUEST"]);

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Bounded recursive search for the first string value at `path`-like keys. */
function findFirstString(
  node: unknown,
  keys: readonly string[],
  depth: number,
): string | null {
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

  // Refund/credit notifications never resolve a CHARGE attempt — refunds are
  // manual-first (docs/system/REFUND_RUNBOOK.md) and handled by a human.
  if (/refund|credit/.test(type)) return "unknown";

  if (/reject|decline|void|reversal|fail/.test(type)) return "failure";
  if (/accept|capture|settle/.test(type)) return "success";

  const normalizedStatus = (status ?? "").toUpperCase();
  if (SUCCESS_STATUSES.has(normalizedStatus)) return "success";
  if (FAILURE_STATUSES.has(normalizedStatus)) return "failure";

  return "unknown";
}

/**
 * Defensive parse of a VERIFIED webhook payload. Returns null when the body is
 * not a JSON object at all; otherwise always returns an event (possibly with
 * outcome "unknown" and null references — the reconciliation layer ignores
 * those without any state change).
 */
export function parseCreditLibanaisWebhookEvent(rawBody: string): CreditLibanaisWebhookEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const record = payload as Record<string, unknown>;
  const eventType = readTrimmedString(record.eventType) ?? findFirstString(payload, ["eventType"], 4);
  const status = findFirstString(payload, ["status"], 5);
  const idempotencyKey = findClientReferenceCode(payload, 6);
  // Whole-tree pass per key so a specific `transactionId` anywhere beats a
  // shallower generic `id` (webhook envelopes carry their own notification id).
  const transactionId =
    findFirstString(payload, ["transactionId"], 5) ??
    findFirstString(payload, ["requestId"], 5) ??
    findFirstString(payload, ["id"], 5);

  return {
    outcome: classifyOutcome(eventType, status),
    idempotency_key: idempotencyKey,
    provider_transaction_id: transactionId,
    event_type: eventType,
    raw_status: status,
  };
}
