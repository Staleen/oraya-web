// Relative .ts imports so node:test can load this module (repo test convention —
// the runner cannot resolve the "@/" tsconfig alias).
import { parseStaySetupMessage } from "./ops-booking-display.ts";
import {
  EVENT_INQUIRY_MARKER,
  extractEventInquiryGuestNotesLine,
  isEventInquiryPayload,
} from "./event-inquiry-message.ts";

/**
 * What the guest actually wrote — or nothing.
 *
 * `bookings.message` is NOT the guest's words. It is a machine-composed block
 * that CONTAINS them on one line: `/book` writes `[Stay Setup]` with bedrooms,
 * estimated guests, sleeping setup and `Guest Notes:`, plus a
 * `[Booking Protocol]` section on the request path. Rendered raw, the guest
 * cancellation email posted all of it back to the guest verbatim — "System
 * branch: Hosted checkout after booking creation / Supported online protocol
 * targets: card/debit card, Apple Pay, Google Pay when enabled by the hosted
 * provider" — and printed "Guest Notes: None" to guests who had written nothing
 * at all (reported live 2026-08-12).
 *
 * `parseStaySetupMessage` already solved exactly this for Ops: it lifts
 * `guestNotes`, treats "None" / "Not specified" as absent, and drops every
 * bracketed system section. It is CONSUMED here and never modified — instant
 * confirmation depends on its behaviour.
 *
 * Returns `null` when the guest typed nothing, so callers omit the section
 * rather than printing an empty heading.
 */
export function extractGuestVisibleNote(booking: {
  event_type?: string | null;
  message?: string | null;
}): string | null {
  const raw = booking.message;
  if (typeof raw !== "string" || !raw.trim()) return null;

  // Event inquiry: the guest's own line sits inside the [Event Inquiry] block,
  // next to an [EventSetupEstimate] machine section. The marker check is a
  // belt-and-braces guard for a caller that omits event_type.
  if (isEventInquiryPayload(booking.event_type, raw) || raw.includes(EVENT_INQUIRY_MARKER)) {
    return extractEventInquiryGuestNotesLine(raw)?.trim() || null;
  }

  const staySetup = parseStaySetupMessage(raw);
  if (staySetup) return staySetup.guestNotes?.trim() || null;

  // Not a recognised machine block — a legacy row from before `/book` composed
  // one, which really is the guest's own text.
  return raw.trim();
}
