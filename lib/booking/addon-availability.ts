import {
  formatPreparationTime,
  getAddonEnforcementMode,
  type AddonEnforcementMode,
} from "../addon-operations.ts";
import { HEATED_POOL_CARRYOVER_GUEST_NOTE, isHeatedPoolAddon } from "../heated-pool-carryover.ts";

/**
 * Remediation 5.3 — /book's add-on availability rule, extracted verbatim into
 * a pure function so effects can consume it with honest dependencies
 * (checkIn + heatedPoolCarryover are explicit inputs instead of closures).
 */

export type AddonAvailabilityInput = {
  id: string;
  label?: string | null;
  enforcement_mode?: AddonEnforcementMode | null;
  preparation_time_hours?: number | null;
};

export type AddonAvailabilityContext = {
  /** Selected check-in (YYYY-MM-DD) or "" when not chosen yet. */
  checkIn: string;
  heatedPoolCarryover: boolean;
  /** Injectable clock for tests; defaults to Date.now(). */
  now?: number;
};

export type AddonAvailabilityResult = {
  available: boolean;
  selectable: boolean;
  warning: string;
  mode: AddonEnforcementMode;
  carryoverNote?: string;
};

/** Local-time date from YYYY-MM-DD (matches the page's parseLocalISO). */
function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function computeAddonAvailability(
  addon: AddonAvailabilityInput,
  ctx: AddonAvailabilityContext,
): AddonAvailabilityResult {
  const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
  const preparationHours = addon.preparation_time_hours ?? null;
  if (enforcementMode === "none" || !preparationHours || preparationHours <= 0) {
    return { available: true, selectable: true, warning: "", mode: enforcementMode };
  }

  if (!ctx.checkIn) {
    return { available: true, selectable: true, warning: "", mode: enforcementMode };
  }

  const now = ctx.now ?? Date.now();
  const hoursUntilCheckIn = (parseLocalISO(ctx.checkIn).getTime() - now) / 3_600_000;
  if (
    ctx.heatedPoolCarryover &&
    isHeatedPoolAddon(addon) &&
    enforcementMode === "strict" &&
    typeof preparationHours === "number" &&
    Number.isFinite(preparationHours) &&
    preparationHours > 0 &&
    hoursUntilCheckIn < preparationHours
  ) {
    return {
      available: true,
      selectable: true,
      warning: "",
      mode: enforcementMode,
      carryoverNote: HEATED_POOL_CARRYOVER_GUEST_NOTE,
    };
  }

  const available = hoursUntilCheckIn >= preparationHours;
  if (available) {
    return { available: true, selectable: true, warning: "", mode: enforcementMode };
  }

  if (enforcementMode === "strict") {
    return {
      available: false,
      selectable: false,
      warning: `Needs ${formatPreparationTime(preparationHours)} advance notice and is not available for your selected check-in.`,
      mode: enforcementMode,
    };
  }

  return {
    available: false,
    selectable: true,
    warning: `Short notice: subject to confirmation for your selected check-in.`,
    mode: enforcementMode,
  };
}
