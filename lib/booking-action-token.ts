/**
 * Signed, expiring action tokens for booking confirm/cancel links in admin emails.
 *
 * Format:  base64url(JSON payload) . base64url(HMAC-SHA256 signature)
 * Secret:  BOOKING_ACTION_SECRET env var (falls back to a dev default — MUST be set in prod)
 * TTL:     72 hours
 */

import { createHmac, timingSafeEqual } from "crypto";

const SECRET      = process.env.BOOKING_ACTION_SECRET ?? "oraya-booking-action-secret-change-in-prod";
const TTL_SECONDS = 72 * 60 * 60; // 72 hours

export type BookingAction = "confirmed" | "cancelled";

export type TokenVerifyResult =
  | { ok: true;  booking_id: string; action: BookingAction }
  | { ok: false; reason: "expired" | "invalid" };

// ── Create ────────────────────────────────────────────────────────────────────

export function createActionToken(bookingId: string, action: BookingAction): string {
  const exp     = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ booking_id: bookingId, action, exp }))
                    .toString("base64url");
  const sig     = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

// ── Verify ────────────────────────────────────────────────────────────────────

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
    if (sigBuf.length !== expectedBuf.length)   return { ok: false, reason: "invalid" };
    if (!timingSafeEqual(sigBuf, expectedBuf))  return { ok: false, reason: "invalid" };

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as { booking_id?: string; action?: string; exp?: number };

    if (!parsed.booking_id || !parsed.action || !parsed.exp)
      return { ok: false, reason: "invalid" };
    if (!["confirmed", "cancelled"].includes(parsed.action))
      return { ok: false, reason: "invalid" };
    if (Math.floor(Date.now() / 1000) > parsed.exp)
      return { ok: false, reason: "expired" };

    return { ok: true, booking_id: parsed.booking_id, action: parsed.action as BookingAction };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
