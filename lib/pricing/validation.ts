import type { VillaBasePricing } from "@/lib/admin-pricing";

export type ValidationLevel = "error" | "warning";

export type ValidationField =
  | "base_price"
  | "weekday_price"
  | "weekend_price"
  | "minimum_stay"
  | "start_date"
  | "end_date";

export interface ValidationIssue {
  level:      ValidationLevel;
  scope:      "villa" | "season";
  villa:      string;
  season_id?: string;
  field?:     ValidationField;
  message:    string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MSG = {
  baseRecommended:  "Base price is recommended — without it, nights with no other rate are unpriced.",
  notFinite:        "Invalid number.",
  negative:         "Price cannot be negative.",
  zeroIgnored:      "Zero value will be ignored and treated as not set.",
  minStayLT1:       "Minimum stay must be at least 1 night.",
  startRequired:    "Start date is required.",
  endRequired:      "End date is required.",
  startInvalid:     "Start date is invalid.",
  endInvalid:       "End date is invalid.",
  endBeforeStart:   "End date must be on or after start date.",
  noPricingSet:     "No pricing set — this season falls back to villa rates.",
  overlaps:         "Seasonal ranges cannot overlap.",
} as const;

function isValidDateOnly(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function priceIssues(
  value:    number | null,
  field:    ValidationField,
  scope:    "villa" | "season",
  villa:    string,
  seasonId: string | undefined,
): ValidationIssue[] {
  if (value === null) return [];
  if (!Number.isFinite(value)) {
    return [{ level: "error", scope, villa, season_id: seasonId, field, message: MSG.notFinite }];
  }
  if (value < 0) {
    return [{ level: "error", scope, villa, season_id: seasonId, field, message: MSG.negative }];
  }
  if (value === 0) {
    return [{ level: "warning", scope, villa, season_id: seasonId, field, message: MSG.zeroIgnored }];
  }
  return [];
}

function minStayIssues(
  value:    number | null,
  scope:    "villa" | "season",
  villa:    string,
  seasonId: string | undefined,
): ValidationIssue[] {
  if (value === null) return [];
  if (!Number.isFinite(value)) {
    return [{ level: "error", scope, villa, season_id: seasonId, field: "minimum_stay", message: MSG.notFinite }];
  }
  if (value < 1) {
    return [{ level: "error", scope, villa, season_id: seasonId, field: "minimum_stay", message: MSG.minStayLT1 }];
  }
  return [];
}

export function validatePricing(config: VillaBasePricing): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const villa = config.villa;

  // ── Villa-level checks ─────────────────────────────────────────────────
  if (config.base_price === null) {
    issues.push({
      level:   "warning",
      scope:   "villa",
      villa,
      field:   "base_price",
      message: MSG.baseRecommended,
    });
  }
  issues.push(...priceIssues(config.base_price,    "base_price",    "villa", villa, undefined));
  issues.push(...priceIssues(config.weekday_price, "weekday_price", "villa", villa, undefined));
  issues.push(...priceIssues(config.weekend_price, "weekend_price", "villa", villa, undefined));
  issues.push(...minStayIssues(config.minimum_stay, "villa", villa, undefined));

  // ── Per-season checks ──────────────────────────────────────────────────
  const seasons = config.seasonal_overrides ?? [];
  for (const s of seasons) {
    const startOk = !!s.start_date && isValidDateOnly(s.start_date);
    const endOk   = !!s.end_date   && isValidDateOnly(s.end_date);

    if (!s.start_date) {
      issues.push({ level: "error", scope: "season", villa, season_id: s.id, field: "start_date", message: MSG.startRequired });
    } else if (!isValidDateOnly(s.start_date)) {
      issues.push({ level: "error", scope: "season", villa, season_id: s.id, field: "start_date", message: MSG.startInvalid });
    }
    if (!s.end_date) {
      issues.push({ level: "error", scope: "season", villa, season_id: s.id, field: "end_date", message: MSG.endRequired });
    } else if (!isValidDateOnly(s.end_date)) {
      issues.push({ level: "error", scope: "season", villa, season_id: s.id, field: "end_date", message: MSG.endInvalid });
    }
    if (startOk && endOk && s.start_date > s.end_date) {
      issues.push({ level: "error", scope: "season", villa, season_id: s.id, field: "end_date", message: MSG.endBeforeStart });
    }

    issues.push(...priceIssues(s.base_price,    "base_price",    "season", villa, s.id));
    issues.push(...priceIssues(s.weekday_price, "weekday_price", "season", villa, s.id));
    issues.push(...priceIssues(s.weekend_price, "weekend_price", "season", villa, s.id));
    issues.push(...minStayIssues(s.minimum_stay, "season", villa, s.id));

    const allRatesNull = s.base_price === null && s.weekday_price === null && s.weekend_price === null;
    const datesValid   = startOk && endOk && s.start_date <= s.end_date;
    if (allRatesNull && datesValid) {
      issues.push({
        level:     "warning",
        scope:     "season",
        villa,
        season_id: s.id,
        message:   MSG.noPricingSet,
      });
    }
  }

  // ── Cross-season overlap (O(n²); n is small) ───────────────────────────
  const ranged = seasons.filter((s) =>
    !!s.start_date && !!s.end_date &&
    isValidDateOnly(s.start_date) && isValidDateOnly(s.end_date) &&
    s.start_date <= s.end_date,
  );
  for (let i = 0; i < ranged.length; i++) {
    const a = ranged[i];
    for (let j = i + 1; j < ranged.length; j++) {
      const b = ranged[j];
      // Inclusive ranges overlap iff a.start <= b.end AND b.start <= a.end.
      if (a.start_date <= b.end_date && b.start_date <= a.end_date) {
        issues.push({ level: "error", scope: "season", villa, season_id: a.id, message: MSG.overlaps });
        issues.push({ level: "error", scope: "season", villa, season_id: b.id, message: MSG.overlaps });
      }
    }
  }

  return issues;
}
