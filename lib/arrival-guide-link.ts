/**
 * Phase 16C Stage 4B — mint the personalized Arrival Guide URL.
 *
 * Single shared builder for the guest-facing Arrival Guide link contract:
 *
 *   https://stayoraya.com/arrival/<signed-view-token>
 *
 * - Token: the EXISTING signed booking-view "view" token (locked helper
 *   [lib/booking-action-token.ts] imported only — no new token type).
 * - Expiry: checkout-day expiry (23:59:59 UTC on `check_out`) — identical to
 *   every transactional view-token mint (confirmed email, /api/bookings POST,
 *   the Stage 4A admin copy route).
 * - Origin: same guest-facing convention as other guest links
 *   (`NEXT_PUBLIC_SITE_URL` when set, else the canonical `SITE_URL`).
 * - Villa is NEVER part of the URL — /arrival/[token] resolves it from the
 *   booking row.
 *
 * Failure model (mirrors [lib/butler/booking-view-link.ts]): missing/blank
 * booking id, missing/malformed `check_out` (`YYYY-MM-DD` only, no JS Date
 * parsing of the date-only string beyond the fixed UTC timestamp build), or a
 * missing `BOOKING_ACTION_SECRET` all return null — callers surface "no link"
 * rather than throwing. The returned URL is a live guest credential: callers
 * must only surface it on identity-established, confirmed-booking branches.
 */

import { SITE_URL } from "./brand.ts";
import { createActionToken } from "./booking-action-token.ts";
import { checkOutExpiryUnix } from "./checkout-expiry.ts";

const CHECK_OUT_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same checkout-day expiry formula every transactional view-token mint uses
// (see lib/send-booking-email.ts / app/api/bookings POST — intentionally a
// local helper per the established per-file convention).

export function buildArrivalGuideUrl(
  bookingId: string | null | undefined,
  checkOut: string | null | undefined,
): string | null {
  if (typeof bookingId !== "string") return null;
  const trimmedId = bookingId.trim();
  if (trimmedId.length === 0) return null;

  if (typeof checkOut !== "string") return null;
  const trimmedCheckOut = checkOut.trim();
  if (!CHECK_OUT_RE.test(trimmedCheckOut)) return null;

  let expiresAt: number;
  try {
    expiresAt = checkOutExpiryUnix(trimmedCheckOut);
  } catch {
    return null; // impossible calendar date — refuse, never throw
  }
  if (!Number.isFinite(expiresAt)) return null;

  try {
    const { token } = createActionToken(trimmedId, "view", { expiresAt });
    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || SITE_URL;
    return `${base}/arrival/${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn("[arrival-guide-link] failed to mint Arrival Guide URL:", err);
    return null;
  }
}
