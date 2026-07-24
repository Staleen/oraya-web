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

/**
 * Plan 4 Phase 1 — 42703 is Postgres undefined_column; PGRST204 is PostgREST
 * "column not found in schema cache" (what Supabase surfaces when an additive
 * column migration has not been run yet). Callers use this to tolerate the
 * pre-migration state by retrying without the named column.
 */
export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "42703" && code !== "PGRST204") return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes(column);
}
