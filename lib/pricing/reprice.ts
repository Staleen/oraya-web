// Relative .ts imports so node:test can load this module (repo test convention).
import { getVillaPricing, parseVillaPricingSetting } from "../admin-pricing.ts";
import {
  applyBedroomFactorToNightlyRates,
  buildUnavailableInternalPricingIntelligence,
  computeInternalPricingIntelligence,
  detectEventInquiry,
  parseBedroomCountFromMessage,
  parseRequestedServiceCount,
} from "./intelligence.ts";
import { buildPricingSnapshot, runPricingAudit, type PricingSnapshot } from "./server-audit.ts";

/**
 * Remediation 2.1 — reprice a member booking when its dates change, mirroring
 * the pricing/snapshot path `/api/bookings` POST uses (audit → bedroom factor
 * → snapshot → estimated_total with the existing addons_snapshot → internal
 * intelligence). Pure: the caller fetches the pricing settings row and passes
 * its raw value; per Question 4's default the booking is repriced rather than
 * blocking the date change.
 */

const PRICING_ERROR_MESSAGES: Record<string, string> = {
  invalid_date_range: "Invalid booking dates.",
  pricing_config_missing: "Pricing is not available for this villa yet. Please contact us.",
  unpriced_nights:
    "Pricing is not available for one or more selected nights. Please choose different dates or contact us.",
  minimum_stay_violation: "Your selected dates do not meet the minimum stay requirement.",
};

export type RepriceInput = {
  villa: string;
  check_in: string;
  check_out: string;
  message: string | null;
  sleeping_guests: number;
  addons_snapshot: Array<{ price?: number | null }> | null;
  /** Raw settings.value for VILLA_BASE_PRICING_KEY (null when the row is absent). */
  pricing_setting_value: string | null;
};

export type RepriceResult =
  | { ok: false; status: 400; error: string; reasons: string[] }
  | {
      ok: true;
      update: {
        pricing_subtotal: number;
        pricing_nights: ReturnType<typeof runPricingAudit>["nights"];
        pricing_warnings: string[];
        pricing_snapshot: PricingSnapshot;
      };
    };

export function repriceBookingForDateChange(input: RepriceInput): RepriceResult {
  const pricingConfig = input.pricing_setting_value
    ? getVillaPricing(parseVillaPricingSetting(input.pricing_setting_value), input.villa)
    : null;

  const audit = runPricingAudit({
    config: pricingConfig,
    check_in: input.check_in,
    check_out: input.check_out,
  });

  if (!audit.ok) {
    const reasons = audit.would_block_reasons;
    const error =
      reasons.length === 1
        ? PRICING_ERROR_MESSAGES[reasons[0]] ??
          "Your selected dates could not be priced. Please review your stay details or contact us."
        : "Your selected dates could not be priced. Please review your stay details or contact us.";
    return { ok: false, status: 400, error, reasons };
  }

  const bedrooms = parseBedroomCountFromMessage(input.message) ?? 3;
  const bedroomPricing = applyBedroomFactorToNightlyRates(audit.nights, bedrooms);
  const adjustedStaySubtotal = bedroomPricing.adjustedSubtotal ?? audit.subtotal;

  const snapshot = buildPricingSnapshot(audit, {});
  snapshot.full_villa_subtotal = audit.subtotal;
  snapshot.adjusted_stay_subtotal = adjustedStaySubtotal;
  snapshot.subtotal = adjustedStaySubtotal;
  snapshot.bedroom_factor = bedroomPricing.bedroomFactor;
  snapshot.bedrooms_to_be_used = bedroomPricing.bedrooms;
  snapshot.nightly_breakdown = bedroomPricing.nightlyBreakdown;

  const addonsValue = (input.addons_snapshot ?? []).reduce((sum, addon) => {
    return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
  }, 0);
  const addonsCount = input.addons_snapshot?.length ?? 0;

  let internalIntelligence = buildUnavailableInternalPricingIntelligence();
  try {
    const eventInquiry = detectEventInquiry(input.message);
    internalIntelligence = computeInternalPricingIntelligence({
      fullVillaBase: audit.subtotal,
      bedrooms,
      guests: input.sleeping_guests,
      addonsValue,
      addonsCount,
      eventInquiry,
      servicesCount: eventInquiry ? parseRequestedServiceCount(input.message) : 0,
    });
  } catch {
    // keep the unavailable placeholder — intelligence is internal-only
  }

  snapshot.estimated_total = adjustedStaySubtotal + addonsValue;
  snapshot.internal_intelligence = internalIntelligence;

  return {
    ok: true,
    update: {
      pricing_subtotal: audit.subtotal,
      pricing_nights: audit.nights,
      pricing_warnings: audit.warnings,
      pricing_snapshot: snapshot,
    },
  };
}
