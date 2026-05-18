import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export type PrefillTokenClaims = {
  lead_id: string;
  exp: number;
  jti: string;
  v: 1;
  purpose: "prefill";
};

export type VerifyPrefillTokenResult =
  | { ok: true; claims: PrefillTokenClaims }
  | { ok: false; reason: "invalid" | "expired" };

const TOKEN_VERSION = 1 as const;
const TOKEN_PURPOSE = "prefill" as const;
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

function getPrefillSecret(): string | null {
  const secret = process.env.BUTLER_PREFILL_SECRET;
  return secret?.trim() ? secret.trim() : null;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): Buffer | null {
  try {
    return Buffer.from(input, "base64url");
  } catch {
    return null;
  }
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function isPrefillTokenClaims(value: unknown): value is PrefillTokenClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.lead_id === "string" &&
    claims.lead_id.trim().length > 0 &&
    typeof claims.exp === "number" &&
    Number.isInteger(claims.exp) &&
    typeof claims.jti === "string" &&
    claims.jti.trim().length > 0 &&
    claims.v === TOKEN_VERSION &&
    claims.purpose === TOKEN_PURPOSE
  );
}

export function canIssuePrefillToken(): boolean {
  return getPrefillSecret() !== null;
}

export function createPrefillToken(leadId: string, nowUnix = Math.floor(Date.now() / 1000)): string {
  const secret = getPrefillSecret();
  if (!secret) {
    throw new Error("BUTLER_PREFILL_SECRET is not set.");
  }

  const claims: PrefillTokenClaims = {
    lead_id: leadId,
    exp: nowUnix + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
    v: TOKEN_VERSION,
    purpose: TOKEN_PURPOSE,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signatureB64 = signPayload(payloadB64, secret);
  return `${payloadB64}.${signatureB64}`;
}

export function verifyPrefillToken(token: string, nowUnix = Math.floor(Date.now() / 1000)): VerifyPrefillTokenResult {
  const secret = getPrefillSecret();
  if (!secret) {
    return { ok: false, reason: "invalid" };
  }

  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, reason: "invalid" };
  }

  const [payloadB64, signatureB64, extra] = token.trim().split(".");
  if (!payloadB64 || !signatureB64 || extra !== undefined) {
    return { ok: false, reason: "invalid" };
  }

  const expectedSig = signPayload(payloadB64, secret);
  if (!timingSafeStringEqual(signatureB64, expectedSig)) {
    return { ok: false, reason: "invalid" };
  }

  const payloadBuf = base64UrlDecode(payloadB64);
  if (!payloadBuf) {
    return { ok: false, reason: "invalid" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!isPrefillTokenClaims(parsed)) {
    return { ok: false, reason: "invalid" };
  }

  if (parsed.exp <= nowUnix) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, claims: parsed };
}
