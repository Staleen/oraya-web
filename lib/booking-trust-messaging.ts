/**
 * Guest-facing trust copy for hybrid “instant vs review” booking messaging.
 * Phase 15 — UI copy only; submission and confirmation remain server-driven.
 */

export type BookingTrustMode = "instant" | "request";

export const WHATSAPP_SUPPORT_LINE = "24/7 WhatsApp support available.";

/** Step 4 (/book) — trust panel */
export const STEP4_TRUST = {
  instant: {
    headline: "This booking will be confirmed instantly.",
    payment: "You will be charged now and receive access details after payment.",
    ctaSubline: "Secure your stay now",
  },
  request: {
    headline: "This booking requires review.",
    noPayment: "No payment is required at this stage.",
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
  "Payment received / booking confirmed",
  "Access details will be provided",
] as const;

export const VIEW_PENDING_LINES = [
  "No payment required yet",
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

export function digitsOnlyPhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const d = value.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/** Prefilled WhatsApp body — include booking reference for routing */
export function bookingWhatsAppPrefill(refDisplay: string): string {
  return `Hello Oraya — booking reference ${refDisplay}.`;
}

export function bookingWhatsAppChangePrefill(refDisplay: string): string {
  return `Hello Oraya — booking reference ${refDisplay}. I need help cancelling or changing this booking.`;
}
