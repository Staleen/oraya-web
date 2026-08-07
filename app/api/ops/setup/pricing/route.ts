import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  VILLA_BASE_PRICING_KEY,
  stringifyVillaPricingSetting,
  type VillaBasePricing,
} from "@/lib/admin-pricing";
import { KNOWN_VILLAS } from "@/lib/calendar/villas";
import { validatePricing } from "@/lib/pricing/validation";
import type { SeasonalOverride } from "@/lib/pricing/types";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function numberOrNull(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  throw new Error(`Invalid ${field}.`);
}

/**
 * STRICT input validation. The shared parseVillaPricingSetting deliberately
 * falls back to DEFAULT prices on malformed input (safe for reads) — piping a
 * write through it would let a corrupt payload silently reset live pricing.
 * Here anything unexpected throws and nothing is written.
 */
function readPricingPayload(raw: unknown): VillaBasePricing[] {
  if (!Array.isArray(raw)) throw new Error("Invalid pricing payload.");
  const byVilla = new Map<string, VillaBasePricing>();
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Error("Invalid pricing payload.");
    const v = item as Record<string, unknown>;
    const villa = typeof v.villa === "string" ? v.villa : "";
    if (!KNOWN_VILLAS.includes(villa)) throw new Error("Invalid villa in pricing payload.");
    const overridesRaw = v.seasonal_overrides ?? [];
    if (!Array.isArray(overridesRaw)) throw new Error("Invalid seasonal overrides.");
    const seasonal_overrides: SeasonalOverride[] = overridesRaw.map((o) => {
      if (!o || typeof o !== "object") throw new Error("Invalid seasonal override.");
      const s = o as Record<string, unknown>;
      const start = typeof s.start_date === "string" ? s.start_date : "";
      const end = typeof s.end_date === "string" ? s.end_date : "";
      if (!DATE_ONLY_RE.test(start) || !DATE_ONLY_RE.test(end)) {
        throw new Error("Seasonal override dates must be YYYY-MM-DD.");
      }
      return {
        id: typeof s.id === "string" && s.id ? s.id : `s_${Math.random().toString(36).slice(2, 10)}`,
        start_date: start,
        end_date: end,
        base_price: numberOrNull(s.base_price, "seasonal price"),
        weekday_price: numberOrNull(s.weekday_price, "seasonal weeknight price"),
        weekend_price: numberOrNull(s.weekend_price, "seasonal weekend price"),
        minimum_stay: numberOrNull(s.minimum_stay, "seasonal minimum nights"),
      };
    });
    byVilla.set(villa, {
      villa,
      base_price: numberOrNull(v.base_price, "base price"),
      weekday_price: numberOrNull(v.weekday_price, "weeknight price"),
      weekend_price: numberOrNull(v.weekend_price, "weekend price"),
      minimum_stay: numberOrNull(v.minimum_stay, "minimum nights"),
      seasonal_overrides,
    });
  }
  if (byVilla.size !== KNOWN_VILLAS.length) {
    throw new Error("Pricing payload must cover every villa exactly once.");
  }
  return KNOWN_VILLAS.map((villa) => byVilla.get(villa)!);
}

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup/pricing]";

/**
 * Owner-only pricing write — the same settings row the website quotes from.
 *
 * The payload round-trips through the shared parser so only well-formed
 * pricing can be stored, and the shared validator refuses error-level issues
 * before any write (same gate the legacy rates page applies client-side,
 * enforced server-side here).
 *
 * Compare-and-set: when the request carries `expected_raw` (the serialized
 * value the owner loaded), the write only applies while the row still holds
 * it — a concurrent edit surfaces as 409 instead of a silent overwrite.
 */
export async function PUT(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let body: { pricing?: unknown; expected_raw?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let pricing: VillaBasePricing[];
  try {
    pricing = readPricingPayload(body.pricing);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid pricing payload." },
      { status: 400 },
    );
  }

  const blockingIssues = pricing.flatMap((villa) =>
    validatePricing(villa)
      .filter((issue) => issue.level === "error")
      .map((issue) => `${villa.villa}: ${issue.message}`),
  );
  if (blockingIssues.length > 0) {
    return NextResponse.json(
      { error: `Fix these before saving: ${blockingIssues.join(" · ")}` },
      { status: 400 },
    );
  }

  const value = stringifyVillaPricingSetting(pricing);
  const expectedRaw = typeof body.expected_raw === "string" ? body.expected_raw : null;

  if (expectedRaw !== null) {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .update({ value })
      .eq("key", VILLA_BASE_PRICING_KEY)
      .eq("value", expectedRaw)
      .select("key");
    if (error) {
      console.error(`${LOG_TAG} guarded update failed:`, error.message);
      return NextResponse.json({ error: "Could not save pricing." }, { status: 503 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error: "Pricing changed since you loaded this page — reload to see the current prices before saving.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }
  } else {
    // First-ever save (no row yet) or a caller without the loaded snapshot.
    const { error } = await supabaseAdmin
      .from("settings")
      .upsert({ key: VILLA_BASE_PRICING_KEY, value }, { onConflict: "key" });
    if (error) {
      console.error(`${LOG_TAG} upsert failed:`, error.message);
      return NextResponse.json({ error: "Could not save pricing." }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true, pricing, pricing_raw: value, saved_by: auth.staff.full_name });
}
