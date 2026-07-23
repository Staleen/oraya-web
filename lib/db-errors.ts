/**
 * Remediation 1.4 — classify Postgres/PostgREST errors surfaced by supabase-js.
 *
 * SQLSTATE 23P01 (exclusion_violation) is raised by the
 * `bookings_no_confirmed_overlap` constraint
 * (sql/remediation-booking-overlap-constraint.sql) when a confirm write loses
 * the double-booking race. Callers map it to the existing
 * "dates no longer available" response and leave the booking pending.
 */

export function isExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "23P01";
}

/** 23505 unique_violation — occasionally useful alongside the above. */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "23505";
}
