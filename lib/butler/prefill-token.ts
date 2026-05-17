import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
const TOKEN_VERSION = 1;
const TOKEN_PURPOSE = "prefill";

export type PrefillTokenPayload = {
  lead_id: string;
  exp: number;
  jti: string;
  v: 1;
  purpose: "prefill";
};

export type VerifyPrefillTokenResult =
  | { ok: true; payload: PrefillTokenPayload }
  | { ok: false; reason: "invalid" | "expired" };

function getPrefillSecret(): string {
  const secret = process.env.BUTLER_PREFILL_SECRET?.trim();
  if (!secret) {
    throw new Error("[butler-prefill-token] BUTLER_PREFILL_SECRET is required.");
  }
  return secret;
}

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64urlDecode(input: string): Buffer | null {
  try {
    return Buffer.from(input, "base64url");
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function isPrefillPayload(value: unknown): value is PrefillTokenPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<PrefillTokenPayload>;
  return (
    typeof payload.lead_id === "string" &&
    payload.lead_id.trim().length > 0 &&
    typeof payload.exp === "number" &&
    Number.isInteger(payload.exp) &&
    typeof payload.jti === "string" &&
    payload.jti.trim().length > 0 &&
    payload.v === TOKEN_VERSION &&
    payload.purpose === TOKEN_PURPOSE
  );
}

export function createPrefillToken(
  leadId: string,
  opts?: { expiresAt?: number },
): string {
  const trimmedLeadId = leadId.trim();
  if (!trimmedLeadId) {
    throw new Error("[butler-prefill-token] leadId is required.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: PrefillTokenPayload = {
    lead_id: trimmedLeadId,
    exp: opts?.expiresAt ?? now + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
    v: TOKEN_VERSION,
    purpose: TOKEN_PURPOSE,
  };

  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, getPrefillSecret());
  return `${encodedPayload}.${signature}`;
}

export function verifyPrefillToken(token: string): VerifyPrefillTokenResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "invalid" };
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload, getPrefillSecret());
  if (!timingSafeStringEqual(providedSignature, expectedSignature)) {
    return { ok: false, reason: "invalid" };
  }

  const decodedPayload = base64urlDecode(encodedPayload);
  if (!decodedPayload) {
    return { ok: false, reason: "invalid" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedPayload.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!isPrefillPayload(parsed)) {
    return { ok: false, reason: "invalid" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp <= now) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload: parsed };
}
