import { NextRequest, NextResponse } from "next/server";
import {
  OPS_RECOVERY_JTI_SETTINGS_KEY,
  decideOpsRecoveryReset,
  verifyOpsRecoveryToken,
} from "@/lib/ops-recovery";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/ops/recovery/reset]";
const GENERIC_TOKEN_ERROR = "This reset link is invalid or has expired. Request a new one.";

/**
 * Spend an /ops recovery token and set a new password for the owner.
 *
 * The token must verify — signature, `ops_recovery` purpose, 30-minute expiry
 * — AND match the single outstanding server-side jti, which is atomically
 * claimed before any password is written, so a link can only be spent once.
 *
 * The target is resolved server-side as the sole active owner. It is never
 * taken from the request: a token holder cannot choose whose password to set,
 * which keeps a leaked link from becoming a way to seize an operator account.
 * If the number of active owners has changed since the link was sent, the
 * reset is refused rather than guessed at.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    console.error(`${LOG_TAG} ADMIN_SECRET is not set — recovery unavailable`);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const verification = verifyOpsRecoveryToken(token, adminSecret);

  const { data: jtiRow, error: jtiReadError } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", OPS_RECOVERY_JTI_SETTINGS_KEY)
    .maybeSingle();
  if (jtiReadError) {
    console.error(`${LOG_TAG} jti lookup failed:`, jtiReadError);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }

  const decision = decideOpsRecoveryReset({
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

  // Resolve the target before spending the token, so a token is not burned on
  // a reset that cannot complete.
  const { data: owners, error: ownerError } = await supabaseAdmin
    .from("staff")
    .select("id, email")
    .eq("role", "owner")
    .eq("is_active", true);
  if (ownerError) {
    console.error(`${LOG_TAG} owner lookup failed:`, ownerError.message);
    return NextResponse.json({ error: "Could not complete the reset. Try again." }, { status: 503 });
  }
  if (!owners || owners.length !== 1) {
    console.warn(`${LOG_TAG} reset refused: ${owners?.length ?? 0} active owners`);
    return NextResponse.json({ error: GENERIC_TOKEN_ERROR }, { status: 400 });
  }
  const owner = owners[0];

  // Atomically claim (clear) the jti row — 0 matched rows means a concurrent
  // reset already spent this token.
  const spentJti = verification.ok ? verification.jti : "";
  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from("settings")
    .update({ value: "" })
    .eq("key", OPS_RECOVERY_JTI_SETTINGS_KEY)
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

  // Any outstanding invite on this row is cleared too: after a recovery there
  // must be exactly one way in, the password just set.
  const { error: storeError } = await supabaseAdmin
    .from("staff")
    .update({
      password_hash: decision.storedValue,
      invite_token_hash: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", owner.id);
  if (storeError) {
    console.error(`${LOG_TAG} password store failed:`, storeError.message);
    return NextResponse.json({ error: "Could not store the new password." }, { status: 503 });
  }

  console.log(`${LOG_TAG} ops owner password reset via recovery link SUCCEEDED (staff=${owner.id})`);
  return NextResponse.json({ ok: true, email: owner.email });
}
