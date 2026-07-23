import { NextResponse } from "next/server";
import {
  ADMIN_RECOVERY_JTI_SETTINGS_KEY,
  ADMIN_RECOVERY_MAX_SENDS_PER_HOUR,
  ADMIN_RECOVERY_SEND_MARKER_IP,
  createAdminRecoveryToken,
} from "@/lib/admin-recovery";
import { SITE_URL } from "@/lib/brand";
import { sendAdminRecoveryEmail } from "@/lib/send-admin-recovery-email";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/admin/recovery/request]";
const GENERIC = { ok: true } as const;

/**
 * Remediation 2 (A.2) — "Forgot password?" send endpoint.
 *
 * ALWAYS answers the same generic { ok: true } — it never reveals whether an
 * email was sent, whether recovery is configured, or why a send was skipped.
 * The destination is exclusively the server-side ADMIN_RECOVERY_EMAIL env
 * var; user input is never read. Sends are capped globally at 3/hour
 * (counted as success=true marker rows in admin_login_attempts, which the
 * login-failure throttle ignores).
 */
export async function POST() {
  try {
    const recoveryEmail = process.env.ADMIN_RECOVERY_EMAIL?.trim();
    const adminSecret = process.env.ADMIN_SECRET?.trim();
    if (!recoveryEmail || !adminSecret) {
      console.warn(`${LOG_TAG} recovery not configured (missing env) — nothing sent`);
      return NextResponse.json(GENERIC);
    }

    // Global send cap: 3/hour. Fail CLOSED (skip sending) if the counter is
    // unreadable.
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ADMIN_RECOVERY_SEND_MARKER_IP)
      .gte("attempted_at", sinceIso);
    if (countError || typeof count !== "number") {
      console.error(`${LOG_TAG} send counter unreadable — nothing sent:`, countError);
      return NextResponse.json(GENERIC);
    }
    if (count >= ADMIN_RECOVERY_MAX_SENDS_PER_HOUR) {
      console.warn(`${LOG_TAG} global send cap reached (${count}/h) — nothing sent`);
      return NextResponse.json(GENERIC);
    }

    const { token, jti } = createAdminRecoveryToken(adminSecret);

    // Persist the jti BEFORE sending: only the latest outstanding token is
    // spendable, and it is single-use (the reset endpoint clears this row).
    const { error: jtiError } = await supabaseAdmin
      .from("settings")
      .upsert({ key: ADMIN_RECOVERY_JTI_SETTINGS_KEY, value: jti }, { onConflict: "key" });
    if (jtiError) {
      console.error(`${LOG_TAG} could not persist token jti — nothing sent:`, jtiError);
      return NextResponse.json(GENERIC);
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || SITE_URL;
    // Top-level route (NOT under /admin/*): the admin layout's auth gate
    // would otherwise block a locked-out admin from ever reaching the form.
    const resetUrl = `${base}/admin-reset-password?token=${encodeURIComponent(token)}`;

    await sendAdminRecoveryEmail({ to: recoveryEmail, resetUrl });
    await supabaseAdmin
      .from("admin_login_attempts")
      .insert({ ip: ADMIN_RECOVERY_SEND_MARKER_IP, success: true });

    console.log(`${LOG_TAG} recovery email sent`);
    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error(`${LOG_TAG} send failed:`, error);
    return NextResponse.json(GENERIC);
  }
}
