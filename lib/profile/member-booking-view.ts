/**
 * Member-profile booking-view link helpers (server-only).
 *
 * Mints a relative `/booking/view/[token]` path for an authenticated member
 * after ownership of the booking row is verified. Token creation stays
 * server-only — this module must never be imported from a `"use client"` file.
 *
 * Uses the locked `createActionToken` helper (import only) with the helper's
 * default temporary TTL (72h). Profile access remains available to an
 * authenticated owner at any time — including after checkout — because each
 * click remints a fresh temporary URL. Do NOT derive expiry from check_out
 * (that left historical bookings with already-expired tokens and violated
 * date-only discipline via `new Date()`). Email checkout-day expiry is a
 * separate minting site and is unchanged.
 *
 * Client-safe path checks live in `./booking-view-path` (no secret / crypto).
 */

import { createActionToken } from "../booking-action-token.ts";
import { buildRelativeBookingViewPath } from "./booking-view-path.ts";

export type MemberBookingViewRow = {
  id: string;
  member_id: string | null;
};

export type OwnershipResult =
  | { ok: true }
  | { ok: false; status: 401 | 404; error: string };

export type MintMemberBookingViewResult =
  | { ok: true; path: string }
  | { ok: false; status: 401 | 400 | 404 | 500; error: string };

export { buildRelativeBookingViewPath };

/**
 * Verify the authenticated member owns the booking. Missing auth → 401;
 * missing or foreign booking → non-disclosing 404.
 */
export function authorizeMemberBookingOwnership(
  userId: string | null | undefined,
  booking: MemberBookingViewRow | null | undefined,
): OwnershipResult {
  if (!userId) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  if (!booking) {
    return { ok: false, status: 404, error: "Not found." };
  }
  if (booking.member_id !== userId) {
    return { ok: false, status: 404, error: "Not found." };
  }
  return { ok: true };
}

/**
 * Mint a fresh signed view token and return a relative booking-view path.
 * Caller must have already verified ownership. Uses the default temporary TTL.
 */
export function mintRelativeBookingViewPath(bookingId: string): string {
  const { token } = createActionToken(bookingId, "view");
  return buildRelativeBookingViewPath(token);
}

/**
 * Full authorize + mint pipeline used by POST /api/profile/booking-view.
 * Pure aside from the token HMAC (which needs BOOKING_ACTION_SECRET).
 * Has no checkout-date dependency — ownership alone authorizes minting.
 */
export function resolveMemberBookingViewPath(
  userId: string | null | undefined,
  bookingId: string | null | undefined,
  booking: MemberBookingViewRow | null | undefined,
): MintMemberBookingViewResult {
  if (typeof bookingId !== "string" || bookingId.trim().length === 0) {
    return { ok: false, status: 400, error: "booking_id is required." };
  }

  const ownership = authorizeMemberBookingOwnership(userId, booking);
  if (!ownership.ok) return ownership;

  // Ownership passed — booking is defined and owned by userId.
  const owned = booking as MemberBookingViewRow;
  if (owned.id !== bookingId.trim()) {
    // Lookup must have been keyed by the same id; treat mismatch as not found.
    return { ok: false, status: 404, error: "Not found." };
  }

  try {
    const path = mintRelativeBookingViewPath(owned.id);
    return { ok: true, path };
  } catch (err) {
    console.error("[profile/member-booking-view] mint failed:", err);
    return { ok: false, status: 500, error: "Server error." };
  }
}
