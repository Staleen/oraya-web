import { KNOWN_VILLAS } from "@/lib/calendar/villas";
import type { SeasonalOverride } from "@/lib/pricing/types";

export const VILLA_BASE_PRICING_KEY = "villa_base_pricing";
const ENTRY_BEDROOM_FACTOR = 0.6;
const DEFAULT_BASE_PRICES: Record<string, number> = {
  "Villa Mechmech": 400,
  "Villa Byblos": 350,
};

export type { SeasonalOverride };

export interface VillaBasePricing {
  villa: string;
  base_price: number | null;
  weekend_price: number | null;
  weekday_price: number | null;
  minimum_stay: number | null;
  seasonal_overrides: SeasonalOverride[];
}

export function createDefaultVillaPricing(villa: string): VillaBasePricing {
  return {
    villa,
    base_price: DEFAULT_BASE_PRICES[villa] ?? null,
    weekend_price: null,
    weekday_price: null,
    minimum_stay: null,
    seasonal_overrides: [],
  };
}

export function getDefaultVillaPricing(): VillaBasePricing[] {
  return KNOWN_VILLAS.map((villa) => createDefaultVillaPricing(villa));
}

function parseSeasonalOverrides(raw: unknown): SeasonalOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: SeasonalOverride[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const start = typeof v.start_date === "string" ? v.start_date : (typeof v.starts_on === "string" ? v.starts_on : "");
    const end   = typeof v.end_date   === "string" ? v.end_date   : (typeof v.ends_on   === "string" ? v.ends_on   : "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    out.push({
      id:            typeof v.id === "string" && v.id ? v.id : `s_${Math.random().toString(36).slice(2, 10)}`,
      start_date:    start,
      end_date:      end,
      base_price:    typeof v.base_price    === "number" ? v.base_price    : (typeof (v as { nightly_rate?: unknown }).nightly_rate === "number" ? (v as { nightly_rate: number }).nightly_rate : null),
      weekday_price: typeof v.weekday_price === "number" ? v.weekday_price : (typeof (v as { weekday_rate?: unknown }).weekday_rate === "number" ? (v as { weekday_rate: number }).weekday_rate : null),
      weekend_price: typeof v.weekend_price === "number" ? v.weekend_price : (typeof (v as { weekend_rate?: unknown }).weekend_rate === "number" ? (v as { weekend_rate: number }).weekend_rate : null),
      minimum_stay:  typeof v.minimum_stay  === "number" ? v.minimum_stay  : null,
    });
  }
  return out;
}

export function parseVillaPricingSetting(raw: string | null | undefined): VillaBasePricing[] {
  const defaults = getDefaultVillaPricing();
  if (!raw?.trim()) return defaults;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;

    const byVilla = new Map<string, VillaBasePricing>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const value = item as Partial<VillaBasePricing> & { seasonal_overrides?: unknown };
      const villa = typeof value.villa === "string" ? value.villa : "";
      if (!villa) continue;
      byVilla.set(villa, {
        villa,
        base_price: typeof value.base_price === "number" ? value.base_price : null,
        weekend_price: typeof value.weekend_price === "number" ? value.weekend_price : null,
        weekday_price: typeof value.weekday_price === "number" ? value.weekday_price : null,
        minimum_stay: typeof value.minimum_stay === "number" ? value.minimum_stay : null,
        seasonal_overrides: parseSeasonalOverrides(value.seasonal_overrides),
      });
    }

    return defaults.map((item) => byVilla.get(item.villa) ?? item);
  } catch {
    return defaults;
  }
}

export function stringifyVillaPricingSetting(pricing: VillaBasePricing[]) {
  return JSON.stringify(pricing);
}

export function getVillaPricing(pricing: VillaBasePricing[] | null | undefined, villa: string): VillaBasePricing {
  return pricing?.find((item) => item.villa === villa) ?? createDefaultVillaPricing(villa);
}

export function getVillaBasePrice(villa: string, pricing?: VillaBasePricing[] | null): number | null {
  const item = getVillaPricing(pricing, villa);
  return item.weekday_price ?? item.base_price ?? DEFAULT_BASE_PRICES[villa] ?? null;
}

export function getVillaEntryPrice(villa: string, pricing?: VillaBasePricing[] | null): number | null {
  const fullVillaWeekdayRate = getVillaBasePrice(villa, pricing);
  if (fullVillaWeekdayRate === null) return null;
  return Math.round(fullVillaWeekdayRate * ENTRY_BEDROOM_FACTOR);
}

export function formatVillaFromPrice(villa: string, pricing?: VillaBasePricing[] | null): string | null {
  const price = getVillaEntryPrice(villa, pricing);
  if (price === null) return null;
  return `From $${price} / night`;
}

export const VILLA_FROM_PRICE_MICROLABEL = "Based on 1-bedroom weekday stay. Seasonal rates may apply.";
