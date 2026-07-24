import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  evaluateThrottleForIp,
  failureDelay,
  recordAttempt,
} from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";
import { decideAdminLogin } from "@/lib/admin-password";
import { PAYMENTS_LIVE_ENABLED_SETTINGS_KEY } from "@/lib/payments/live-rollout";
import { readPaymentsLiveSetting } from "@/lib/payments/live-rollout-setting";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/admin/payments/live-toggle]";

/**
 * Plan 4 Phase 3 (3.2) — the ONLY writer of the `payments_live_enabled`
 * settings row (the generic settings POST shields it like `admin_password`).
 *
 * - ENABLING live card payments is gated like the password-change flow:
 *   admin session AND the current admin password, sharing the login throttle.
 * - DISABLING is the kill switch: admin session only, no password, so it can
 *   never be slowed down when it matters.
 */

export async function GET(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const setting = await readPaymentsLiveSetting();
  if (!setting.ok) {
    return NextResponse.json({ error: "Could not read the live payments setting." }, { status: 500 });
  }
  return NextResponse.json({
    enabled: setting.value === "true",
    row_exists: setting.value !== null,
  });
}

export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const enabled = body.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false." }, { status: 400 });
  }

  if (enabled) {
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
      console.warn(`${LOG_TAG} throttled enable attempt (ip=${ip}, scope=${throttle.scope})`);
      await failureDelay();
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "admin_password")
      .maybeSingle();

    const decision = decideAdminLogin({
      password: typeof body.current_password === "string" ? body.current_password : "",
      storedValue: error ? null : (data?.value as string | null | undefined),
      lookupFailed: Boolean(error),
    });

    if (decision.outcome === "unavailable") {
      console.error(`${LOG_TAG} enable unavailable: ${decision.reason} (ip=${ip})`, error ?? "");
      return NextResponse.json({ error: "admin_auth_unavailable" }, { status: 503 });
    }
    if (decision.outcome === "unauthorized") {
      console.warn(`${LOG_TAG} enable REFUSED: wrong current password (ip=${ip})`);
      await recordAttempt(ip, false, LOG_TAG);
      await failureDelay();
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }
    await recordAttempt(ip, true, LOG_TAG);
  }

  const value = enabled ? "true" : "false";
  const { error: upsertError } = await supabaseAdmin
    .from("settings")
    .upsert({ key: PAYMENTS_LIVE_ENABLED_SETTINGS_KEY, value }, { onConflict: "key" });

  if (upsertError) {
    console.error(`${LOG_TAG} settings write failed:`, upsertError);
    return NextResponse.json({ error: "Could not update the live payments setting." }, { status: 500 });
  }

  console.log(
    `${LOG_TAG} live card payments ${enabled ? "ENABLED" : "DISABLED (kill switch)"} by admin`,
  );
  return NextResponse.json({ ok: true, enabled });
}
