import { KNOWN_VILLAS } from "@/lib/calendar/villas";

export const VILLA_BASE_PRICING_KEY = "villa_base_pricing";
const DEFAULT_BASE_PRICES: Record<string, number> = {
  "Villa Mechmech": 400,
  "Villa Byblos": 350,
};

export interface SeasonalOverride {
  id: string;
  starts_on: string;
  ends_on: string;
  nightly_rate: number | null;
  weekend_rate: number | null;
  weekday_rate: number | null;
  minimum_stay: number | null;
}

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

export function parseVillaPricingSetting(raw: string | null | undefined): VillaBasePricing[] {
  const defaults = getDefaultVillaPricing();
  if (!raw?.trim()) return defaults;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;

    const byVilla = new Map<string, VillaBasePricing>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const value = item as Partial<VillaBasePricing>;
      const villa = typeof value.villa === "string" ? value.villa : "";
      if (!villa) continue;
      byVilla.set(villa, {
        villa,
        base_price: typeof value.base_price === "number" ? value.base_price : null,
        weekend_price: typeof value.weekend_price === "number" ? value.weekend_price : null,
        weekday_price: typeof value.weekday_price === "number" ? value.weekday_price : null,
        minimum_stay: typeof value.minimum_stay === "number" ? value.minimum_stay : null,
        seasonal_overrides: Array.isArray(value.seasonal_overrides) ? value.seasonal_overrides as SeasonalOverride[] : [],
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

export function getVillaBasePrice(villa: string): number | null {
  return DEFAULT_BASE_PRICES[villa] ?? null;
}

export function formatVillaFromPrice(villa: string): string | null {
  const price = getVillaBasePrice(villa);
  if (price === null) return null;
  return `From $${price} / night`;
}

export const VILLA_FROM_PRICE_MICROLABEL = "Weekday base rate, excludes add-ons";
