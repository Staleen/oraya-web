import { NextRequest, NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { evaluateThrottleForIp, failureDelay, recordAttempt } from "@/lib/admin-login-attempts";
import { extractClientIp } from "@/lib/admin-login-throttle";
import { decideAdminLogin } from "@/lib/admin-password";
import { PAYMENTS_LIVE_ENABLED_SETTINGS_KEY } from "@/lib/payments/live-rollout";
import { readPaymentsLiveSetting } from "@/lib/payments/live-rollout-setting";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/ops/setup/payments-live]";

/**
 * The live card-payments switch, in /ops.
 *
 * This is the second writer of `payments_live_enabled`. The first
 * (`/api/admin/payments/live-toggle`) stays exactly as it is: /admin is going
 * dormant rather than being deleted, so removing its switch would leave a
 * dormant console holding the only kill switch. Both write the same row, and
 * the row — not either console — remains the single source of truth.
 *
 * The ritual is preserved rather than relaxed, with one deliberate change of
 * meaning. In /admin, enabling requires "the admin password", a shared secret.
 * Here it requires the SIGNED-IN OWNER'S OWN password, which is stronger: it
 * proves who turned real card charging on, and the answer is a person rather
 * than "whoever knew the admin password".
 *
 * - ENABLING: owner session AND their current password, sharing the login
 *   throttle so guessing is slow.
 * - DISABLING: owner session only, no password. The kill switch must never be
 *   slowed down at the moment it is needed.
 */

export async function GET(request: NextRequest) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const setting = await readPaymentsLiveSetting();
  if (!setting.ok) {
    return NextResponse.json({ error: "Could not read the live payments setting." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    enabled: setting.value === "true",
    row_exists: setting.value !== null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const enabled = body.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Say whether card payments should be on or off." }, { status: 400 });
  }

  if (enabled) {
    const ip = extractClientIp(
      request.headers.get("x-forwarded-for"),
      request.headers.get("x-real-ip"),
    );

    const throttle = await evaluateThrottleForIp(ip, LOG_TAG);
    if (throttle.action === "unavailable") {
      console.error(`${LOG_TAG} throttle counters unavailable — failing closed (ip=${ip})`);
      return NextResponse.json({ error: "Could not do this right now. Try again." }, { status: 503 });
    }
    if (throttle.action === "block") {
      console.warn(`${LOG_TAG} throttled enable attempt (ip=${ip}, scope=${throttle.scope})`);
      await failureDelay();
      return NextResponse.json({ error: "Too many attempts. Try again later.", code: "throttled" }, { status: 429 });
    }

    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("password_hash")
      .eq("id", auth.staff.id)
      .maybeSingle();

    const decision = decideAdminLogin({
      password: typeof body.current_password === "string" ? body.current_password : "",
      storedValue: error ? null : (data?.password_hash as string | null | undefined),
      lookupFailed: Boolean(error),
    });

    if (decision.outcome === "unavailable") {
      console.error(`${LOG_TAG} enable unavailable: ${decision.reason} (staff=${auth.staff.id})`, error ?? "");
      return NextResponse.json({ error: "Could not confirm your password right now." }, { status: 503 });
    }
    if (decision.outcome === "unauthorized") {
      console.warn(`${LOG_TAG} enable REFUSED: wrong password (staff=${auth.staff.id}, ip=${ip})`);
      await recordAttempt(ip, false, LOG_TAG);
      await failureDelay();
      return NextResponse.json({ error: "That password is incorrect." }, { status: 401 });
    }
    await recordAttempt(ip, true, LOG_TAG);
  }

  const { error: upsertError } = await supabaseAdmin
    .from("settings")
    .upsert(
      { key: PAYMENTS_LIVE_ENABLED_SETTINGS_KEY, value: enabled ? "true" : "false" },
      { onConflict: "key" },
    );

  if (upsertError) {
    console.error(`${LOG_TAG} settings write failed:`, upsertError);
    return NextResponse.json({ error: "Could not change the live payments setting." }, { status: 503 });
  }

  console.log(
    `${LOG_TAG} live card payments ${enabled ? "ENABLED" : "DISABLED (kill switch)"} by ${auth.staff.id}`,
  );
  return NextResponse.json({ ok: true, enabled });
}
