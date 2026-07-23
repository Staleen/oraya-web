import { createHmac, randomUUID, timingSafeEqual } from "crypto";
// Relative .ts imports so node:test can load this module (repo test convention).
import { ADMIN_PASSWORD_MIN_LENGTH } from "./admin-change-password.ts";
import { hashAdminPassword } from "./admin-password.ts";

/**
 * Remediation 2 (A.2) — admin password recovery tokens.
 *
 * Follows the discipline of the existing token helpers (HMAC-SHA256 over a
 * base64url payload; the locked booking/prefill helpers are imported
 * elsewhere, never modified — this is the small parallel helper the plan
 * allows). Purpose-bound, 30-minute expiry, and SINGLE-USE: the jti of the
 * most recently issued token is stored server-side (settings row
 * `admin_recovery_token_jti`) and atomically cleared on use, so a token can
 * be spent once and older tokens die when a newer one is minted.
 */

export const RECOVERY_TOKEN_TTL_SECONDS = 30 * 60;
export const ADMIN_RECOVERY_JTI_SETTINGS_KEY = "admin_recovery_token_jti";
export const ADMIN_RECOVERY_MAX_SENDS_PER_HOUR = 3;
/** Marker ip used to count recovery sends in admin_login_attempts (success=true rows never feed the login-failure throttle). */
export const ADMIN_RECOVERY_SEND_MARKER_IP = "admin_recovery_send";

const TOKEN_PURPOSE = "admin_recovery" as const;

type RecoveryClaims = {
  purpose: typeof TOKEN_PURPOSE;
  exp: number;
  jti: string;
};

export type RecoveryTokenVerification =
  | { ok: true; jti: string; exp: number }
  | { ok: false; reason: "invalid" | "expired" };

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

export function createAdminRecoveryToken(
  secret: string,
  nowUnix = Math.floor(Date.now() / 1000),
): { token: string; jti: string; exp: number } {
  if (!secret?.trim()) {
    throw new Error("A signing secret is required to mint a recovery token.");
  }
  const claims: RecoveryClaims = {
    purpose: TOKEN_PURPOSE,
    exp: nowUnix + RECOVERY_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = signPayload(payloadB64, secret.trim());
  return { token: `${payloadB64}.${sig}`, jti: claims.jti, exp: claims.exp };
}

export function verifyAdminRecoveryToken(
  token: string,
  secret: string,
  nowUnix = Math.floor(Date.now() / 1000),
): RecoveryTokenVerification {
  if (!secret?.trim()) return { ok: false, reason: "invalid" };
  if (typeof token !== "string" || !token.trim()) return { ok: false, reason: "invalid" };

  const [payloadB64, sig, extra] = token.trim().split(".");
  if (!payloadB64 || !sig || extra !== undefined) return { ok: false, reason: "invalid" };

  const expected = signPayload(payloadB64, secret.trim());
  if (!timingSafeStringEqual(sig, expected)) return { ok: false, reason: "invalid" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid" };
  }
  const claims = parsed as Record<string, unknown>;
  if (
    claims.purpose !== TOKEN_PURPOSE ||
    typeof claims.exp !== "number" ||
    !Number.isInteger(claims.exp) ||
    typeof claims.jti !== "string" ||
    !claims.jti.trim()
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (nowUnix > claims.exp) return { ok: false, reason: "expired" };
  return { ok: true, jti: claims.jti, exp: claims.exp };
}

export type RecoveryResetDecision =
  | { outcome: "invalid_token"; status: 400; error: string }
  | { outcome: "invalid_new"; status: 400; error: string }
  | { outcome: "ok"; status: 200; storedValue: string };

/**
 * Pure decision for the reset endpoint. `storedJti` is the value of the
 * server-side jti row (null/"" when no token is outstanding or it was
 * already spent) — a mismatch means reuse or supersession and is rejected
 * with the same generic message as tamper/expiry.
 */
export function decideRecoveryReset(input: {
  verification: RecoveryTokenVerification;
  storedJti: string | null | undefined;
  newPassword: unknown;
  confirmPassword: unknown;
}): RecoveryResetDecision {
  const genericTokenError = "This reset link is invalid or has expired. Request a new one.";
  if (!input.verification.ok) {
    return { outcome: "invalid_token", status: 400, error: genericTokenError };
  }
  const storedJti = typeof input.storedJti === "string" ? input.storedJti.trim() : "";
  if (!storedJti || storedJti !== input.verification.jti) {
    return { outcome: "invalid_token", status: 400, error: genericTokenError };
  }

  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";
  if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return {
      outcome: "invalid_new",
      status: 400,
      error: `New password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (newPassword !== confirmPassword) {
    return {
      outcome: "invalid_new",
      status: 400,
      error: "New password and confirmation do not match.",
    };
  }

  return { outcome: "ok", status: 200, storedValue: hashAdminPassword(newPassword) };
}
