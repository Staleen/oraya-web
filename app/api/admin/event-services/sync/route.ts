import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  parseAddonOperationalSetting,
  stringifyAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";
import { EVENT_SERVICE_SEED_DEFINITIONS } from "@/lib/event-service-seed";

export const dynamic = "force-dynamic";

type BaseAddonRow = {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
};

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
  const existingByLabel = new Map(
    existingAddons.map((addon) => [addon.label.trim().toLocaleLowerCase(), addon]),
  );

  const rowsToInsert: BaseAddonRow[] = [];
  const resolvedSeedIds = new Map<string, string>();

  for (const seed of EVENT_SERVICE_SEED_DEFINITIONS) {
    const existing = existingByLabel.get(seed.label.toLocaleLowerCase());
    if (existing) {
      resolvedSeedIds.set(seed.label, existing.id);
      continue;
    }

    const nextRow: BaseAddonRow = {
      id: seed.id,
      label: seed.label,
      enabled: true,
      currency: "USD",
      price: 0,
      pricing_model: "flat_fee",
    };
    rowsToInsert.push(nextRow);
    existingByLabel.set(seed.label.toLocaleLowerCase(), nextRow);
    resolvedSeedIds.set(seed.label, nextRow.id);
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("addons")
      .upsert(rowsToInsert, { onConflict: "id" });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const operationalSettings = parseAddonOperationalSetting(settingsResult.data?.value);
  const nextOperationalSettings: Record<string, AddonOperationalFields> = { ...operationalSettings };
  let createdOperationalEntries = 0;
  let updatedOperationalEntries = 0;

  for (const seed of EVENT_SERVICE_SEED_DEFINITIONS) {
    const addonId = resolvedSeedIds.get(seed.label) ?? seed.id;
    const existing = nextOperationalSettings[addonId];
    const nextEntry: AddonOperationalFields = existing ? { ...existing } : {};
    let changed = false;

    if (!("applies_to" in nextEntry) || !nextEntry.applies_to) {
      nextEntry.applies_to = "event";
      changed = true;
    }
    if (!("recommended" in nextEntry)) {
      nextEntry.recommended = seed.recommended;
      changed = true;
    }
    if (!("applicable_event_types" in nextEntry)) {
      nextEntry.applicable_event_types = [...seed.applicable_event_types];
      changed = true;
    }
    if (!("display_order" in nextEntry) || nextEntry.display_order === null || nextEntry.display_order === undefined) {
      nextEntry.display_order = seed.display_order;
      changed = true;
    }

    if (changed) {
      nextOperationalSettings[addonId] = nextEntry;
      if (existing) {
        updatedOperationalEntries += 1;
      } else {
        createdOperationalEntries += 1;
      }
    }
  }

  const { error: saveSettingsError } = await supabaseAdmin
    .from("settings")
    .upsert(
      { key: ADDON_OPERATIONAL_SETTINGS_KEY, value: stringifyAddonOperationalSetting(
        Object.entries(nextOperationalSettings).map(([id, fields]) => ({ id, ...fields })),
      ) },
      { onConflict: "key" },
    );

  if (saveSettingsError) {
    return NextResponse.json({ error: saveSettingsError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted_addons: rowsToInsert.length,
    created_operational_entries: createdOperationalEntries,
    updated_operational_entries: updatedOperationalEntries,
    total_seed_services: EVENT_SERVICE_SEED_DEFINITIONS.length,
  });
}
