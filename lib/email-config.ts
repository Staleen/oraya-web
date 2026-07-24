/**
 * Plan 3 Phase 4 (KNOWN_BUGS #2) — shared reporter for a missing
 * RESEND_API_KEY in the email senders.
 *
 * In production a missing key is a structured console.error with the stable
 * grep-able tag `[email-config-missing]` (alarm-worthy: bookings proceed but
 * confirmation emails silently stop). Outside production it stays a warn —
 * local/dev environments legitimately run without Resend.
 */

export const EMAIL_CONFIG_MISSING_TAG = "[email-config-missing]";

export function reportMissingResendKey(sender: string): void {
  const line = `${EMAIL_CONFIG_MISSING_TAG} RESEND_API_KEY not set - skipping email. sender=${sender}`;
  if (process.env.NODE_ENV === "production") {
    console.error(line);
  } else {
    console.warn(line);
  }
}
