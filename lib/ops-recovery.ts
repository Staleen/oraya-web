import { createHmac, randomUUID, timingSafeEqual } from "crypto";
// Relative .ts imports so node:test can load this module (repo test convention).
import { decideRecoveryReset, type RecoveryTokenVerification } from "./admin-recovery.ts";

/**
 * Owner recovery for /ops — the way back in when the owner has forgotten the
 * password to the console that is replacing /admin.
 *
 * This is a deliberate parallel of `lib/admin-recovery.ts` rather than a
 * change to it. That module is a locked token system, and more importantly the
 * two must not be interchangeable: an admin recovery token must never reset an
 * /ops account, and an /ops token must never reset the shared admin password.
 * The purpose claim is what separates them, and it is checked on verify, so a
 * token minted by one system fails signature-independent validation in the
 * other even though both are signed with ADMIN_SECRET.
 *
 * Everything else follows the audited original: HMAC-SHA256 over a base64url
 * payload, 30-minute expiry, and single use enforced by a server-side jti that
 * is atomically claimed before any password is written.
 *
 * Operators are intentionally NOT covered. An operator who is locked out is
 * reset by the owner from the Team screen, which is both simpler and safer:
 * it needs no mailbox, and it leaves an owner in the loop. Only the owner —
 * who has nobody above them — needs a self-service route back in, and it goes
 * exclusively to the server-configured ADMIN_RECOVERY_EMAIL. User input never
 * chooses the destination.
 */

export const OPS_RECOVERY_TOKEN_TTL_SECONDS = 30 * 60;
export const OPS_RECOVERY_JTI_SETTINGS_KEY = "ops_recovery_token_jti";
export const OPS_RECOVERY_MAX_SENDS_PER_HOUR = 3;
/** Marker ip used to count sends in admin_login_attempts (success=true rows never feed the login-failure throttle). */
export const OPS_RECOVERY_SEND_MARKER_IP = "ops_recovery_send";

const TOKEN_PURPOSE = "ops_recovery" as const;

type OpsRecoveryClaims = {
  purpose: typeof TOKEN_PURPOSE;
  exp: number;
  jti: string;
};

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

export function createOpsRecoveryToken(
  secret: string,
  nowUnix = Math.floor(Date.now() / 1000),
): { token: string; jti: string; exp: number } {
  if (!secret?.trim()) {
    throw new Error("A signing secret is required to mint a recovery token.");
  }
  const claims: OpsRecoveryClaims = {
    purpose: TOKEN_PURPOSE,
    exp: nowUnix + OPS_RECOVERY_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${payloadB64}.${signPayload(payloadB64, secret.trim())}`, jti: claims.jti, exp: claims.exp };
}

export function verifyOpsRecoveryToken(
  token: string,
  secret: string,
  nowUnix = Math.floor(Date.now() / 1000),
): RecoveryTokenVerification {
  if (!secret?.trim()) return { ok: false, reason: "invalid" };
  if (typeof token !== "string" || !token.trim()) return { ok: false, reason: "invalid" };

  const [payloadB64, sig, extra] = token.trim().split(".");
  if (!payloadB64 || !sig || extra !== undefined) return { ok: false, reason: "invalid" };

  if (!timingSafeStringEqual(sig, signPayload(payloadB64, secret.trim()))) {
    return { ok: false, reason: "invalid" };
  }

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
  // The purpose check is what stops an admin recovery token — signed with the
  // same secret — from resetting an /ops owner account.
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

/**
 * Password and jti rules are identical to the admin flow, so they are reused
 * rather than restated — one set of rules, one place to audit them.
 */
export const decideOpsRecoveryReset = decideRecoveryReset;
