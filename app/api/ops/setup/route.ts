import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { VILLA_BASE_PRICING_KEY, parseVillaPricingSetting } from "@/lib/admin-pricing";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  parseAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";
import {
  PAYMENT_PUBLIC_SETTINGS_KEY,
  parsePaymentPublicSettings,
} from "@/lib/payments/settings";
import { getHostedCheckoutAdminStatus } from "@/lib/payments/runtime";
import { readPaymentsLiveSetting } from "@/lib/payments/live-rollout-setting";
import {
  GUEST_TESTIMONIALS_SETTINGS_KEY,
  parseGuestTestimonialsJson,
} from "@/lib/guest-testimonials";
import { INSTANT_BOOKING_SETTING_KEYS } from "@/lib/instant-booking-settings";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup]";

/**
 * Owner-only read for the /ops Setup screens (Pricing, Extras, Payments).
 *
 * Deliberately its own surface — an ops session must never pass an
 * /api/admin guard, and the operator role must be refused by the API, not
 * just missing a menu item.
 *
 * The response also carries the RAW serialized blobs for pricing and payment
 * settings: the section PUTs accept them back as `expected` values so a save
 * only lands on the state the owner was actually looking at (the audit S-8
 * whole-blob-overwrite lesson, applied as compare-and-set).
 */
export async function GET(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const [settingsResult, addonsResult, readiness, live] = await Promise.all([
    supabaseAdmin
      .from("settings")
      .select("key, value")
      .in("key", [
        VILLA_BASE_PRICING_KEY,
        ADDON_OPERATIONAL_SETTINGS_KEY,
        PAYMENT_PUBLIC_SETTINGS_KEY,
        GUEST_TESTIMONIALS_SETTINGS_KEY,
        "whatsapp_number",
        "notification_emails",
        "butler_checkin_guidance",
        INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"],
        INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"],
      ]),
    supabaseAdmin
      .from("addons")
      .select("id, label, enabled, currency, price, pricing_model")
      .order("id", { ascending: true }),
    getHostedCheckoutAdminStatus(),
    readPaymentsLiveSetting(),
  ]);

  if (settingsResult.error || addonsResult.error) {
    console.error(
      `${LOG_TAG} load failed:`,
      settingsResult.error?.message ?? addonsResult.error?.message,
    );
    return NextResponse.json({ error: "Could not load the setup data." }, { status: 503 });
  }

  const byKey = new Map((settingsResult.data ?? []).map((r) => [r.key as string, r.value as string | null]));
  const pricingRaw = byKey.get(VILLA_BASE_PRICING_KEY) ?? null;
  const paymentsRaw = byKey.get(PAYMENT_PUBLIC_SETTINGS_KEY) ?? null;
  const operational = parseAddonOperationalSetting(byKey.get(ADDON_OPERATIONAL_SETTINGS_KEY));

  const addons = (addonsResult.data ?? []).map((a) => ({
    ...a,
    operational: (operational[a.id as string] ?? {}) as AddonOperationalFields,
  }));

  return NextResponse.json({
    ok: true,
    pricing: parseVillaPricingSetting(pricingRaw),
    pricing_raw: pricingRaw,
    addons,
    payment_settings: parsePaymentPublicSettings(paymentsRaw),
    payment_settings_raw: paymentsRaw,
    testimonials: parseGuestTestimonialsJson(byKey.get(GUEST_TESTIMONIALS_SETTINGS_KEY)),
    // Raw stored value, so a save can prove it edited THIS version and not one
    // someone else has since replaced. Same compare-and-set the other Setup
    // screens use.
    testimonials_raw: byKey.get(GUEST_TESTIMONIALS_SETTINGS_KEY) ?? null,
    site: {
      whatsapp_number: byKey.get("whatsapp_number") ?? "",
      notification_emails: byKey.get("notification_emails") ?? "",
      butler_checkin_guidance: byKey.get("butler_checkin_guidance") ?? "",
      instant_mechmech: byKey.get(INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"]) === "true",
      instant_byblos: byKey.get(INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"]) === "true",
    },
    readiness,
    // The fail-closed live switch is READ-ONLY here: its only writer is the
    // dedicated password-confirmed /api/admin/payments/live-toggle endpoint
    // (DECISIONS_LOG 2026-07-25). Surfacing state is safe; flipping is not.
    payments_live: live.ok ? live.value === "true" : null,
  });
}
