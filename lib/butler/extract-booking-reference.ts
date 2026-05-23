/**
 * Phase 16A — extract a clean 8-character booking reference from a free-form
 * inbound message (typically the first WhatsApp turn that triggered the
 * Butler flow, e.g. `"Hello Oraya — booking reference A0B8CECB"`).
 *
 * Why this helper exists: WhatChimp's Condition / save-to-custom-field
 * primitives can route on substring matches but cannot run a regex capture
 * to lift the 8-char token out of the inbound message into a custom field.
 * The orchestrator therefore cannot rely on `booking_reference` being
 * populated by the bot when the value sits inside the trigger message
 * body. `/api/butler/identify` accepts an optional `message_text` field,
 * and this helper is the single place that derives a `booking_reference`
 * from that text in a safe, bounded way.
 *
 * Extraction rule: the FIRST standalone 8-character hex token in the
 * message, where "standalone" means surrounded by non-word characters or
 * the start/end of the string (the JS `\b` word boundary). The matched
 * token is normalized to uppercase to match the format Oraya already
 * surfaces in `formatBookingReference`.
 *
 * SAFETY: this helper is deliberately strict.
 *
 *  - Naive hex-stripping (`replace(/[^0-9a-fA-F]/g, "")` then `.slice(0, 8)`)
 *    is REJECTED — the message `"Hello Oraya — booking reference A0B8CECB"`
 *    contains valid hex letters scattered through "Hello", "Oraya",
 *    "booking", "reference" (`e`, `aa`, `b`, `efeece`), so the naive
 *    approach would emit `"EAABEFEE"` and confidently mis-identify the
 *    booking. Word-boundary matching avoids this entire class of error.
 *  - The helper never throws; it always returns either a normalized
 *    8-char hex string or `null`. The orchestrator's existing
 *    `not_found` / `ambiguous` paths take over when no clean token is
 *    found.
 *  - Only the FIRST matching token is returned. If the guest somehow
 *    typed two references, the orchestrator's subsequent
 *    `resolveBookingByReference` call handles ambiguity through the
 *    existing path (the helper does not need to know about multiple
 *    bookings — that is `bookings`-table-level data, not text-parsing
 *    data).
 *  - This helper does NOT call Supabase, does NOT touch any locked
 *    surface, and does NOT mutate any state. It is a pure string
 *    function.
 */

const STANDALONE_BOOKING_REFERENCE_PATTERN = /\b[0-9A-Fa-f]{8}\b/;

/**
 * Returns the first word-boundary-anchored 8-character hex token in the
 * input string, uppercased; or `null` when the input is missing, empty,
 * or contains no clean token. Never throws.
 */
export function extractBookingReferenceFromText(
  text: string | null | undefined,
): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const match = STANDALONE_BOOKING_REFERENCE_PATTERN.exec(trimmed);
  if (!match) return null;

  return match[0].toUpperCase();
}
