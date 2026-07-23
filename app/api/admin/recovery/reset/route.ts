import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_RECOVERY_JTI_SETTINGS_KEY,
  decideRecoveryReset,
  verifyAdminRecoveryToken,
} from "@/lib/admin-recovery";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/admin/recovery/reset]";
const GENERIC_TOKEN_ERROR = "This reset link is invalid or has expired. Request a new one.";

/**
 * Remediation 2 (A.2) — spend a recovery token and set a new admin password.
 * The token must verify (signature, purpose, 30-min expiry) AND match the
 * single outstanding server-side jti, which is atomically claimed (cleared)
 * before the password is written — so a token can only ever be spent once.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    console.error(`${LOG_TAG} ADMIN_SECRET is not set — recovery unavailable`);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const verification = verifyAdminRecoveryToken(token, adminSecret);

  const { data: jtiRow, error: jtiReadError } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", ADMIN_RECOVERY_JTI_SETTINGS_KEY)
    .maybeSingle();
  if (jtiReadError) {
    console.error(`${LOG_TAG} jti lookup failed:`, jtiReadError);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }

  const decision = decideRecoveryReset({
    verification,
    storedJti: jtiRow?.value as string | null | undefined,
    newPassword: body.new_password,
    confirmPassword: body.confirm_password,
  });

  if (decision.outcome === "invalid_token") {
    console.warn(`${LOG_TAG} reset rejected: invalid/expired/reused token`);
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  if (decision.outcome === "invalid_new") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  // Atomically claim (clear) the jti row — 0 matched rows means a concurrent
  // reset already spent this token.
  const spentJti = verification.ok ? verification.jti : "";
  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from("settings")
    .update({ value: "" })
    .eq("key", ADMIN_RECOVERY_JTI_SETTINGS_KEY)
    .eq("value", spentJti)
    .select("key");
  if (claimError) {
    console.error(`${LOG_TAG} jti claim failed:`, claimError);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }
  if (!claimedRows || claimedRows.length === 0) {
    console.warn(`${LOG_TAG} reset rejected: token already spent (claim race)`);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }

  const { error: storeError } = await supabaseAdmin
    .from("settings")
    .upsert({ key: "admin_password", value: decision.storedValue }, { onConflict: "key" });
  if (storeError) {
    console.error(`${LOG_TAG} password store failed:`, storeError);
    return NextResponse.json({ error: "Could not store the new password." }, { status: 500 });
  }

  console.log(`${LOG_TAG} admin password reset via recovery link SUCCEEDED`);
  return NextResponse.json({ ok: true });
}
