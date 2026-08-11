import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { INSTANT_BOOKING_SETTING_KEYS } from "@/lib/instant-booking-settings";
import { INSTANT_AUTO_CONFIRM_SETTING_KEY } from "@/lib/bookings/instant-confirm";
import { ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY } from "@/lib/whatsapp/arrival-guide-gate";
import {
  CHECKOUT_BEHAVIOUR_SETTING_KEY,
  parseCheckoutBehaviour,
} from "@/lib/payments/checkout-behaviour";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup/site]";

/**
 * Owner-only writes for the small site switches that used to live in
 * /admin/settings: the sitewide WhatsApp number, the notification email list,
 * the per-villa instant-booking flags, and the Butler check-in guidance text.
 *
 * The key set is ALLOWLISTED here — the auth-sensitive rows (admin password,
 * recovery jti, the live-payments switch) are not reachable through this
 * route at all, by construction rather than by filtering.
 */

const WHATSAPP_KEY = "whatsapp_number";
const NOTIFICATION_EMAILS_KEY = "notification_emails";
const BUTLER_GUIDANCE_KEY = "butler_checkin_guidance";

export const SITE_SETTING_KEYS = [
  WHATSAPP_KEY,
  NOTIFICATION_EMAILS_KEY,
  BUTLER_GUIDANCE_KEY,
  INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"],
  INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"],
  INSTANT_AUTO_CONFIRM_SETTING_KEY,
  ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY,
  CHECKOUT_BEHAVIOUR_SETTING_KEY,
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function PUT(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const writes: Array<{ key: string; value: string }> = [];

  if (Object.prototype.hasOwnProperty.call(body, "whatsapp_number")) {
    const raw = typeof body.whatsapp_number === "string" ? body.whatsapp_number.trim() : "";
    const digits = raw.replace(/[^\d]/g, "");
    // Audit S-10: the old settings page accepted any string — including an
    // empty one — and still said "Saved", leaving guest CTAs pointing nowhere.
    if (digits.length < 8 || digits.length > 15) {
      return NextResponse.json(
        { error: "That doesn't look like a WhatsApp number — use the full number with country code." },
        { status: 400 },
      );
    }
    writes.push({ key: WHATSAPP_KEY, value: digits });
  }

  if (Object.prototype.hasOwnProperty.call(body, "notification_emails")) {
    const raw = body.notification_emails;
    const list = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string")
      : typeof raw === "string"
        ? raw.split(/[,\s]+/)
        : null;
    if (list === null) return NextResponse.json({ error: "Invalid notification emails." }, { status: 400 });
    const cleaned = list.map((v) => v.trim()).filter(Boolean);
    const bad = cleaned.find((v) => !EMAIL_RE.test(v));
    if (bad) return NextResponse.json({ error: `"${bad}" isn't a valid email address.` }, { status: 400 });
    writes.push({ key: NOTIFICATION_EMAILS_KEY, value: cleaned.join(",") });
  }

  if (Object.prototype.hasOwnProperty.call(body, "butler_checkin_guidance")) {
    const raw = typeof body.butler_checkin_guidance === "string" ? body.butler_checkin_guidance.trim() : "";
    if (raw.length > 2000) {
      return NextResponse.json({ error: "That guidance is too long (2000 characters max)." }, { status: 400 });
    }
    writes.push({ key: BUTLER_GUIDANCE_KEY, value: raw });
  }

  for (const [villa, key] of Object.entries(INSTANT_BOOKING_SETTING_KEYS)) {
    const field = `instant_${villa === "Villa Mechmech" ? "mechmech" : "byblos"}`;
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      writes.push({ key, value: body[field] === true ? "true" : "false" });
    }
  }

  // Instant confirmation master switch. Off unless explicitly set to true.
  if (Object.prototype.hasOwnProperty.call(body, "instant_auto_confirm")) {
    writes.push({
      key: INSTANT_AUTO_CONFIRM_SETTING_KEY,
      value: body.instant_auto_confirm === true ? "true" : "false",
    });
  }

  // Hold the arrival guide until the deposit arrives. Off unless set to true.
  if (Object.prototype.hasOwnProperty.call(body, "arrival_guide_payment_gate")) {
    writes.push({
      key: ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY,
      value: body.arrival_guide_payment_gate === true ? "true" : "false",
    });
  }

  // Card checkout behaviour — what the guest is asked for, whether Decision
  // Manager runs, and whether money moves now or is only held. Parsed through
  // the same defaults, so a malformed body cannot produce a dangerous setting.
  if (Object.prototype.hasOwnProperty.call(body, "card_checkout_behaviour")) {
    writes.push({
      key: CHECKOUT_BEHAVIOUR_SETTING_KEY,
      value: JSON.stringify(parseCheckoutBehaviour(body.card_checkout_behaviour)),
    });
  }

  if (writes.length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("settings").upsert(writes, { onConflict: "key" });
  if (error) {
    console.error(`${LOG_TAG} save failed:`, error.message);
    return NextResponse.json({ error: "Those settings could not be saved." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, saved: writes.map((w) => w.key), saved_by: auth.staff.full_name });
}
