import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { attachAdminSessionCookie } from "@/lib/admin-auth";
import { decideAdminLogin } from "@/lib/admin-password";
import {
  evaluateThrottleForIp,
  failureDelay,
  recordAttempt,
} from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/admin/verify-password]";

function getAdminSecretOrNull(): string | null {
  const s = process.env.ADMIN_SECRET;
  return s?.trim() ? s.trim() : null;
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

  const throttle = await evaluateThrottleForIp(ip, LOG_TAG);
  if (throttle.action === "unavailable") {
    // Pre-migration or DB outage: fail closed (sql/remediation-admin-login-attempts.sql).
    console.error(`${LOG_TAG} rate-limit counters unavailable — failing closed`);
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
      `${LOG_TAG} admin auth unavailable:`,
      decision.reason,
      error ?? "",
    );
    return NextResponse.json({ ok: false, error: "admin_auth_unavailable" }, { status: 503 });
  }

  if (decision.outcome === "unauthorized") {
    await recordAttempt(ip, false, LOG_TAG);
    await failureDelay();
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await recordAttempt(ip, true, LOG_TAG);
  const res = NextResponse.json({ ok: true });
  attachAdminSessionCookie(res, adminSecret);
  return res;
}
