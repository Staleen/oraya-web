/**
 * Remediation 2.4 — single source of truth for the "view token expires at the
 * end of check-out day (UTC)" rule. Previously duplicated in nine files; the
 * strict variant from app/api/payments/checkout wins the reconciliation: for
 * every valid YYYY-MM-DD it returns the identical unix timestamp the lenient
 * copies produced, but malformed input now throws instead of silently minting
 * a token with a NaN expiry.
 */
export function checkOutExpiryUnix(checkOut: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkOut);
  if (!match) {
    throw new Error("Booking check-out date is invalid.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day, 23, 59, 59);
  // Date.UTC silently rolls impossible dates (2026-99-99) into later months —
  // verify the components survived to reject them.
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Booking check-out date is invalid.");
  }
  return Math.floor(utcMs / 1000);
}
