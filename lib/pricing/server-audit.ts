import { calculateStayPricing } from "./engine";
import type { NightSource, VillaPricingConfig } from "./types";

export type PricingAuditResult = {
  ok: boolean;
  subtotal: number;
  nights: Array<{
    date: string;
    price: number | null;
    source: NightSource;
  }>;
  warnings: string[];
  violations: {
    has_unpriced_nights: boolean;
    violates_minimum_stay: boolean;
    invalid_date_range: boolean;
  };
};

export type PricingAuditInput = {
  config: VillaPricingConfig | null | undefined;
  check_in: string;
  check_out: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
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

function emptyAuditResult(overrides?: Partial<PricingAuditResult>): PricingAuditResult {
  return {
    ok: false,
    subtotal: 0,
    nights: [],
    warnings: [],
    violations: {
      has_unpriced_nights: false,
      violates_minimum_stay: false,
      invalid_date_range: false,
    },
    ...overrides,
  };
}

export function runPricingAudit(input: PricingAuditInput): PricingAuditResult {
  const invalidDateRange =
    !isValidDateOnly(input.check_in) ||
    !isValidDateOnly(input.check_out) ||
    input.check_out <= input.check_in;

  if (invalidDateRange) {
    return emptyAuditResult({
      warnings: ["Invalid stay dates for pricing audit."],
      violations: {
        has_unpriced_nights: false,
        violates_minimum_stay: false,
        invalid_date_range: true,
      },
    });
  }

  if (!input.config) {
    return emptyAuditResult({
      warnings: ["Missing pricing configuration for audit."],
      violations: {
        has_unpriced_nights: false,
        violates_minimum_stay: false,
        invalid_date_range: false,
      },
    });
  }

  const result = calculateStayPricing(input.config, {
    check_in: input.check_in,
    check_out: input.check_out,
  });

  return {
    ok: true,
    subtotal: result.subtotal ?? 0,
    nights: result.nightly.map((night) => ({
      date: night.date,
      price: night.price,
      source: night.source,
    })),
    warnings: result.warnings.map((warning) => {
      if (warning.kind === "minimum_stay") {
        return `Minimum stay warning: requires ${warning.required}, got ${warning.actual}.`;
      }
      return `Unpriced nights warning: ${warning.count}.`;
    }),
    violations: {
      has_unpriced_nights: result.nightly.some((night) => night.price === null || night.source === "unpriced"),
      violates_minimum_stay: result.warnings.some((warning) => warning.kind === "minimum_stay"),
      invalid_date_range: false,
    },
  };
}
