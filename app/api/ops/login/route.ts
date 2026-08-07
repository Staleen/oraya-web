import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isScryptHash, verifyAdminPassword } from "@/lib/admin-password";
import { attachOpsSessionCookie, type StaffRole } from "@/lib/ops-auth";
import { evaluateThrottleForIp, failureDelay, recordAttempt } from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/login]";

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration: ADMIN_SECRET is not set." }, { status: 503 });
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ip = extractClientIp(request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip"));
  const throttle = await evaluateThrottleForIp(ip, LOG_TAG);
  if (throttle.action === "unavailable") {
    console.error(`${LOG_TAG} rate-limit counters unavailable — failing closed`);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
  if (throttle.action === "block") {
    await failureDelay();
    // A-1 lesson: say what actually happened. Reporting a lockout as "wrong
    // password" sends people to reset a password that was never wrong.
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again.", code: "throttled" },
      { status: 429 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, email, full_name, role, is_active, password_hash")
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} staff lookup failed:`, error.message);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Try again shortly." }, { status: 503 });
  }

  const stored = data?.password_hash;
  // One indistinguishable failure for "no such account", "not activated",
  // "deactivated" and "wrong password" — otherwise this endpoint reports
  // which email addresses are real.
  const usable = Boolean(data && data.is_active && typeof stored === "string" && isScryptHash(stored));
  if (!usable || !password || !verifyAdminPassword(password, stored as string)) {
    await recordAttempt(ip, false, LOG_TAG);
    await failureDelay();
    return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  }

  await recordAttempt(ip, true, LOG_TAG);

  const staff = { id: data!.id as string, role: data!.role as StaffRole };
  const response = NextResponse.json({
    ok: true,
    staff: { id: data!.id, email: data!.email, full_name: data!.full_name, role: data!.role },
  });
  attachOpsSessionCookie(response, staff, secret);

  const { error: touchError } = await supabaseAdmin
    .from("staff")
    .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", staff.id);
  // Never block a valid sign-in on bookkeeping.
  if (touchError) console.error(`${LOG_TAG} last_login_at update failed:`, touchError.message);

  return response;
}
