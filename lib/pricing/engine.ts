import type {
  VillaPricingConfig,
  PricingInput,
  PricingResult,
  NightlyBreakdown,
  PricingWarning,
} from "./types";

function parseDateOnlyUTC(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

function formatDateOnlyUTC(d: Date): string {
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 5 || day === 6;
}

function resolveNightlyPrice(config: VillaPricingConfig, isWeekend: boolean): number | null {
  if (isWeekend) {
    if (typeof config.weekend_price === "number" && config.weekend_price > 0) {
      return config.weekend_price;
    }
  } else {
    if (typeof config.weekday_price === "number" && config.weekday_price > 0) {
      return config.weekday_price;
    }
  }
  if (typeof config.base_price === "number" && config.base_price > 0) {
    return config.base_price;
  }
  return null;
}

export function calculateStayPricing(
  config: VillaPricingConfig,
  input: PricingInput,
): PricingResult {
  const nightly: NightlyBreakdown[]   = [];
  const warnings: PricingWarning[]    = [];

  const start = parseDateOnlyUTC(input.check_in);
  const end   = parseDateOnlyUTC(input.check_out);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return { nights: 0, subtotal: null, nightly, warnings };
  }

  const cursor = new Date(start.getTime());
  while (cursor.getTime() < end.getTime()) {
    const is_weekend = isWeekendUTC(cursor);
    const price      = resolveNightlyPrice(config, is_weekend);
    nightly.push({ date: formatDateOnlyUTC(cursor), is_weekend, price });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const nights         = nightly.length;
  const pricedNights   = nightly.filter((n) => n.price !== null);
  const hasAnyPrice    = pricedNights.length > 0;
  const subtotal       = hasAnyPrice
    ? pricedNights.reduce((sum, n) => sum + (n.price ?? 0), 0)
    : null;

  if (hasAnyPrice && pricedNights.length < nights) {
    warnings.push({ kind: "unpriced_nights", count: nights - pricedNights.length });
  }

  if (
    typeof config.minimum_stay === "number" &&
    config.minimum_stay > 0 &&
    nights > 0 &&
    nights < config.minimum_stay
  ) {
    warnings.push({ kind: "minimum_stay", required: config.minimum_stay, actual: nights });
  }

  return { nights, subtotal, nightly, warnings };
}
