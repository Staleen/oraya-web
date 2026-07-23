import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { attachAdminSessionCookie } from "@/lib/admin-auth";
import { decideAdminLogin } from "@/lib/admin-password";
import {
  ADMIN_LOGIN_WINDOW_MS,
  ADMIN_LOGIN_FAILURE_DELAY_MS,
  evaluateAdminLoginThrottle,
  extractClientIp,
} from "@/lib/admin-login-throttle";

export const dynamic = "force-dynamic";

function getAdminSecretOrNull(): string | null {
  const s = process.env.ADMIN_SECRET;
  return s?.trim() ? s.trim() : null;
}

function failureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ADMIN_LOGIN_FAILURE_DELAY_MS));
}

/** Count recent failed attempts; null on any error (throttle then fails closed). */
async function countRecentFailures(ip: string | null, sinceIso: string): Promise<number | null> {
  let query = supabaseAdmin
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte("attempted_at", sinceIso);
  if (ip !== null) query = query.eq("ip", ip);
  const { count, error } = await query;
  if (error || typeof count !== "number") {
    if (error) console.error("[api/admin/verify-password] attempts count error:", error);
    return null;
  }
  return count;
}

async function recordAttempt(ip: string, success: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_login_attempts").insert({ ip, success });
  if (error) console.error("[api/admin/verify-password] attempts insert error:", error);
}

export async function POST(request: NextRequest) {
  const adminSecret = getAdminSecretOrNull();
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_SECRET is not set." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const ip = extractClientIp(
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
  );
  const sinceIso = new Date(Date.now() - ADMIN_LOGIN_WINDOW_MS).toISOString();
  const [perIpFailures, globalFailures] = await Promise.all([
    countRecentFailures(ip, sinceIso),
    countRecentFailures(null, sinceIso),
  ]);

  const throttle = evaluateAdminLoginThrottle({ perIpFailures, globalFailures });
  if (throttle.action === "unavailable") {
    // Pre-migration or DB outage: fail closed (sql/remediation-admin-login-attempts.sql).
    console.error("[api/admin/verify-password] rate-limit counters unavailable — failing closed");
    return NextResponse.json({ ok: false, error: "admin_auth_unavailable" }, { status: 503 });
  }
  if (throttle.action === "block") {
    await failureDelay();
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "admin_password")
    .maybeSingle();

  const decision = decideAdminLogin({
    password,
    storedValue: error ? null : (data?.value as string | null | undefined),
    lookupFailed: Boolean(error),
  });

  if (decision.outcome === "unavailable") {
    console.error(
      "[api/admin/verify-password] admin auth unavailable:",
      decision.reason,
      error ?? "",
    );
    return NextResponse.json({ ok: false, error: "admin_auth_unavailable" }, { status: 503 });
  }

  if (decision.outcome === "unauthorized") {
    await recordAttempt(ip, false);
    await failureDelay();
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await recordAttempt(ip, true);
  const res = NextResponse.json({ ok: true });
  attachAdminSessionCookie(res, adminSecret);
  return res;
}
