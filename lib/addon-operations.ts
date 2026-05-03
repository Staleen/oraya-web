export const ADDON_OPERATIONAL_SETTINGS_KEY = "addon_operational_settings";

export type AddonCutoffType = "before_checkin" | "before_booking";
export type AddonCategory = string;
export type PreparationUnit = "hours" | "days";
export type AddonEnforcementMode = "strict" | "soft" | "none";
export type AddonTimingType = "early_checkin" | "late_checkout";
export type AddonPricingType = "fixed" | "percentage";
export type AddonAppliesTo = "stay" | "event" | "both";
export type AddonEventPricingUnit = "fixed" | "per_guest" | "per_unit" | "per_hour" | "percentage";

export interface AddonOperationalFields {
  preparation_time_hours?: number | null;
  cutoff_type?: AddonCutoffType | null;
  requires_approval?: boolean;
  category?: AddonCategory | null;
  enforcement_mode?: AddonEnforcementMode | null;
  applicable_villas?: string[];
  description?: string;
  display_order?: number | null;
  recommended?: boolean;
  /** Phase 12E: pricing flexibility metadata — fixed (default) or percentage of stay. No calculation applied yet. */
  pricing_type?: AddonPricingType;
  /** Phase 12E: percentage value (0–100) used when pricing_type is "percentage". Stored as metadata only. */
  percentage_value?: number | null;
  applies_to?: AddonAppliesTo;
  applicable_event_types?: string[];
  quantity_enabled?: boolean;
  unit_label?: string | null;
  pricing_unit?: AddonEventPricingUnit | null;
  min_quantity?: number | null;
  max_quantity?: number | null;
}

export interface AddonOperationalSettingRow extends AddonOperationalFields {
  id: string;
}

const VALID_CUTOFF_TYPES = new Set<AddonCutoffType>(["before_checkin", "before_booking"]);
const VALID_ENFORCEMENT_MODES = new Set<AddonEnforcementMode>(["strict", "soft", "none"]);
const VALID_APPLIES_TO = new Set<AddonAppliesTo>(["stay", "event", "both"]);
const VALID_EVENT_PRICING_UNITS = new Set<AddonEventPricingUnit>(["fixed", "per_guest", "per_unit", "per_hour", "percentage"]);

export const ADDON_CATEGORY_LABELS: Record<string, string> = {
  comfort: "Comfort",
  experience: "Experience",
  logistics: "Logistics",
  service: "Service",
  services: "Services",
  essentials: "Essentials",
};

export const ADDON_CUTOFF_LABELS: Record<AddonCutoffType, string> = {
  before_checkin: "Before check-in",
  before_booking: "Before booking",
};

export const ADDON_ENFORCEMENT_LABELS: Record<AddonEnforcementMode, string> = {
  strict: "Strict",
  soft: "Soft",
  none: "None",
};

export const ADDON_APPLIES_TO_LABELS: Record<AddonAppliesTo, string> = {
  stay: "Stay",
  event: "Event",
  both: "Both",
};

export function getAddonEnforcementMode(
  mode: AddonEnforcementMode | null | undefined
): AddonEnforcementMode {
  return mode ?? "soft";
}

export function getAddonAppliesTo(
  appliesTo: AddonAppliesTo | null | undefined
): AddonAppliesTo {
  return appliesTo ?? "stay";
}

export function derivePreparationUnit(hours: number | null | undefined): PreparationUnit {
  return typeof hours === "number" && Number.isFinite(hours) && hours >= 24 && hours % 24 === 0
    ? "days"
    : "hours";
}

export function getPreparationAmount(
  hours: number | null | undefined,
  unit: PreparationUnit,
): number | null {
  if (typeof hours !== "number" || !Number.isFinite(hours)) return null;
  return unit === "days" ? hours / 24 : hours;
}

export function normalizePreparationTime(
  amount: number | null | undefined,
  unit: PreparationUnit,
): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return unit === "days" ? amount * 24 : amount;
}

export function formatPreparationTime(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function normalizeAddonTimingKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getAddonTimingType(addon: { id?: string | null; label?: string | null }): AddonTimingType | null {
  const idKey = normalizeAddonTimingKey(addon.id);
  const labelKey = normalizeAddonTimingKey(addon.label);
  const combined = `${idKey} ${labelKey}`;

  if (combined.includes("earlycheckin") || combined.includes("earlycheckin")) {
    return "early_checkin";
  }
  if (combined.includes("latecheckout")) {
    return "late_checkout";
  }
  return null;
}

function parseOperationalFields(value: unknown): AddonOperationalFields {
  if (!value || typeof value !== "object") return {};
  const item = value as Record<string, unknown>;
  const preparationTimeHours =
    typeof item.preparation_time_hours === "number" && Number.isFinite(item.preparation_time_hours)
      ? item.preparation_time_hours
      : null;
  const cutoffType =
    typeof item.cutoff_type === "string" && VALID_CUTOFF_TYPES.has(item.cutoff_type as AddonCutoffType)
      ? (item.cutoff_type as AddonCutoffType)
      : null;
  const requiresApproval = item.requires_approval === true ? true : false;
  const category =
    typeof item.category === "string" && item.category.trim().length > 0
      ? item.category.trim()
      : null;
  const enforcementMode =
    typeof item.enforcement_mode === "string" &&
    VALID_ENFORCEMENT_MODES.has(item.enforcement_mode as AddonEnforcementMode)
      ? (item.enforcement_mode as AddonEnforcementMode)
      : null;
  const applicableVillas = Array.isArray(item.applicable_villas)
    ? item.applicable_villas.filter((villa): villa is string => typeof villa === "string" && villa.trim().length > 0)
    : [];
  const description =
    typeof item.description === "string" && item.description.trim().length > 0
      ? item.description.trim()
      : null;
  const displayOrder =
    typeof item.display_order === "number" && Number.isFinite(item.display_order)
      ? item.display_order
      : null;
  const recommended = item.recommended === true ? true : false;
  const pricingType =
    item.pricing_type === "fixed" || item.pricing_type === "percentage"
      ? (item.pricing_type as AddonPricingType)
      : undefined;
  const percentageValue =
    typeof item.percentage_value === "number" && Number.isFinite(item.percentage_value)
      ? item.percentage_value
      : null;
  const appliesTo =
    typeof item.applies_to === "string" && VALID_APPLIES_TO.has(item.applies_to as AddonAppliesTo)
      ? (item.applies_to as AddonAppliesTo)
      : "stay";
  const applicableEventTypes = Array.isArray(item.applicable_event_types)
    ? item.applicable_event_types.filter((eventType): eventType is string => typeof eventType === "string" && eventType.trim().length > 0)
    : [];
  const quantityEnabled = item.quantity_enabled === true ? true : false;
  const unitLabel =
    typeof item.unit_label === "string" && item.unit_label.trim().length > 0
      ? item.unit_label.trim()
      : null;
  const pricingUnit =
    typeof item.pricing_unit === "string" && VALID_EVENT_PRICING_UNITS.has(item.pricing_unit as AddonEventPricingUnit)
      ? (item.pricing_unit as AddonEventPricingUnit)
      : null;
  const minQuantity =
    typeof item.min_quantity === "number" && Number.isFinite(item.min_quantity)
      ? item.min_quantity
      : null;
  const maxQuantity =
    typeof item.max_quantity === "number" && Number.isFinite(item.max_quantity)
      ? item.max_quantity
      : null;

  return {
    ...(preparationTimeHours !== null ? { preparation_time_hours: preparationTimeHours } : {}),
    ...(cutoffType ? { cutoff_type: cutoffType } : {}),
    ...(requiresApproval ? { requires_approval: true } : {}),
    ...(category ? { category } : {}),
    ...(enforcementMode ? { enforcement_mode: enforcementMode } : {}),
    ...(applicableVillas.length > 0 ? { applicable_villas: applicableVillas } : {}),
    ...(description ? { description } : {}),
    ...(displayOrder !== null ? { display_order: displayOrder } : {}),
    ...(recommended ? { recommended: true } : {}),
    ...(pricingType ? { pricing_type: pricingType } : {}),
    ...(percentageValue !== null ? { percentage_value: percentageValue } : {}),
    ...(appliesTo !== "stay" ? { applies_to: appliesTo } : {}),
    ...(applicableEventTypes.length > 0 ? { applicable_event_types: applicableEventTypes } : {}),
    ...(quantityEnabled ? { quantity_enabled: true } : {}),
    ...(unitLabel ? { unit_label: unitLabel } : {}),
    ...(pricingUnit ? { pricing_unit: pricingUnit } : {}),
    ...(minQuantity !== null ? { min_quantity: minQuantity } : {}),
    ...(maxQuantity !== null ? { max_quantity: maxQuantity } : {}),
  };
}

export function parseAddonOperationalSetting(raw: string | null | undefined): Record<string, AddonOperationalFields> {
  if (!raw?.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed).map(([id, value]) => ({ id, ...(value as Record<string, unknown>) }))
        : [];

    const out: Record<string, AddonOperationalFields> = {};
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id : "";
      if (!id) continue;
      out[id] = parseOperationalFields(item);
    }
    return out;
  } catch {
    return {};
  }
}

export function mergeAddonsWithOperationalSettings<T extends { id: string }>(
  addons: T[],
  settings: Record<string, AddonOperationalFields>,
): Array<T & AddonOperationalFields> {
  return addons.map((addon) => ({
    ...addon,
    ...(settings[addon.id] ?? {}),
  }));
}

export function stringifyAddonOperationalSetting(
  addons: Array<{ id: string } & AddonOperationalFields>,
): string {
  const rows: AddonOperationalSettingRow[] = addons.flatMap((addon) => {
    const fields = parseOperationalFields(addon);
    if (Object.keys(fields).length === 0) return [];
    return [{ id: addon.id, ...fields }];
  });

  return JSON.stringify(rows);
}
