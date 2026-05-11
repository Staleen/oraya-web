import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  getAddonAppliesTo,
  mergeAddonsWithOperationalSettings,
  parseAddonOperationalSetting,
  type AddonAppliesTo,
} from "@/lib/addon-operations";
import { CANONICAL_EVENT_TYPE_VALUES, normalizeEventType } from "@/lib/event-types";

/**
 * Phase 16A.1 — read-only add-ons surface for the WhatsApp AI Butler.
 *
 * Query params (required unless noted):
 *   - villa:      "mechmech" | "byblos"
 *   - context:    "stay" | "event"
 *   - event_type: canonical event-type value (optional; only meaningful when context=event)
 *
 * Source of truth:
 *   - `addons` table (id, label, enabled, pricing_model)
 *   - `settings.addon_operational_settings` (per-id operational metadata)
 * Both are existing read paths used by `/api/addons` and `/api/settings`; this
 * route does not modify either.
 *
 * Response projection — only fields the Butler genuinely needs to render
 * options. Prices and currency are intentionally omitted in this phase.
 * Operational internals (preparation_time_hours, cutoff_type, enforcement_mode,
 * applicable_villas, applies_to, applicable_event_types, …) are used to filter
 * but never echoed back.
 */

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";

const VILLA_SLUG_MAP: Record<string, string> = {
  mechmech: "Villa Mechmech",
  byblos:   "Villa Byblos",
};

function parseContext(raw: string | null): AddonAppliesTo | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "stay" || v === "event") return v;
  return null;
}

export async function GET(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  const url = new URL(request.url);
  const villaSlug    = (url.searchParams.get("villa")    ?? "").trim().toLowerCase();
  const contextParam = parseContext(url.searchParams.get("context"));
  const eventTypeRaw = url.searchParams.get("event_type");

  if (!villaSlug || !(villaSlug in VILLA_SLUG_MAP)) {
    return NextResponse.json(
      { error: "villa must be 'mechmech' or 'byblos'." },
      { status: 400 },
    );
  }
  if (!contextParam) {
    return NextResponse.json(
      { error: "context must be 'stay' or 'event'." },
      { status: 400 },
    );
  }
  const villa = VILLA_SLUG_MAP[villaSlug];

  let eventType: string | null = null;
  if (eventTypeRaw && eventTypeRaw.trim().length > 0) {
    const normalized = normalizeEventType(eventTypeRaw.trim());
    if (!CANONICAL_EVENT_TYPE_VALUES.includes(normalized as (typeof CANONICAL_EVENT_TYPE_VALUES)[number])) {
      return NextResponse.json({ error: "Unknown event_type." }, { status: 400 });
    }
    eventType = normalized;
  }

  const [addonsRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from("addons")
      .select("id, label, enabled, pricing_model")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", ADDON_OPERATIONAL_SETTINGS_KEY)
      .maybeSingle(),
  ]);

  if (addonsRes.error) {
    console.error("[api/butler/addons] addons query error:", addonsRes.error);
    return NextResponse.json({ error: "Failed to load add-ons." }, { status: 500 });
  }

  const addons = (addonsRes.data ?? []) as Array<{
    id: string;
    label: string;
    enabled: boolean;
    pricing_model: string;
  }>;

  const operationalRaw =
    typeof settingsRes.data?.value === "string" ? settingsRes.data.value : null;
  const operational = parseAddonOperationalSetting(operationalRaw);
  const merged = mergeAddonsWithOperationalSettings(addons, operational);

  const filtered = merged.filter((addon) => {
    if (addon.enabled === false) return false;

    // applies_to gate
    const appliesTo = getAddonAppliesTo(addon.applies_to);
    if (appliesTo !== "both" && appliesTo !== contextParam) return false;

    // Villa applicability — enforce only when the list is non-empty.
    if (
      Array.isArray(addon.applicable_villas) &&
      addon.applicable_villas.length > 0 &&
      !addon.applicable_villas.includes(villa)
    ) {
      return false;
    }

    // Event-type applicability — only when context=event and event_type is given.
    if (
      contextParam === "event" &&
      eventType &&
      Array.isArray(addon.applicable_event_types) &&
      addon.applicable_event_types.length > 0
    ) {
      const normalizedList = addon.applicable_event_types.map((t) => normalizeEventType(t));
      if (!normalizedList.includes(eventType)) return false;
    }

    return true;
  });

  const projected = filtered.map((addon) => ({
    id:                addon.id,
    label:             addon.label,
    recommended:       addon.recommended === true,
    requires_approval: addon.requires_approval === true,
    pricing_model:     addon.pricing_model,
  }));

  return NextResponse.json(
    {
      villa,
      context:    contextParam,
      event_type: eventType,
      addons:     projected,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
