import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashAdminPassword, verifyAdminPassword, isScryptHash } from "@/lib/admin-password";
import { attachOpsSessionCookie, type StaffRole } from "@/lib/ops-auth";
import { evaluateThrottleForIp, failureDelay, recordAttempt } from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/invite/accept]";

const MIN_PASSWORD_LENGTH = 12; // same rule as the admin password change flow

/**
 * Redeem a one-time staff invite: prove the token, set a password, sign in.
 *
 * Disclosure discipline matches /api/ops/login: an unknown token, an expired
 * token, an already-used token, and a deactivated account are all the same
 * 400, so this endpoint cannot be used to probe which invites exist. The
 * password write is guarded on `password_hash IS NULL`, so a raced double
 * submission can only succeed once.
 */
export async function POST(request: NextRequest) {
  const key = process.env.ADMIN_SECRET?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_SECRET is not set." },
      { status: 503 },
    );
  }

  const ip = extractClientIp(request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip"));
  const throttle = await evaluateThrottleForIp(ip, LOG_TAG);
  if (throttle.action === "unavailable") {
    return NextResponse.json({ error: "Could not verify this right now. Try again." }, { status: 503 });
  }
  if (throttle.action === "block") {
    return NextResponse.json(
      { error: "Too many attempts. Try again later.", code: "throttled" },
      { status: 429 },
    );
  }

  let token = "";
  let password = "";
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    token = typeof body.token === "string" ? body.token.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const invalidInvite = () =>
    NextResponse.json(
      { error: "This invite link is no longer valid. Ask for a new one.", code: "invalid_invite" },
      { status: 400 },
    );

  // Pending invites only — a tiny set, verified one by one because the token
  // is stored solely as a salted scrypt hash.
  const { data: pending, error: loadError } = await supabaseAdmin
    .from("staff")
    .select("id, role, is_active, invite_token_hash, invite_expires_at")
    .is("password_hash", null)
    .not("invite_token_hash", "is", null);

  if (loadError) {
    console.error(`${LOG_TAG} pending-invite load failed:`, loadError.message);
    return NextResponse.json({ error: "Could not verify this right now. Try again." }, { status: 503 });
  }

  const now = Date.now();
  const match = (pending ?? []).find(
    (s) => isScryptHash(s.invite_token_hash) && verifyAdminPassword(token, s.invite_token_hash),
  );

  const usable =
    match &&
    match.is_active &&
    typeof match.invite_expires_at === "string" &&
    Number.isFinite(Date.parse(match.invite_expires_at)) &&
    Date.parse(match.invite_expires_at) > now;

  if (!usable) {
    await recordAttempt(ip, false, LOG_TAG);
    await failureDelay();
    return invalidInvite();
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("staff")
    .update({
      password_hash: hashAdminPassword(password),
      invite_token_hash: null,
      invite_expires_at: null,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .is("password_hash", null)
    .select("id, email, full_name, role")
    .maybeSingle();

  if (updateError) {
    console.error(`${LOG_TAG} accept failed:`, updateError.message);
    return NextResponse.json({ error: "Could not finish setting up. Try again." }, { status: 503 });
  }
  if (!updated) {
    // Lost a race with another submission of the same link — single use.
    await recordAttempt(ip, false, LOG_TAG);
    return invalidInvite();
  }

  await recordAttempt(ip, true, LOG_TAG);

  const response = NextResponse.json({ ok: true, staff: updated });
  attachOpsSessionCookie(response, { id: updated.id, role: updated.role as StaffRole }, key);
  return response;
}
