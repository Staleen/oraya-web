import { NextRequest, NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { decideAdminPasswordChange } from "@/lib/admin-change-password";
import { evaluateThrottleForIp, failureDelay, recordAttempt } from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/change-password]";

/**
 * Change your OWN /ops password.
 *
 * This is the per-person equivalent of the legacy admin password change, and
 * it reuses that endpoint's decision core verbatim (`decideAdminPasswordChange`)
 * rather than restating the rules: the current password must verify against
 * the stored scrypt hash — holding a session cookie is not enough — the new
 * password is entered twice, minimum 12 characters, and only a fresh scrypt
 * hash is ever written. Password values are never logged.
 *
 * The difference is where the hash lives: the admin flow reads and writes
 * `settings.admin_password`, a single shared secret. Here the hash is the
 * signed-in person's own `staff.password_hash`, so one person changing their
 * password cannot affect anyone else's access.
 *
 * Known limitation, deliberately not solved here: /ops sessions are stateless
 * HMAC tokens with no version claim, so changing your password does not sign
 * out your OTHER devices. Ending every session for a person requires either a
 * schema change (a token version column) or an owner-initiated reset, which
 * does end them because it clears `password_hash`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ip = extractClientIp(
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
  );

  // Shares the login throttle: a wrong current password is a failed
  // credential check and is counted as one.
  const throttle = await evaluateThrottleForIp(ip, LOG_TAG);
  if (throttle.action === "unavailable") {
    console.error(`${LOG_TAG} throttle counters unavailable — failing closed (ip=${ip})`);
    return NextResponse.json({ error: "Could not do this right now. Try again." }, { status: 503 });
  }
  if (throttle.action === "block") {
    console.warn(`${LOG_TAG} throttled attempt (ip=${ip}, scope=${throttle.scope})`);
    await failureDelay();
    return NextResponse.json({ error: "Too many attempts. Try again later.", code: "throttled" }, { status: 429 });
  }

  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("password_hash")
    .eq("id", auth.staff.id)
    .maybeSingle();

  const decision = decideAdminPasswordChange({
    currentPassword: body.current_password,
    newPassword: body.new_password,
    confirmPassword: body.confirm_password,
    storedValue: error ? null : (data?.password_hash as string | null | undefined),
    lookupFailed: Boolean(error),
  });

  if (decision.outcome === "unavailable") {
    console.error(`${LOG_TAG} unavailable: ${decision.reason} (staff=${auth.staff.id})`, error ?? "");
    return NextResponse.json({ error: "Could not change your password right now." }, { status: 503 });
  }
  if (decision.outcome === "invalid_new") {
    return NextResponse.json({ error: decision.error }, { status: 400 });
  }
  if (decision.outcome === "wrong_current") {
    console.warn(`${LOG_TAG} wrong current password (staff=${auth.staff.id}, ip=${ip})`);
    await recordAttempt(ip, false, LOG_TAG);
    await failureDelay();
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }

  // Guarded on the hash we just read: if anything else changed this row in
  // between (an owner reset, most importantly), this write does not land and
  // the caller is told rather than silently overwriting the reset.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("staff")
    .update({ password_hash: decision.storedValue, updated_at: new Date().toISOString() })
    .eq("id", auth.staff.id)
    .eq("password_hash", data?.password_hash as string)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(`${LOG_TAG} store failed (staff=${auth.staff.id}):`, updateError.message);
    return NextResponse.json({ error: "Could not store your new password." }, { status: 503 });
  }
  if (!updated) {
    return NextResponse.json(
      {
        error: "Your account changed while you were typing — sign in again before changing your password.",
        code: "changed_elsewhere",
      },
      { status: 409 },
    );
  }

  console.log(`${LOG_TAG} password changed (staff=${auth.staff.id}, ip=${ip})`);
  await recordAttempt(ip, true, LOG_TAG);
  return NextResponse.json({ ok: true });
}
