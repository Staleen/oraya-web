import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  parseAddonOperationalSetting,
  stringifyAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";

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
  requires_approval: boolean;
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
      requires_approval: a.requires_approval === true,
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
 * add-on is refused unless every doomed id is explicitly listed. Operational
 * fields the Extras screen does not edit (categories, villas, preparation
 * times, event pricing…) are round-tripped from the stored blob untouched —
 * only `requires_approval` is overlaid.
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

  // Overlay ONLY requires_approval onto the stored operational fields; drop
  // rows for deleted add-ons; everything else round-trips untouched.
  const storedOperational = parseAddonOperationalSetting(operationalResult.data?.value);
  const nextOperational = addons.map((a) => ({
    id: a.id,
    ...(storedOperational[a.id] ?? {}),
    requires_approval: a.requires_approval,
  })) as Array<{ id: string } & AddonOperationalFields>;

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
