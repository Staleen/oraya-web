/**
 * Guest-facing trust copy for hybrid “instant vs review” booking messaging.
 * Phase 15 — UI copy only; submission and confirmation remain server-driven.
 */

export type BookingTrustMode = "instant" | "request";

export const WHATSAPP_SUPPORT_LINE = "24/7 WhatsApp support available.";

/** Step 4 (/book) — trust panel */
export const STEP4_TRUST = {
  instant: {
    headline: "Secure payment and booking confirmation are separate steps.",
    payment: "",
    ctaSubline: "Book instantly when checkout is live",
  },
  request: {
    headline: "This booking requires review.",
    noPayment: "Payment follows the secure option you choose and does not confirm the booking automatically.",
    contact: "We will contact you via WhatsApp or email.",
    ctaSubline: "No payment required now",
  },
} as const;

/** Booking link page — status headlines */
export const VIEW_STATUS_HEADLINE = {
  confirmedStay: "Your stay is confirmed",
  confirmedGeneric: "Your booking is confirmed",
  pending: "Your request is under review",
} as const;

export type BookingViewStatusNorm = "confirmed" | "pending" | "cancelled";

export function viewStatusHeadline(
  isEventInquiry: boolean,
  statusNorm: BookingViewStatusNorm,
): string | null {
  if (statusNorm === "cancelled") return null;
  if (statusNorm === "confirmed") {
    return isEventInquiry ? VIEW_STATUS_HEADLINE.confirmedGeneric : VIEW_STATUS_HEADLINE.confirmedStay;
  }
  return VIEW_STATUS_HEADLINE.pending;
}

export const VIEW_CONFIRMED_LINES = [
  "Oraya has confirmed this booking",
  "Access details will be provided",
] as const;

export const VIEW_PENDING_LINES = [
  "Oraya is reviewing this booking request",
  "We will contact you shortly",
] as const;

/** Post-submit splash (/booking-confirmed) — request received; not “confirmed” until ops confirms */
export const CONFIRMED_PAGE = {
  eyebrow: "Request received",
  headline: "Your request has been received",
  subB:
    "We will review availability and operations before confirming with you.",
  subC: "We will contact you via WhatsApp or email.",
  nextReview: "Next steps: our team reviews your request and reaches out shortly.",
  nextContact: "Questions in the meantime? Use WhatsApp or email below.",
  notConfirmedUnless:
    "Your booking is not confirmed until Oraya confirms it with you — submitting this form only sends your request.",
} as const;

/** Guest has no reference yet (pre-submit or generic contact). */
export const WHATSAPP_GENERAL_CONTACT_PREFILL =
  "Hello Oraya — I have a question about a booking.";

/** Pre-submit / no reference — cancellation & changes routing only. */
export const WHATSAPP_CANCEL_CHANGE_NO_REF =
  "Hello Oraya — I need help cancelling or changing my booking.";

export const CANCELLATION_PROMPT = "Need to cancel or change your booking?";
export const CANCELLATION_HINT =
  "Self-service cancellation is not available yet — reach out on WhatsApp or email and we will help.";

/** Guest legal page — cancellation & refund (no automatic refund implied here). */
export const REFUND_POLICY_HREF = "/legal/refund";

/** Event inquiry (/events/inquiry) Step 3 — before submit; inquiry ≠ confirmed booking */
export const EVENT_INQUIRY_WHAT_NEXT = {
  title: "What happens next",
  bullets: [
    "Oraya reviews your event setup, guest count, services, and timing.",
    "We contact you by WhatsApp or email to confirm feasibility and next steps.",
    "No payment is required until the event details are reviewed.",
  ],
} as const;

/** Pre-filled WhatsApp body for guests on the event inquiry flow (human support, not a bot). */
export const EVENT_INQUIRY_WHATSAPP_PREFILL =
  "Hello Oraya — I have a question about my event inquiry.";

export const EVENT_INQUIRY_SUBMIT_SUBLINE =
  "No payment required now. We will contact you by WhatsApp or email.";

export const EVENT_INQUIRY_NOT_CONFIRMED_LINE =
  "Submitting only sends your inquiry — nothing is confirmed until Oraya agrees the details with you.";

export const EVENT_INQUIRY_CHANGE_LATER_PROMPT = "Need to change or cancel later?";
export const EVENT_INQUIRY_CHANGE_LATER_HINT =
  "Cancellation and changes follow Oraya's policy — we are happy to help by WhatsApp or email.";

/** Step 4 review — visible before submit */
export const STEP4_REFUND_TRUST = {
  title: "Cancellation & Refund",
  body:
    "Plans can change. Cancellation and refund eligibility depends on timing, booking status, and the selected services.",
  linkLabel: "View cancellation & refund policy",
} as const;

/** Booking view — compact block near contact */
export const VIEW_CHANGE_CANCEL_TITLE = "Need to change or cancel?";
export const VIEW_CHANGE_CANCEL_BODY =
  "Cancellation and refund requests are handled according to Oraya's policy.";
export const VIEW_REFUND_POLICY_LINK_LABEL = "Cancellation & refund policy";

/** Booking-confirmed reassurance */
export const CONFIRMED_REFUND_REASSURANCE =
  "You can request changes or cancellations according to Oraya's cancellation and refund policy.";
export const CONFIRMED_REFUND_POLICY_LINK_LABEL = "View policy";

export function digitsOnlyPhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const d = value.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/**
 * Prefilled WhatsApp body for the booking-support CTA on the booking-view
 * and booking-confirmed pages.
 *
 * Format: `Check my booking <8-char-uppercase-booking-reference>`
 *
 * This is a plain human sentence that doubles as the operator-side
 * WhatChimp routing keyword. WhatChimp triggers on the substring
 * `"Check my booking"` (the only platform capability available on the
 * production tenant — see /docs/system/KNOWN_BUGS.md #7) and the
 * downstream WhatChimp flow then asks the guest for the booking
 * reference before calling `POST /api/butler/identify`. The reference
 * is already visible inside the sentence for the operator's reference;
 * the bot still captures it through the existing reference-input step.
 *
 * Normal greetings ("hi", "hello", free-form questions) continue to
 * enter the existing welcome menu unchanged — this prefill is only
 * emitted by website CTAs, never typed by the guest.
 *
 * The 8-character reference inside the prefill is the public guest-
 * facing support code (see `lib/booking-reference.ts`), not a
 * credential — surfacing it in the prefill carries no new disclosure
 * risk.
 */
export function bookingWhatsAppPrefill(refDisplay: string): string {
  return `Check my booking ${refDisplay}`;
}

/**
 * Prefilled WhatsApp body for the change / cancel CTA.
 *
 * Format: `Help with my booking <8-char-uppercase-booking-reference>`
 *
 * Same shape as `bookingWhatsAppPrefill` but with a distinct opening
 * verb so WhatChimp can branch its trigger on the substring
 * `"Help with my booking"` and route to the change/cancel assistance
 * path. The 8-character reference is included for the operator's
 * benefit; the identity flow still captures it through the existing
 * reference-input step.
 */
export function bookingWhatsAppChangePrefill(refDisplay: string): string {
  return `Help with my booking ${refDisplay}`;
}
