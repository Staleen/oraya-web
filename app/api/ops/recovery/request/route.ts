import { NextResponse } from "next/server";
import {
  OPS_RECOVERY_JTI_SETTINGS_KEY,
  OPS_RECOVERY_MAX_SENDS_PER_HOUR,
  OPS_RECOVERY_SEND_MARKER_IP,
  createOpsRecoveryToken,
} from "@/lib/ops-recovery";
import { SITE_URL } from "@/lib/brand";
import { sendAdminRecoveryEmail } from "@/lib/send-admin-recovery-email";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/ops/recovery/request]";
const GENERIC = { ok: true } as const;

/**
 * "Forgot password?" for the /ops OWNER — the way back in once /admin is
 * dormant. Modelled directly on the admin recovery send endpoint.
 *
 * ALWAYS answers the same generic { ok: true }: it never reveals whether an
 * email was sent, whether recovery is configured, whether an owner exists, or
 * why a send was skipped. The destination is exclusively the server-side
 * ADMIN_RECOVERY_EMAIL env var — user input never chooses where this goes,
 * which is what stops the endpoint from being turned into a way to mail a
 * reset link to an attacker.
 *
 * Operators are not covered on purpose: a locked-out operator is reset by the
 * owner from the Team screen. Only the owner has nobody above them.
 */
export async function POST() {
  try {
    const recoveryEmail = process.env.ADMIN_RECOVERY_EMAIL?.trim();
    const adminSecret = process.env.ADMIN_SECRET?.trim();
    if (!recoveryEmail || !adminSecret) {
      console.warn(`${LOG_TAG} recovery not configured (missing env) — nothing sent`);
      return NextResponse.json(GENERIC);
    }

    // Only send if there is actually an active owner to reset. Fail closed on
    // a read error rather than minting a token nothing can spend.
    const { count: ownerCount, error: ownerError } = await supabaseAdmin
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("is_active", true);
    if (ownerError || typeof ownerCount !== "number") {
      console.error(`${LOG_TAG} owner lookup failed — nothing sent:`, ownerError);
      return NextResponse.json(GENERIC);
    }
    if (ownerCount === 0) {
      console.warn(`${LOG_TAG} no active owner — nothing sent`);
      return NextResponse.json(GENERIC);
    }
    if (ownerCount > 1) {
      // Ambiguous target: the reset endpoint would not know which owner to
      // act on, so refuse to mint rather than guess at an account.
      console.warn(`${LOG_TAG} ${ownerCount} active owners — ambiguous target, nothing sent`);
      return NextResponse.json(GENERIC);
    }

    // Global send cap: 3/hour, counted separately from the admin flow's
    // marker so the two cannot exhaust each other. Fail CLOSED if unreadable.
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", OPS_RECOVERY_SEND_MARKER_IP)
      .gte("attempted_at", sinceIso);
    if (countError || typeof count !== "number") {
      console.error(`${LOG_TAG} send counter unreadable — nothing sent:`, countError);
      return NextResponse.json(GENERIC);
    }
    if (count >= OPS_RECOVERY_MAX_SENDS_PER_HOUR) {
      console.warn(`${LOG_TAG} global send cap reached (${count}/h) — nothing sent`);
      return NextResponse.json(GENERIC);
    }

    const { token, jti } = createOpsRecoveryToken(adminSecret);

    // Persist the jti BEFORE sending: only the latest outstanding token is
    // spendable, and it is single-use.
    const { error: jtiError } = await supabaseAdmin
      .from("settings")
      .upsert({ key: OPS_RECOVERY_JTI_SETTINGS_KEY, value: jti }, { onConflict: "key" });
    if (jtiError) {
      console.error(`${LOG_TAG} could not persist token jti — nothing sent:`, jtiError);
      return NextResponse.json(GENERIC);
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || SITE_URL;
    // Top-level route, NOT under /ops/*: the ops layout's auth gate would
    // otherwise block a locked-out owner from ever reaching the form.
    const resetUrl = `${base}/ops-reset-password?token=${encodeURIComponent(token)}`;

    await sendAdminRecoveryEmail({ to: recoveryEmail, resetUrl, consoleName: "operations" });
    await supabaseAdmin
      .from("admin_login_attempts")
      .insert({ ip: OPS_RECOVERY_SEND_MARKER_IP, success: true });

    console.log(`${LOG_TAG} ops owner recovery email sent`);
    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error(`${LOG_TAG} send failed:`, error);
    return NextResponse.json(GENERIC);
  }
}
