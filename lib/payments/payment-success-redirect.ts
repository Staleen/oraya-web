/**
 * Guest success URLs after a verified recorded payment.
 * Booking-linked requests prefer the booking view; standalone stay on /pay.
 * Payment never auto-confirms a stay — booking status is unchanged here.
 */

import { createActionToken } from "../booking-action-token.ts";
import { checkOutExpiryUnix } from "../checkout-expiry.ts";

export function buildPaymentRequestSuccessUrl(origin: string, publicToken: string): string {
  return `${origin}/pay/${encodeURIComponent(publicToken)}?payment=success`;
}

export function buildBookingPaymentSuccessUrl(origin: string, viewToken: string): string {
  return `${origin}/booking/view/${encodeURIComponent(viewToken)}?payment=success`;
}

export function mintBookingPaymentSuccessUrl(input: {
  origin: string;
  booking_id: string;
  check_out?: string | null;
}): string | null {
  const bookingId = input.booking_id.trim();
  if (!bookingId) return null;
  try {
    const expiresAt =
      typeof input.check_out === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.check_out)
        ? checkOutExpiryUnix(input.check_out)
        : undefined;
    const { token } = createActionToken(
      bookingId,
      "view",
      expiresAt !== undefined ? { expiresAt } : undefined,
    );
    return buildBookingPaymentSuccessUrl(input.origin, token);
  } catch {
    return null;
  }
}
