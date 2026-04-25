export const ADDON_OPERATIONAL_SETTINGS_KEY = "addon_operational_settings";

export type AddonCutoffType = "before_checkin" | "before_booking";
export type AddonCategory = string;
export type PreparationUnit = "hours" | "days";
export type AddonEnforcementMode = "strict" | "soft" | "none";
export type AddonTimingType = "early_checkin" | "late_checkout";

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
}

export interface AddonOperationalSettingRow extends AddonOperationalFields {
  id: string;
}

const VALID_CUTOFF_TYPES = new Set<AddonCutoffType>(["before_checkin", "before_booking"]);
const VALID_ENFORCEMENT_MODES = new Set<AddonEnforcementMode>(["strict", "soft", "none"]);

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

export function getAddonEnforcementMode(
  mode: AddonEnforcementMode | null | undefined
): AddonEnforcementMode {
  return mode ?? "soft";
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
