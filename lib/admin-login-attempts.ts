import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ADMIN_LOGIN_FAILURE_DELAY_MS,
  ADMIN_LOGIN_WINDOW_MS,
  evaluateAdminLoginThrottle,
  type ThrottleDecision,
} from "@/lib/admin-login-throttle";

/**
 * Remediation 2 (A.1) — server-side helpers over the `admin_login_attempts`
 * table, extracted from the verify-password route so the change-password
 * endpoint shares the identical throttle discipline (failed current-password
 * checks count as login failures).
 */

export function failureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ADMIN_LOGIN_FAILURE_DELAY_MS));
}

/** Count recent failed attempts; null on any error (throttle then fails closed). */
export async function countRecentFailures(
  ip: string | null,
  sinceIso: string,
  logTag: string,
): Promise<number | null> {
  let query = supabaseAdmin
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte("attempted_at", sinceIso);
  if (ip !== null) query = query.eq("ip", ip);
  const { count, error } = await query;
  if (error || typeof count !== "number") {
    if (error) console.error(`${logTag} attempts count error:`, error);
    return null;
  }
  return count;
}

export async function recordAttempt(ip: string, success: boolean, logTag: string): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_login_attempts").insert({ ip, success });
  if (error) console.error(`${logTag} attempts insert error:`, error);
}

/** Evaluate the shared per-IP/global throttle for the current window. */
export async function evaluateThrottleForIp(ip: string, logTag: string): Promise<ThrottleDecision> {
  const sinceIso = new Date(Date.now() - ADMIN_LOGIN_WINDOW_MS).toISOString();
  const [perIpFailures, globalFailures] = await Promise.all([
    countRecentFailures(ip, sinceIso, logTag),
    countRecentFailures(null, sinceIso, logTag),
  ]);
  return evaluateAdminLoginThrottle({ perIpFailures, globalFailures });
}
