/**
 * Public guest-facing booking reference.
 *
 * The reference is the first 8 hex characters of `bookings.id`, uppercased.
 * This computation is already shipped and visible to guests in:
 *
 *   - [app/booking/view/[token]/page.tsx] — header "Reference" copy + the
 *     mailto support template.
 *   - [lib/send-booking-pending-email.ts]   — Reference row in pending /
 *     event-inquiry emails.
 *   - [lib/send-booking-email.ts]           — Reference row in confirmed /
 *     cancelled emails.
 *
 * Documented as the public support code (NOT an access PIN) in
 * [/docs/system/PROJECT_STATE.md], [/docs/system/BUTLER_PLAYBOOK.md], and
 * [/docs/phases/PHASE_16B_PLAN.md].
 *
 * This module does NOT introduce a parallel identifier. It centralizes the
 * existing computation behind a named API so future code (WhatsApp fallback
 * identity lookup, admin support tooling) does not duplicate the
 * `id.slice(0, 8).toUpperCase()` literal.
 *
 * SECURITY MODEL — two strictly separated concepts:
 *
 *   1. PUBLIC guest-facing identifier (this file).
 *      - Computed from `bookings.id`.
 *      - Visible in emails, on the booking-view page, may be quoted by the
 *        guest in support channels.
 *      - Knowing the reference is NOT proof of identity. Resolving a
 *        reference returns only the booking row; the caller MUST run
 *        identity verification (phone match, email match, manual
 *        escalation) before exposing payment links, smart-lock PINs,
 *        exact address, admin notes, raw payload, or any other sensitive
 *        field.
 *
 *   2. PRIVATE signed tokens (NOT this file).
 *      - `createActionToken(...)` in lib/booking-action-token.ts (the
 *        `view` / `confirmed` / `cancelled` HMAC tokens emailed to guests).
 *      - `createPrefillToken(...)` in lib/butler/prefill-token.ts (the
 *        `BUTLER_PREFILL_SECRET`-signed WhatsApp handoff token).
 *      - These are credentials. They authorize sensitive disclosure. They
 *        are never asked of the guest in conversation and never
 *        interchangeable with the public reference.
 *
 * Never blur these two concepts.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { bookingReferenceUuidRange } from "@/lib/booking-reference-range";

const REFERENCE_LENGTH = 8;
const REFERENCE_HEX_RE = /^[0-9A-F]{8}$/;

/**
 * Format a booking row's id as the public guest-facing reference.
 *
 * Returns null only when the input cannot produce a valid reference
 * (missing id, too-short string). Otherwise returns an 8-character
 * uppercase hex string.
 */
export function formatBookingReference(bookingId: string | null | undefined): string | null {
  if (typeof bookingId !== "string") return null;
  const trimmed = bookingId.trim();
  if (trimmed.length < REFERENCE_LENGTH) return null;
  const candidate = trimmed.slice(0, REFERENCE_LENGTH).toUpperCase();
  return REFERENCE_HEX_RE.test(candidate) ? candidate : null;
}

/**
 * Normalize a guest-supplied reference string (typed in chat / quoted in
 * email / pasted with spaces or dashes) into the canonical 8-character
 * uppercase form. Returns null when the input cannot represent a
 * well-formed reference.
 *
 * Accepts:
 *   - "A1B2C3D4"           → "A1B2C3D4"
 *   - "  a1b2c3d4  "       → "A1B2C3D4"
 *   - "a1b2-c3d4"          → "A1B2C3D4"
 *   - "A1B2C3D4-1234-..."  → "A1B2C3D4" (full uuid passed in by mistake)
 *
 * Rejects:
 *   - shorter than 8 hex chars after stripping
 *   - non-hex characters in the 8-char window
 */
export function normalizeBookingReference(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (stripped.length < REFERENCE_LENGTH) return null;
  const candidate = stripped.slice(0, REFERENCE_LENGTH);
  return REFERENCE_HEX_RE.test(candidate) ? candidate : null;
}

/**
 * Server-side outcome of a reference lookup. The "found" variant
 * intentionally exposes only the same fields the guest already sees on
 * /booking/view/[token]; sensitive fields (phone, email, payment ledger,
 * raw payload, admin notes, etc.) are NEVER returned. Identity
 * verification before disclosure is the caller's responsibility.
 */
export type BookingReferenceResolution =
  | { kind: "not_found" }
  | { kind: "ambiguous"; count: number }
  | {
      kind: "found";
      booking_id: string;
      status: string | null;
      villa: string | null;
      /** YYYY-MM-DD or null. Never a parsed Date. */
      check_in: string | null;
      /** YYYY-MM-DD or null. Never a parsed Date. */
      check_out: string | null;
    };

type BookingReferenceRow = {
  id: string;
  status: string | null;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
};

/**
 * Resolve a guest-supplied reference to a single booking row.
 *
 * Lookup strategy: uuid RANGE match on the indexed `bookings.id` primary
 * key via plain `gte`/`lt(e)` operators ([lib/booking-reference-range.ts]).
 * The reference is the uuid's first 8 hex chars — its first 4 bytes — and
 * Postgres compares uuids byte-wise, so the half-open range covers exactly
 * the prefix. (The previous `.ilike("id::text", …)` filter relied on a
 * cast in a PostgREST filter key, which PostgREST rejects server-side;
 * the error collapsed to "not_found" and broke every reference lookup —
 * caught in the Stage 4B Preview verification, 2026-07-15.) Stops at
 * 2 rows so an ambiguous match is detected without fetching the entire
 * table.
 *
 * Failure modes (Supabase error, unexpected throw) collapse to
 * `{ kind: "not_found" }` and are logged server-side. The caller cannot
 * tell the difference between "really no match" and "lookup blew up" —
 * that is intentional. Either way the conversation path is the same:
 * ask for identity verification or escalate to a human.
 *
 * 32 bits of entropy in the reference (uuid v4 first 8 hex chars) means
 * birthday collisions are vanishingly unlikely at Oraya's booking volume
 * but are not zero. The `ambiguous` branch handles the corner case
 * explicitly instead of silently returning the wrong booking.
 */
export async function resolveBookingByReference(
  reference: string | null | undefined,
): Promise<BookingReferenceResolution> {
  const normalized = normalizeBookingReference(reference);
  if (!normalized) return { kind: "not_found" };

  const range = bookingReferenceUuidRange(normalized);
  if (!range) return { kind: "not_found" };

  try {
    let query = supabaseAdmin
      .from("bookings")
      .select("id, status, villa, check_in, check_out")
      .gte("id", range.gte);
    query = range.lt !== undefined ? query.lt("id", range.lt) : query.lte("id", range.lte);
    const { data, error } = await query.limit(2);

    if (error) {
      console.warn("[lib/booking-reference] resolve error:", error.message);
      return { kind: "not_found" };
    }

    const rows = (data ?? []) as BookingReferenceRow[];
    if (rows.length === 0) return { kind: "not_found" };
    if (rows.length > 1) return { kind: "ambiguous", count: rows.length };

    const row = rows[0];
    return {
      kind: "found",
      booking_id: row.id,
      status: typeof row.status === "string" ? row.status : null,
      villa: typeof row.villa === "string" ? row.villa : null,
      check_in: typeof row.check_in === "string" ? row.check_in : null,
      check_out: typeof row.check_out === "string" ? row.check_out : null,
    };
  } catch (err) {
    console.warn("[lib/booking-reference] resolve unexpected error:", err);
    return { kind: "not_found" };
  }
}
