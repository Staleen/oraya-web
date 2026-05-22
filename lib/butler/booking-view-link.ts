/**
 * Phase 16A — Butler helper: mint a signed `/booking/view/[token]` URL.
 *
 * Used by [lib/butler/identity-orchestrator.ts] to attach a guest-facing
 * "view your booking" link to the response when identity has already been
 * established (either implicitly via subscriber / phone continuity or
 * explicitly via a verified identity proof). The link is the same
 * HMAC-signed view token shipped to guests by the existing transactional
 * email surfaces (see [lib/send-booking-pending-email.ts],
 * [lib/send-booking-email.ts], [lib/send-booking-payment-email.ts]), so
 * the booking-view page treats it identically.
 *
 * Failure model:
 *   - Missing/empty `BOOKING_ACTION_SECRET` → `createActionToken` throws.
 *     We catch and return null — the orchestrator surfaces a null URL
 *     rather than 500-ing on a missing server-only secret.
 *   - Invalid booking id → returns null.
 *   - Any other unexpected error → logged, returns null.
 *
 * TTL: uses the default 72h TTL baked into `createActionToken`. Bookings
 * with past check-out dates remain viewable for 72h from the moment the
 * Butler call happens, which is the right window for an in-conversation
 * "view your booking" link. A fresh URL is minted on every orchestrator
 * call, so the link does not need to outlive the current support exchange.
 *
 * Security model: the returned URL is a credential. The orchestrator
 * surfaces it ONLY when identity has been established — never on the
 * unverified `reference_*` / `verification_failed` / `ask_for_*` /
 * `escalate_human` branches.
 */

import { SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";

export function buildButlerBookingViewUrl(bookingId: string | null | undefined): string | null {
  if (typeof bookingId !== "string") return null;
  const trimmed = bookingId.trim();
  if (trimmed.length === 0) return null;

  try {
    const { token } = createActionToken(trimmed, "view");
    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || SITE_URL;
    return `${base}/booking/view/${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn("[butler/booking-view-link] failed to mint view URL:", err);
    return null;
  }
}
