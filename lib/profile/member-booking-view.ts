/**
 * Member-profile booking-view link helpers (server-only).
 *
 * Mints a relative `/booking/view/[token]` path for an authenticated member
 * after ownership of the booking row is verified. Token creation stays
 * server-only — this module must never be imported from a `"use client"` file.
 *
 * Uses the locked `createActionToken` helper (import only). Expiry matches the
 * transactional email pattern: 23:59:59 UTC on the booking's check-out date.
 *
 * Client-safe path checks live in `./booking-view-path` (no secret / crypto).
 */

import { createActionToken } from "../booking-action-token.ts";
import { buildRelativeBookingViewPath } from "./booking-view-path.ts";

export type MemberBookingViewRow = {
  id: string;
  member_id: string | null;
  check_out: string;
};

export type OwnershipResult =
  | { ok: true }
  | { ok: false; status: 401 | 404; error: string };

export type MintMemberBookingViewResult =
  | { ok: true; path: string }
  | { ok: false; status: 401 | 400 | 404 | 500; error: string };

/** Absolute Unix expiry (seconds) at 23:59:59 UTC on the check-out date. */
export function checkOutExpiryUnix(checkOut: string): number {
  return Math.floor(new Date(`${checkOut}T23:59:59Z`).getTime() / 1000);
}

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
 * Caller must have already verified ownership.
 */
export function mintRelativeBookingViewPath(
  bookingId: string,
  checkOut: string,
): string {
  const { token } = createActionToken(bookingId, "view", {
    expiresAt: checkOutExpiryUnix(checkOut),
  });
  return buildRelativeBookingViewPath(token);
}

/**
 * Full authorize + mint pipeline used by POST /api/profile/booking-view.
 * Pure aside from the token HMAC (which needs BOOKING_ACTION_SECRET).
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
    const path = mintRelativeBookingViewPath(owned.id, owned.check_out);
    return { ok: true, path };
  } catch (err) {
    console.error("[profile/member-booking-view] mint failed:", err);
    return { ok: false, status: 500, error: "Server error." };
  }
}
