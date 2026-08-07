import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  parseAddonOperationalSetting,
  stringifyAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";
import { KNOWN_VILLAS } from "@/lib/calendar/villas";
import { CANONICAL_EVENT_TYPE_VALUES } from "@/lib/event-types";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup/addons]";

const PRICING_MODELS = ["flat_fee", "per_night", "per_person_per_day", "per_unit"] as const;

interface IncomingAddon {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: (typeof PRICING_MODELS)[number];
  /** Every operational rule the Extras screen now edits (batch 2). */
  operational: AddonOperationalFields;
}

const CUTOFF_TYPES = ["before_checkin", "before_booking"] as const;
const ENFORCEMENT_MODES = ["strict", "soft", "none"] as const;
const APPLIES_TO = ["stay", "event", "both"] as const;
const EVENT_PRICING_UNITS = ["fixed", "per_guest", "per_unit", "per_hour", "percentage"] as const;

function optionalNumber(value: unknown, field: string, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`"${label}" has an invalid ${field}.`);
  }
  return value;
}

function optionalText(value: unknown, field: string, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`"${label}" has an invalid ${field}.`);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalEnum<T extends string>(
  value: unknown, allowed: readonly T[], field: string, label: string,
): T | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`"${label}" has an invalid ${field}.`);
  }
  return value as T;
}

function stringList(value: unknown, allowed: readonly string[], field: string, label: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`"${label}" has invalid ${field}.`);
  const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  const unknownValue = out.find((v) => !allowed.includes(v));
  if (unknownValue) throw new Error(`"${label}" references an unknown ${field}: ${unknownValue}.`);
  return out;
}

/** Read the operational rules, refusing anything the shared parser would drop. */
function readOperational(raw: unknown, label: string): AddonOperationalFields {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const pricingType = optionalEnum(o.pricing_type, ["fixed", "percentage"] as const, "price basis", label);
  const percentageValue = optionalNumber(o.percentage_value, "percentage", label);
  if (pricingType === "percentage" && (percentageValue === null || percentageValue > 100)) {
    throw new Error(`"${label}" is priced as a percentage, so it needs a percentage between 0 and 100.`);
  }

  const minQuantity = optionalNumber(o.min_quantity, "minimum quantity", label);
  const maxQuantity = optionalNumber(o.max_quantity, "maximum quantity", label);
  if (minQuantity !== null && maxQuantity !== null && minQuantity > maxQuantity) {
    throw new Error(`"${label}" has a minimum quantity above its maximum.`);
  }

  return {
    requires_approval: o.requires_approval === true,
    recommended: o.recommended === true,
    quantity_enabled: o.quantity_enabled === true,
    applies_to: optionalEnum(o.applies_to, APPLIES_TO, "applies-to", label) ?? "stay",
    ...(optionalNumber(o.preparation_time_hours, "preparation time", label) !== null
      ? { preparation_time_hours: optionalNumber(o.preparation_time_hours, "preparation time", label) }
      : {}),
    cutoff_type: optionalEnum(o.cutoff_type, CUTOFF_TYPES, "notice deadline", label),
    enforcement_mode: optionalEnum(o.enforcement_mode, ENFORCEMENT_MODES, "enforcement", label),
    category: optionalText(o.category, "category", label),
    // `description` is typed `string | undefined` on AddonOperationalFields —
    // clearing it means omitting it, not writing null.
    ...(optionalText(o.description, "description", label) !== null
      ? { description: optionalText(o.description, "description", label)! }
      : {}),
    unit_label: optionalText(o.unit_label, "unit name", label),
    display_order: optionalNumber(o.display_order, "display order", label),
    pricing_unit: optionalEnum(o.pricing_unit, EVENT_PRICING_UNITS, "event price unit", label),
    min_quantity: minQuantity,
    max_quantity: maxQuantity,
    applicable_villas: stringList(o.applicable_villas, KNOWN_VILLAS, "villa", label),
    applicable_event_types: stringList(o.applicable_event_types, CANONICAL_EVENT_TYPE_VALUES, "event type", label),
    ...(pricingType ? { pricing_type: pricingType } : {}),
    ...(percentageValue !== null ? { percentage_value: percentageValue } : {}),
  };
}

function readAddons(raw: unknown): IncomingAddon[] {
  if (!Array.isArray(raw)) throw new Error("Invalid add-ons payload.");
  return raw.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid add-on.");
    const a = item as Record<string, unknown>;
    const id = typeof a.id === "string" ? a.id.trim() : "";
    const label = typeof a.label === "string" ? a.label.trim() : "";
    if (!id || !/^[a-z0-9_-]+$/i.test(id)) throw new Error("Every add-on needs a simple id (letters, numbers, dashes).");
    if (!label) throw new Error("Every add-on needs a name.");
    const model = a.pricing_model;
    if (!(PRICING_MODELS as readonly string[]).includes(model as string)) {
      throw new Error(`"${label}" has an invalid price type.`);
    }
    const price = a.price;
    if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0)) {
      throw new Error(`"${label}" has an invalid price.`);
    }
    return {
      id,
      label,
      enabled: a.enabled !== false,
      currency: typeof a.currency === "string" && a.currency.trim() ? a.currency.trim() : "USD",
      price: price === null ? null : (price as number),
      pricing_model: model as (typeof PRICING_MODELS)[number],
      operational: readOperational(a.operational, label),
    };
  });
}

/**
 * Owner-only add-ons write for the /ops Extras screen.
 *
 * One request does what the legacy rates page did in two client calls (the
 * audit R-6 lesson: a second-phase failure left price and rules disagreeing
 * with no honest report). Both writes still happen sequentially; a failure in
 * the second is reported EXPLICITLY as partial, never as success.
 *
 * The R-2 wipe guard is preserved: a payload that would delete every existing
 * add-on is refused unless every doomed id is explicitly listed.
 *
 * Batch 2: the screen now edits the FULL operational rule set (villas,
 * category, preparation time + notice deadline, enforcement, description,
 * display order, recommended, percentage pricing, applies-to, event pricing
 * unit and quantity bounds), validated strictly here — the shared parser is
 * lenient by design for reads and would silently drop bad input on a write.
 * Fields the screen does not send still round-trip from the stored blob.
 */
export async function PUT(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let addons: IncomingAddon[];
  let explicitDeleteIds: Set<string>;
  try {
    const body = (await request.json()) as { addons?: unknown; deleted_ids?: unknown };
    addons = readAddons(body.addons);
    explicitDeleteIds = new Set(
      Array.isArray(body.deleted_ids)
        ? body.deleted_ids.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request." },
      { status: 400 },
    );
  }

  const [existingResult, operationalResult] = await Promise.all([
    supabaseAdmin.from("addons").select("id"),
    supabaseAdmin.from("settings").select("value").eq("key", ADDON_OPERATIONAL_SETTINGS_KEY).maybeSingle(),
  ]);
  if (existingResult.error) {
    console.error(`${LOG_TAG} existing query failed:`, existingResult.error.message);
    return NextResponse.json({ error: "Could not load the current add-ons." }, { status: 503 });
  }
  if (operationalResult.error) {
    console.error(`${LOG_TAG} operational read failed:`, operationalResult.error.message);
    return NextResponse.json({ error: "Could not load the current add-on rules." }, { status: 503 });
  }

  const existingIds = (existingResult.data ?? []).map((r) => r.id as string);
  const incomingIds = new Set(addons.map((a) => a.id));
  const idsToDelete = existingIds.filter((id) => !incomingIds.has(id));

  // Audit R-2 guard — same rule as the legacy admin route.
  const wipesEverything = idsToDelete.length > 0 && idsToDelete.length === existingIds.length;
  if (wipesEverything && !idsToDelete.every((id) => explicitDeleteIds.has(id))) {
    console.error(`${LOG_TAG} refused implicit deletion of all ${idsToDelete.length} add-ons`);
    return NextResponse.json(
      { error: "Refusing to delete every add-on at once. Reload the page and try again." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  if (addons.length > 0) {
    const { error } = await supabaseAdmin.from("addons").upsert(
      addons.map((a) => ({
        id: a.id,
        label: a.label,
        enabled: a.enabled,
        currency: a.currency,
        price: a.price,
        pricing_model: a.pricing_model,
        updated_at: now,
      })),
      { onConflict: "id" },
    );
    if (error) {
      console.error(`${LOG_TAG} upsert failed:`, error.message);
      return NextResponse.json({ error: "Could not save the add-ons." }, { status: 503 });
    }
  }

  if (idsToDelete.length > 0) {
    const { error } = await supabaseAdmin.from("addons").delete().in("id", idsToDelete);
    if (error) {
      console.error(`${LOG_TAG} delete failed:`, error.message);
      return NextResponse.json(
        { error: "Prices were saved, but removing the deleted add-ons failed. Reload to see where things stand.", code: "partial" },
        { status: 503 },
      );
    }
  }

  // Batch 2: the Extras screen now owns these keys outright. They are dropped
  // from the stored blob before merging so CLEARING one (e.g. deleting a
  // description) actually clears it instead of the old value resurfacing.
  // Keys the screen does not send still round-trip from storage.
  const OWNED_KEYS = [
    "requires_approval", "recommended", "quantity_enabled", "applies_to",
    "preparation_time_hours", "cutoff_type", "enforcement_mode", "category",
    "description", "unit_label", "display_order", "pricing_type",
    "percentage_value", "pricing_unit", "min_quantity", "max_quantity",
    "applicable_villas", "applicable_event_types",
  ] as const;

  const storedOperational = parseAddonOperationalSetting(operationalResult.data?.value);
  const nextOperational = addons.map((a) => {
    const stored = { ...(storedOperational[a.id] ?? {}) } as Record<string, unknown>;
    for (const key of OWNED_KEYS) delete stored[key];
    return { id: a.id, ...stored, ...a.operational };
  }) as Array<{ id: string } & AddonOperationalFields>;

  const { error: operationalWriteError } = await supabaseAdmin
    .from("settings")
    .upsert(
      { key: ADDON_OPERATIONAL_SETTINGS_KEY, value: stringifyAddonOperationalSetting(nextOperational) },
      { onConflict: "key" },
    );
  if (operationalWriteError) {
    console.error(`${LOG_TAG} operational write failed:`, operationalWriteError.message);
    return NextResponse.json(
      {
        error: "Prices were saved, but the approval rules were NOT. Save again — until then the live site may apply old rules to new prices.",
        code: "partial",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, saved_by: auth.staff.full_name });
}
