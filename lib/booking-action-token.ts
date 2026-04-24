/**
 * Signed, expiring action tokens for booking links.
 *
 * Format:  base64url(JSON payload) . base64url(HMAC-SHA256 signature)
 * Payload: { booking_id, action, exp, jti }
 * Secret:  BOOKING_ACTION_SECRET env var (falls back to a dev default — MUST be set in prod)
 * Default TTL: 72 hours (overridable via `expiresAt` option)
 *
 * Actions:
 *   - "confirmed" / "cancelled": single-use admin actions tracked in booking_action_tokens
 *     (verified via `verifyActionToken` — strict return type for backward compatibility).
 *   - "view": read-only guest link used by Phase 6 booking-view page. NOT tracked in the
 *     tokens table; re-readable until `exp`. Verified via `verifyViewToken`, which
 *     only accepts this action.
 */

import { createHmac, timingSafeEqual, randomUUID } from "crypto";

const SECRET      = process.env.BOOKING_ACTION_SECRET ?? "oraya-booking-action-secret-change-in-prod";
const TTL_SECONDS = 72 * 60 * 60; // 72 hours

// Strict set used by the locked /api/booking-action route — do not widen.
export type BookingAction = "confirmed" | "cancelled";

// Superset accepted by createActionToken (includes the Phase 6 "view" action).
export type AnyBookingAction = BookingAction | "view";

export interface ActionTokenResult {
  token: string;   // the full signed token string to embed in URLs
  jti:   string;   // UUID — must be inserted into booking_action_tokens by the caller (for confirmed/cancelled)
  exp:   number;   // Unix timestamp — use for expires_at column
}

export interface CreateActionTokenOptions {
  // Absolute Unix expiry (seconds). If set, overrides the default 72h TTL.
  expiresAt?: number;
}

export type TokenVerifyResult =
  | { ok: true;  booking_id: string; action: BookingAction; jti: string }
  | { ok: false; reason: "expired" | "invalid" };

export type ViewTokenVerifyResult =
  | { ok: true;  booking_id: string; jti: string }
  | { ok: false; reason: "expired" | "invalid" };

// ── Create ────────────────────────────────────────────────────────────────────
// Accepts any action (including "view"). Existing callers that pass
// "confirmed" / "cancelled" remain unchanged.

export function createActionToken(
  bookingId: string,
  action: AnyBookingAction,
  options?: CreateActionTokenOptions,
): ActionTokenResult {
  const jti     = randomUUID();
  const exp     = options?.expiresAt ?? Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ booking_id: bookingId, action, exp, jti }))
                    .toString("base64url");
  const sig     = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, jti, exp };
}

// ── Low-level parse (internal) ────────────────────────────────────────────────
// Validates signature, structure, and expiry. Returns the raw action string on success.

type ParsedToken =
  | { ok: true;  booking_id: string; action: string; jti: string }
  | { ok: false; reason: "expired" | "invalid" };

function parseAndVerify(token: string): ParsedToken {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return { ok: false, reason: "invalid" };

    const payload     = token.slice(0, dot);
    const sig         = token.slice(dot + 1);
    const expectedSig = createHmac("sha256", SECRET).update(payload).digest("base64url");

    // Constant-time comparison to prevent timing attacks
    const sigBuf      = Buffer.from(sig,         "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length)  return { ok: false, reason: "invalid" };
    if (!timingSafeEqual(sigBuf, expectedBuf)) return { ok: false, reason: "invalid" };

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as { booking_id?: string; action?: string; exp?: number; jti?: string };

    if (!parsed.booking_id || !parsed.action || !parsed.exp || !parsed.jti)
      return { ok: false, reason: "invalid" };
    if (Math.floor(Date.now() / 1000) > parsed.exp)
      return { ok: false, reason: "expired" };

    return {
      ok:         true,
      booking_id: parsed.booking_id,
      action:     parsed.action,
      jti:        parsed.jti,
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

// ── Verify (admin confirm/cancel) ─────────────────────────────────────────────
// Rejects anything that isn't "confirmed" or "cancelled". Return type stays
// strict — locked consumers depend on this.

export function verifyActionToken(token: string): TokenVerifyResult {
  const parsed = parseAndVerify(token);
  if (!parsed.ok) return parsed;
  if (parsed.action !== "confirmed" && parsed.action !== "cancelled") {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok:         true,
    booking_id: parsed.booking_id,
    action:     parsed.action,
    jti:        parsed.jti,
  };
}

// ── Verify (guest view link) ──────────────────────────────────────────────────
// Only succeeds for "view" action tokens. Does NOT hit the DB.

export function verifyViewToken(token: string): ViewTokenVerifyResult {
  const parsed = parseAndVerify(token);
  if (!parsed.ok) return parsed;
  if (parsed.action !== "view") return { ok: false, reason: "invalid" };
  return {
    ok:         true,
    booking_id: parsed.booking_id,
    jti:        parsed.jti,
  };
}
