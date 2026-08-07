import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  PAYMENT_PUBLIC_SETTINGS_KEY,
  parsePaymentPublicSettings,
  serializePaymentPublicSettings,
} from "@/lib/payments/settings";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup/payments]";

/**
 * Owner-only write for the GUEST-SAFE payment behavior blob (mode, deposit
 * minimum, manual rails, instructions, provider display name, the
 * guest-visible online-payment flag).
 *
 * NOT here, on purpose: the fail-closed live rollout switch. Its only writer
 * is the dedicated password-confirmed /api/admin/payments/live-toggle
 * (DECISIONS_LOG 2026-07-25) — this screen shows its state and points at
 * that flow rather than growing a second writer.
 *
 * Compare-and-set on the serialized blob (audit S-8: the whole-JSON write
 * meant a stale editor silently overwrote every payment field): with
 * `expected_raw`, a save lands only on the state the owner was looking at.
 */
export async function PUT(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let body: { settings?: unknown; expected_raw?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "Invalid payment settings." }, { status: 400 });
  }

  // The shared parser normalizes and clamps every field to safe values; the
  // serializer writes exactly the canonical shape the guest runtime reads.
  const settings = parsePaymentPublicSettings(JSON.stringify(body.settings));
  const value = serializePaymentPublicSettings(settings);
  const expectedRaw = typeof body.expected_raw === "string" ? body.expected_raw : null;

  if (expectedRaw !== null) {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .update({ value })
      .eq("key", PAYMENT_PUBLIC_SETTINGS_KEY)
      .eq("value", expectedRaw)
      .select("key");
    if (error) {
      console.error(`${LOG_TAG} guarded update failed:`, error.message);
      return NextResponse.json({ error: "Could not save the payment settings." }, { status: 503 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error: "Payment settings changed since you loaded this page — reload before saving.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }
  } else {
    const { error } = await supabaseAdmin
      .from("settings")
      .upsert({ key: PAYMENT_PUBLIC_SETTINGS_KEY, value }, { onConflict: "key" });
    if (error) {
      console.error(`${LOG_TAG} upsert failed:`, error.message);
      return NextResponse.json({ error: "Could not save the payment settings." }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true, payment_settings: settings, payment_settings_raw: value, saved_by: auth.staff.full_name });
}
