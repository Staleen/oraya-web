/**
 * Client-safe mirror of `formatBookingReference` in lib/booking-reference.ts.
 * That module is server-only (it imports lib/supabase-admin) and must never be
 * pulled into a "use client" bundle, so the admin UI duplicates the one-line
 * computation here. Keep the two in sync: first 8 hex chars of `bookings.id`,
 * uppercased — the public guest-facing support reference (NOT a credential).
 */

import type { Booking } from "../types";

export function formatBookingRef(id: string | null | undefined): string | null {
  if (!id || id.length < 8) return null;
  return id.slice(0, 8).toUpperCase();
}

/**
 * Text-search predicate for the admin bookings console. Matches what an
 * operator actually holds from a guest message: the quoted 8-char reference
 * (any case, partial prefixes included), a pasted full booking UUID, a guest
 * name fragment, an email fragment, or a phone number (formatting ignored).
 */
export function bookingMatchesSearch(booking: Booking, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  if (booking.guest_name?.toLowerCase().includes(q)) return true;
  if (booking.guest_email?.toLowerCase().includes(q)) return true;

  // Phone: compare digits only so "+961 70 123 456" matches "70123456".
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 3 && (booking.guest_phone ?? "").replace(/\D/g, "").includes(qDigits)) {
    return true;
  }

  // Reference / id: the reference is the uppercased first 8 chars of the id,
  // so one case-insensitive prefix check covers the quoted reference, partial
  // prefixes, and a pasted full UUID (with dashes).
  if (booking.id.toLowerCase().startsWith(q)) return true;

  return false;
}
