/**
 * Signed, expiring, single-use action tokens for booking confirm/cancel links in admin emails.
 *
 * Format:  base64url(JSON payload) . base64url(HMAC-SHA256 signature)
 * Payload: { booking_id, action, exp, jti }
 * Secret:  BOOKING_ACTION_SECRET env var (falls back to a dev default — MUST be set in prod)
 * TTL:     72 hours
 *
 * Single-use enforcement is DB-backed (booking_action_tokens table).
 * verifyActionToken only checks cryptographic integrity + expiry — callers must
 * additionally query the token row to confirm it has not been consumed.
 */

import { createHmac, timingSafeEqual, randomUUID } from "crypto";

const SECRET      = process.env.BOOKING_ACTION_SECRET ?? "oraya-booking-action-secret-change-in-prod";
const TTL_SECONDS = 72 * 60 * 60; // 72 hours

export type BookingAction = "confirmed" | "cancelled";

export interface ActionTokenResult {
  token: string;   // the full signed token string to embed in URLs
  jti:   string;   // UUID — must be inserted into booking_action_tokens by the caller
  exp:   number;   // Unix timestamp — use for expires_at column
}

export type TokenVerifyResult =
  | { ok: true;  booking_id: string; action: BookingAction; jti: string }
  | { ok: false; reason: "expired" | "invalid" };

// ── Create ────────────────────────────────────────────────────────────────────
// Returns the signed token string plus the jti and exp the caller needs to
// insert a row into booking_action_tokens for single-use tracking.

export function createActionToken(bookingId: string, action: BookingAction): ActionTokenResult {
  const jti     = randomUUID();
  const exp     = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ booking_id: bookingId, action, exp, jti }))
                    .toString("base64url");
  const sig     = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, jti, exp };
}

// ── Verify ────────────────────────────────────────────────────────────────────
// Checks signature and expiry only — purely cryptographic, no DB access.
// After calling this, callers MUST also verify the token row in the DB
// (used_at is null, booking_id/action match) before treating the token as valid.

export function verifyActionToken(token: string): TokenVerifyResult {
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
    if (!["confirmed", "cancelled"].includes(parsed.action))
      return { ok: false, reason: "invalid" };
    if (Math.floor(Date.now() / 1000) > parsed.exp)
      return { ok: false, reason: "expired" };

    return {
      ok:         true,
      booking_id: parsed.booking_id,
      action:     parsed.action as BookingAction,
      jti:        parsed.jti,
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
