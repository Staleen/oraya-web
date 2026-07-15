/**
 * Pure UUID range computation for the public booking-reference lookup.
 *
 * The guest-facing reference is the FIRST 8 HEX CHARACTERS of `bookings.id`
 * (see [lib/booking-reference.ts]). Those 8 hex chars are the uuid's first
 * 4 bytes, and Postgres compares `uuid` values byte-wise, so every uuid
 * whose text form starts with prefix `XXXXXXXX` falls in the half-open range
 *
 *   [ xxxxxxxx-0000-0000-0000-000000000000 ,
 *     (xxxxxxxx+1)-0000-0000-0000-000000000000 )
 *
 * This lets `resolveBookingByReference` match the prefix with plain
 * `gte` / `lt` operators on the indexed uuid primary key — no `::text`
 * cast in a PostgREST filter key (casts are not supported there; the
 * previous `.ilike("id::text", …)` filter failed server-side and the
 * error collapsed to "not_found", which is the Stage 4B Preview bug).
 *
 * Kept dependency-free (no supabase import) so the logic is testable under
 * `node --experimental-strip-types --test`.
 */

const REFERENCE_HEX_RE = /^[0-9A-Fa-f]{8}$/;

const UUID_TAIL_ZERO = "-0000-0000-0000-000000000000";
const UUID_MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export type BookingReferenceUuidRange =
  | { gte: string; lt: string; lte?: undefined }
  | { gte: string; lte: string; lt?: undefined };

/**
 * Compute the uuid range covering every `bookings.id` whose public
 * reference equals `normalizedReference` (8 hex chars, any case).
 * Returns null for anything that is not exactly 8 hex characters.
 *
 * The `ffffffff` prefix has no exclusive upper neighbour, so that single
 * case switches to an inclusive `lte` bound at the maximum uuid.
 */
export function bookingReferenceUuidRange(
  normalizedReference: string | null | undefined,
): BookingReferenceUuidRange | null {
  if (typeof normalizedReference !== "string") return null;
  const prefix = normalizedReference.trim().toLowerCase();
  if (!REFERENCE_HEX_RE.test(prefix)) return null;

  const gte = `${prefix}${UUID_TAIL_ZERO}`;

  if (prefix === "ffffffff") {
    return { gte, lte: UUID_MAX };
  }

  // 8 hex digits < 2^32, safely inside Number precision.
  const next = (parseInt(prefix, 16) + 1).toString(16).padStart(8, "0");
  return { gte, lt: `${next}${UUID_TAIL_ZERO}` };
}
