import type {
  VillaPricingConfig,
  PricingInput,
  PricingResult,
  NightlyBreakdown,
  PricingWarning,
  SeasonalOverride,
  NightSource,
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

function findSeasonalOverride(
  overrides: SeasonalOverride[] | undefined,
  dateStr: string,
): SeasonalOverride | null {
  if (!overrides || overrides.length === 0) return null;
  for (const ov of overrides) {
    if (
      ov.start_date &&
      ov.end_date &&
      ov.start_date <= dateStr &&
      dateStr <= ov.end_date
    ) {
      return ov;
    }
  }
  return null;
}

function resolveNightlyPrice(
  config: VillaPricingConfig,
  dateStr: string,
  isWeekend: boolean,
): { price: number | null; source: NightSource } {
  // Priority 2: seasonal override (priority 1, manual override, is future work)
  const seasonal = findSeasonalOverride(config.seasonal_overrides, dateStr);
  if (seasonal) {
    if (isWeekend && typeof seasonal.weekend_price === "number" && seasonal.weekend_price > 0) {
      return { price: seasonal.weekend_price, source: "seasonal" };
    }
    if (!isWeekend && typeof seasonal.weekday_price === "number" && seasonal.weekday_price > 0) {
      return { price: seasonal.weekday_price, source: "seasonal" };
    }
    if (typeof seasonal.base_price === "number" && seasonal.base_price > 0) {
      return { price: seasonal.base_price, source: "seasonal" };
    }
    // Seasonal matched but declared no applicable rate — fall through to villa-level.
  }

  // Priority 3: villa weekday/weekend override.
  if (isWeekend) {
    if (typeof config.weekend_price === "number" && config.weekend_price > 0) {
      return { price: config.weekend_price, source: "weekend" };
    }
  } else {
    if (typeof config.weekday_price === "number" && config.weekday_price > 0) {
      return { price: config.weekday_price, source: "weekday" };
    }
  }

  // Priority 4: villa base price.
  if (typeof config.base_price === "number" && config.base_price > 0) {
    return { price: config.base_price, source: "base" };
  }
  return { price: null, source: "unpriced" };
}

export function calculateStayPricing(
  config: VillaPricingConfig,
  input: PricingInput,
): PricingResult {
  const nightly: NightlyBreakdown[] = [];
  const warnings: PricingWarning[]  = [];

  const start = parseDateOnlyUTC(input.check_in);
  const end   = parseDateOnlyUTC(input.check_out);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return { nights: 0, subtotal: null, nightly, warnings };
  }

  const cursor = new Date(start.getTime());
  while (cursor.getTime() < end.getTime()) {
    const dateStr           = formatDateOnlyUTC(cursor);
    const is_weekend        = isWeekendUTC(cursor);
    const { price, source } = resolveNightlyPrice(config, dateStr, is_weekend);
    nightly.push({ date: dateStr, is_weekend, price, source });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const nights       = nightly.length;
  const pricedNights = nightly.filter((n) => n.price !== null);
  const hasAnyPrice  = pricedNights.length > 0;
  const subtotal     = hasAnyPrice
    ? pricedNights.reduce((sum, n) => sum + (n.price ?? 0), 0)
    : null;

  if (hasAnyPrice && pricedNights.length < nights) {
    warnings.push({ kind: "unpriced_nights", count: nights - pricedNights.length });
  }

  // Effective minimum stay = max of (villa-level, any seasonal minimum_stay that
  // covers at least one night in the stay). Seasonal overrides can lengthen the
  // required minimum but never shorten it below the villa-level baseline.
  let effectiveMinStay: number | null =
    typeof config.minimum_stay === "number" && config.minimum_stay > 0
      ? config.minimum_stay
      : null;
  if (config.seasonal_overrides && config.seasonal_overrides.length > 0) {
    for (const n of nightly) {
      const ov = findSeasonalOverride(config.seasonal_overrides, n.date);
      if (ov && typeof ov.minimum_stay === "number" && ov.minimum_stay > 0) {
        effectiveMinStay = effectiveMinStay === null
          ? ov.minimum_stay
          : Math.max(effectiveMinStay, ov.minimum_stay);
      }
    }
  }
  if (effectiveMinStay !== null && nights > 0 && nights < effectiveMinStay) {
    warnings.push({ kind: "minimum_stay", required: effectiveMinStay, actual: nights });
  }

  return { nights, subtotal, nightly, warnings };
}
