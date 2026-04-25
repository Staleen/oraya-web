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
    invalid_date_range: boolean;
    pricing_config_missing: boolean;
    has_unpriced_nights: boolean;
    violates_minimum_stay: boolean;
  };
  would_block_reasons: Array<
    "invalid_date_range" | "pricing_config_missing" | "unpriced_nights" | "minimum_stay_violation"
  >;
};

export type PricingSnapshot = {
  subtotal: number;
  nights: PricingAuditResult["nights"];
  warnings: string[];
  violations: PricingAuditResult["violations"];
  would_block_reasons: PricingAuditResult["would_block_reasons"];
  consistency: {
    ok: boolean;
    has_unpriced_nights: boolean;
    violates_minimum_stay: boolean;
    invalid_date_range: boolean;
    pricing_config_missing: boolean;
    client_subtotal?: number;
    server_subtotal?: number;
    subtotal_mismatch?: boolean;
  };
  calculated_at: string;
  source: "server-audit";
};

export type PricingAuditInput = {
  config: VillaPricingConfig | null | undefined;
  check_in: string;
  check_out: string;
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
      invalid_date_range: false,
      pricing_config_missing: false,
      has_unpriced_nights: false,
      violates_minimum_stay: false,
    },
    would_block_reasons: [],
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
        invalid_date_range: true,
        pricing_config_missing: false,
        has_unpriced_nights: false,
        violates_minimum_stay: false,
      },
      would_block_reasons: ["invalid_date_range"],
    });
  }

  if (!input.config) {
    return emptyAuditResult({
      warnings: ["Missing pricing configuration for audit."],
      violations: {
        invalid_date_range: false,
        pricing_config_missing: true,
        has_unpriced_nights: false,
        violates_minimum_stay: false,
      },
      would_block_reasons: ["pricing_config_missing"],
    });
  }

  const result = calculateStayPricing(input.config, {
    check_in: input.check_in,
    check_out: input.check_out,
  });

  const hasUnpricedNights = result.nightly.some((night) => night.price === null || night.source === "unpriced");
  const violatesMinimumStay = result.warnings.some((warning) => warning.kind === "minimum_stay");
  const wouldBlockReasons: PricingAuditResult["would_block_reasons"] = [];

  if (hasUnpricedNights) {
    wouldBlockReasons.push("unpriced_nights");
  }
  if (violatesMinimumStay) {
    wouldBlockReasons.push("minimum_stay_violation");
  }

  return {
    ok: wouldBlockReasons.length === 0,
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
      invalid_date_range: false,
      pricing_config_missing: false,
      has_unpriced_nights: hasUnpricedNights,
      violates_minimum_stay: violatesMinimumStay,
    },
    would_block_reasons: wouldBlockReasons,
  };
}

export function buildPricingSnapshot(
  audit: PricingAuditResult,
  options?: { clientSubtotal?: number | null | undefined }
): PricingSnapshot {
  const clientSubtotal =
    typeof options?.clientSubtotal === "number" && Number.isFinite(options.clientSubtotal)
      ? options.clientSubtotal
      : undefined;

  return {
    subtotal: audit.subtotal,
    nights: audit.nights,
    warnings: audit.warnings,
    violations: audit.violations,
    would_block_reasons: audit.would_block_reasons,
    consistency: {
      ok: audit.ok,
      has_unpriced_nights: audit.violations.has_unpriced_nights,
      violates_minimum_stay: audit.violations.violates_minimum_stay,
      invalid_date_range: audit.violations.invalid_date_range,
      pricing_config_missing: audit.violations.pricing_config_missing,
      ...(clientSubtotal !== undefined
        ? {
            client_subtotal: clientSubtotal,
            server_subtotal: audit.subtotal,
            subtotal_mismatch: clientSubtotal !== audit.subtotal,
          }
        : {}),
    },
    calculated_at: new Date().toISOString(),
    source: "server-audit",
  };
}
