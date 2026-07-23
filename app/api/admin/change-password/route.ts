import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { decideAdminPasswordChange } from "@/lib/admin-change-password";
import {
  evaluateThrottleForIp,
  failureDelay,
  recordAttempt,
} from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/admin/change-password]";

/**
 * Remediation 2 (A.1) — the ONLY way to change the admin password from the
 * Settings UI: requires the current password (session cookie alone is not
 * enough), new password twice with min 12 chars, shares the login throttle
 * (failed current-password checks count as failures), and writes only a
 * scrypt hash. Password values are never logged.
 */
export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ip = extractClientIp(
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
  );

  const throttle = await evaluateThrottleForIp(ip, LOG_TAG);
  if (throttle.action === "unavailable") {
    console.error(`${LOG_TAG} rate-limit counters unavailable — failing closed (ip=${ip})`);
    return NextResponse.json({ error: "admin_auth_unavailable" }, { status: 503 });
  }
  if (throttle.action === "block") {
    console.warn(`${LOG_TAG} throttled password-change attempt (ip=${ip}, scope=${throttle.scope})`);
    await failureDelay();
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "admin_password")
    .maybeSingle();

  const decision = decideAdminPasswordChange({
    currentPassword: body.current_password,
    newPassword: body.new_password,
    confirmPassword: body.confirm_password,
    storedValue: error ? null : (data?.value as string | null | undefined),
    lookupFailed: Boolean(error),
  });

  if (decision.outcome === "unavailable") {
    console.error(`${LOG_TAG} password change unavailable: ${decision.reason} (ip=${ip})`, error ?? "");
    return NextResponse.json({ error: "admin_auth_unavailable" }, { status: 503 });
  }

  if (decision.outcome === "invalid_new") {
    console.warn(`${LOG_TAG} password change rejected: invalid new password (ip=${ip})`);
    return NextResponse.json({ error: decision.error }, { status: 400 });
  }

  if (decision.outcome === "wrong_current") {
    console.warn(`${LOG_TAG} password change FAILED: wrong current password (ip=${ip})`);
    await recordAttempt(ip, false, LOG_TAG);
    await failureDelay();
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const { error: upsertError } = await supabaseAdmin
    .from("settings")
    .upsert({ key: "admin_password", value: decision.storedValue }, { onConflict: "key" });

  if (upsertError) {
    console.error(`${LOG_TAG} password change store error (ip=${ip}):`, upsertError);
    return NextResponse.json({ error: "Could not store the new password." }, { status: 500 });
  }

  console.log(`${LOG_TAG} password change SUCCEEDED (ip=${ip})`);
  await recordAttempt(ip, true, LOG_TAG);
  return NextResponse.json({ ok: true });
}
