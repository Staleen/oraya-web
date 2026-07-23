/**
 * Remediation 5.4 — shared guest-input validation, reconciled from the
 * per-file copies in /book, /events/inquiry, and LeadConversionModal
 * (all three declared the identical email regex).
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}
