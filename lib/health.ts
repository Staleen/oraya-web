/**
 * Plan 3 Phase 4 (KNOWN_BUGS #2) — pure decision logic for GET /api/health.
 *
 * Reports which REQUIRED production config keys are missing — key NAMES only,
 * never values. Consumed by an uptime monitor so a rotated/deleted
 * RESEND_API_KEY (or any other required key) becomes an alarm instead of
 * bookings silently landing with zero confirmation emails.
 *
 * Relative .ts imports so node:test can load this module (repo test convention).
 */

export const REQUIRED_HEALTH_KEYS = [
  "RESEND_API_KEY",
  "ADMIN_SECRET",
  "ADMIN_RECOVERY_EMAIL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type HealthDecision =
  | { ok: true }
  | { ok: false; missing: string[] };

export function evaluateHealth(
  env: Record<string, string | undefined>,
  requiredKeys: readonly string[] = REQUIRED_HEALTH_KEYS,
): HealthDecision {
  const missing = requiredKeys.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim() === "";
  });
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
