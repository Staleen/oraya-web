import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  parseAddonOperationalSetting,
  stringifyAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";
import {
  EVENT_SERVICE_SEED_DEFINITIONS,
  expandSeedApplicableEventTypes,
  type EventServiceSeedDefinition,
} from "@/lib/event-service-seed";
import { CANONICAL_EVENT_TYPE_VALUES, normalizeEventType } from "@/lib/event-types";

export const dynamic = "force-dynamic";

type BaseAddonRow = {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
};

const CANONICAL_TYPE_SET = new Set<string>(CANONICAL_EVENT_TYPE_VALUES);

function normLabel(s: string): string {
  return s.trim().toLocaleLowerCase();
}

function shouldRepairAddonPrice(price: number | null | undefined): boolean {
  if (price === null || price === undefined) return true;
  if (!Number.isFinite(price)) return true;
  if (price === 0 || price === 90) return true;
  return false;
}

function normalizeApplicableEventTypesFromDb(list: string[] | null | undefined): string[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    if (typeof t !== "string" || !t.trim()) continue;
    const n = normalizeEventType(t.trim());
    if (CANONICAL_TYPE_SET.has(n) && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function labelMatchSet(seed: EventServiceSeedDefinition): Set<string> {
  const s = new Set<string>();
  s.add(normLabel(seed.label));
  for (const a of seed.matchAliases ?? []) {
    s.add(normLabel(a));
  }
  return s;
}

function findAddonForSeed(
  seed: EventServiceSeedDefinition,
  addons: BaseAddonRow[],
  claimed: Set<string>,
): BaseAddonRow | undefined {
  const byId = addons.find((a) => a.id === seed.id && !claimed.has(a.id));
  if (byId) return byId;
  const labels = labelMatchSet(seed);
  return addons.find((a) => !claimed.has(a.id) && labels.has(normLabel(a.label)));
}

function buildOperationalForSeed(
  seed: EventServiceSeedDefinition,
  existing: AddonOperationalFields,
): AddonOperationalFields {
  const next: AddonOperationalFields = { ...existing };
  const seedTypes = expandSeedApplicableEventTypes(seed.applicable_event_types);
  const normalizedExistingTypes = normalizeApplicableEventTypesFromDb(next.applicable_event_types);

  if (!next.applies_to || next.applies_to === "stay") {
    next.applies_to = "event";
  }

  if (!next.category?.trim()) {
    next.category = seed.category;
  }

  if (normalizedExistingTypes.length === 0) {
    next.applicable_event_types = [...seedTypes];
  } else {
    next.applicable_event_types = normalizedExistingTypes;
  }

  next.preparation_time_hours = seed.preparation_time_hours;
  next.cutoff_type = "before_booking";
  next.requires_approval = seed.requires_approval;
  next.enforcement_mode = seed.enforcement_mode;
  next.recommended = seed.recommended;
  next.display_order = seed.display_order;
  next.quantity_enabled = seed.quantity_enabled;
  next.unit_label = seed.unit_label;
  next.pricing_unit = seed.pricing_unit ?? null;
  next.min_quantity = seed.min_quantity;
  next.max_quantity = seed.max_quantity;

  return next;
}

function sortedOperationalSnapshot(rec: Record<string, AddonOperationalFields>): string {
  const keys = Object.keys(rec).sort();
  return JSON.stringify(keys.map((k) => [k, rec[k]]));
}

export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const [addonsResult, settingsResult] = await Promise.all([
    supabaseAdmin.from("addons").select("id, label, enabled, currency, price, pricing_model"),
    supabaseAdmin.from("settings").select("value").eq("key", ADDON_OPERATIONAL_SETTINGS_KEY).maybeSingle(),
  ]);

  if (addonsResult.error) {
    return NextResponse.json({ error: addonsResult.error.message }, { status: 500 });
  }
  if (settingsResult.error) {
    return NextResponse.json({ error: settingsResult.error.message }, { status: 500 });
  }

  const existingAddons = (addonsResult.data ?? []) as BaseAddonRow[];
  const operationalSettings = parseAddonOperationalSetting(settingsResult.data?.value);
  const nextOperationalSettings: Record<string, AddonOperationalFields> = { ...operationalSettings };
  const operationalBefore = sortedOperationalSnapshot(nextOperationalSettings);

  const claimedAddonIds = new Set<string>();
  const addonRowsToUpsert: BaseAddonRow[] = [];
  let insertedAddons = 0;
  let updatedAddons = 0;

  for (const seed of EVENT_SERVICE_SEED_DEFINITIONS) {
    const match = findAddonForSeed(seed, existingAddons, claimedAddonIds);
    const resolvedId = match?.id ?? seed.id;

    if (match) {
      claimedAddonIds.add(match.id);
    }

    const addonPatch: Partial<BaseAddonRow> = {};
    if (match) {
      if (match.label !== seed.label) addonPatch.label = seed.label;
      if (shouldRepairAddonPrice(match.price)) addonPatch.price = seed.price;
      if (match.currency !== seed.currency) addonPatch.currency = seed.currency;
      if (match.pricing_model !== seed.pricing_model) addonPatch.pricing_model = seed.pricing_model;
      if (Object.keys(addonPatch).length > 0) {
        addonRowsToUpsert.push({ ...match, ...addonPatch });
        updatedAddons += 1;
      }
    } else {
      claimedAddonIds.add(seed.id);
      addonRowsToUpsert.push({
        id: seed.id,
        label: seed.label,
        enabled: true,
        currency: seed.currency,
        price: seed.price,
        pricing_model: seed.pricing_model,
      });
      insertedAddons += 1;
    }

    const priorOp = nextOperationalSettings[resolvedId] ?? {};
    const mergedOp = buildOperationalForSeed(seed, priorOp);
    nextOperationalSettings[resolvedId] = mergedOp;
  }

  const operationalChanged = sortedOperationalSnapshot(nextOperationalSettings) !== operationalBefore;

  if (addonRowsToUpsert.length > 0) {
    const { error: upsertAddonsError } = await supabaseAdmin.from("addons").upsert(addonRowsToUpsert, { onConflict: "id" });
    if (upsertAddonsError) {
      return NextResponse.json({ error: upsertAddonsError.message }, { status: 500 });
    }
  }

  const operationalPayload = Object.entries(nextOperationalSettings).map(([id, fields]) => ({
    id,
    ...fields,
  }));

  const { error: saveSettingsError } = await supabaseAdmin.from("settings").upsert(
    {
      key: ADDON_OPERATIONAL_SETTINGS_KEY,
      value: stringifyAddonOperationalSetting(operationalPayload),
    },
    { onConflict: "key" },
  );

  if (saveSettingsError) {
    return NextResponse.json({ error: saveSettingsError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted_addons: insertedAddons,
    updated_addons: updatedAddons,
    operational_settings_changed: operationalChanged,
    total_seed_services: EVENT_SERVICE_SEED_DEFINITIONS.length,
  });
}
