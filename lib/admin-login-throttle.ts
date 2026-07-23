/**
 * Remediation 1.2 — pure throttle logic for POST /api/admin/verify-password.
 *
 * Counters live in the human-run `admin_login_attempts` table
 * (sql/remediation-admin-login-attempts.sql) because in-memory maps do not
 * survive serverless cold starts. The route counts recent failures per IP and
 * globally, then consults `evaluateAdminLoginThrottle`. If the table is
 * unreachable (including the pre-migration state) the login fails CLOSED.
 */

export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_MAX_FAILURES_PER_IP = 5;
/** Backstop against distributed guessing across many IPs. */
export const ADMIN_LOGIN_MAX_FAILURES_GLOBAL = 20;
/** Constant delay applied to every failed attempt (anti-brute-force pacing). */
export const ADMIN_LOGIN_FAILURE_DELAY_MS = 500;

export type ThrottleDecision =
  | { action: "allow" }
  | { action: "block"; status: 429; scope: "ip" | "global" }
  | { action: "unavailable"; status: 503 };

export function evaluateAdminLoginThrottle(input: {
  /** Failed attempts from this IP inside the window, or null if the count could not be read. */
  perIpFailures: number | null;
  /** Failed attempts from all IPs inside the window, or null if the count could not be read. */
  globalFailures: number | null;
}): ThrottleDecision {
  const { perIpFailures, globalFailures } = input;
  if (
    perIpFailures == null ||
    globalFailures == null ||
    !Number.isFinite(perIpFailures) ||
    !Number.isFinite(globalFailures)
  ) {
    return { action: "unavailable", status: 503 };
  }
  if (perIpFailures >= ADMIN_LOGIN_MAX_FAILURES_PER_IP) {
    return { action: "block", status: 429, scope: "ip" };
  }
  if (globalFailures >= ADMIN_LOGIN_MAX_FAILURES_GLOBAL) {
    return { action: "block", status: 429, scope: "global" };
  }
  return { action: "allow" };
}

/**
 * First address in X-Forwarded-For (Vercel appends, client-supplied parts are
 * left-most — we still bucket on it; a spoofing client only throttles itself
 * into the global bucket). Falls back to "unknown".
 */
export function extractClientIp(forwardedFor: string | null, realIp?: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  if (first) return first.slice(0, 100);
  const real = realIp?.trim();
  if (real) return real.slice(0, 100);
  return "unknown";
}
