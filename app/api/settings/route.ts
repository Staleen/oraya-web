import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADDON_OPERATIONAL_SETTINGS_KEY } from "@/lib/addon-operations";
import { GUEST_TESTIMONIALS_SETTINGS_KEY } from "@/lib/guest-testimonials";
import { INSTANT_BOOKING_SETTING_KEYS } from "@/lib/instant-booking-settings";
import { getHostedCheckoutPublicStatus } from "@/lib/payments/runtime";
import {
  PAYMENT_PUBLIC_SETTINGS_KEY,
  parsePaymentPublicSettings,
  paymentModeAllowsPayNow,
} from "@/lib/payments/settings";

const PUBLIC_SETTINGS_KEYS = new Set([
  "whatsapp_number",
  GUEST_TESTIMONIALS_SETTINGS_KEY,
  ADDON_OPERATIONAL_SETTINGS_KEY,
  INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"],
  INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"],
  PAYMENT_PUBLIC_SETTINGS_KEY,
]);

// Public read-only endpoint for explicitly safe settings keys only.
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key param required." }, { status: 400 });
  if (!PUBLIC_SETTINGS_KEYS.has(key)) {
    return NextResponse.json({ error: "Setting not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", key)
    .single();

  if (key === PAYMENT_PUBLIC_SETTINGS_KEY) {
    const base = parsePaymentPublicSettings(data?.value ?? null);
    const runtime = getHostedCheckoutPublicStatus();
    const onlineModeAllowed = paymentModeAllowsPayNow(base.active_payment_mode);
    const onlineEnabled = base.online_payment_enabled && onlineModeAllowed;
    const onlineCheckoutReady = onlineEnabled && runtime.online_checkout_ready;
    const onlineCheckoutMessage = !onlineModeAllowed
      ? "Online payment is not offered for this payment mode right now."
      : !base.online_payment_enabled
        ? "Online payment setup is in progress."
        : runtime.online_checkout_message || "Online payment setup is in progress.";

    return NextResponse.json({
      value: {
        ...base,
        online_checkout_ready: onlineCheckoutReady,
        online_checkout_message: onlineCheckoutMessage,
      },
    });
  }

  if (error) return NextResponse.json({ value: null });
  return NextResponse.json({ value: data?.value ?? null });
}
