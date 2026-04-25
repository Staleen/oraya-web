export const ADDON_OPERATIONAL_SETTINGS_KEY = "addon_operational_settings";

export type AddonCutoffType = "before_checkin" | "before_booking";
export type AddonCategory = "comfort" | "experience" | "logistics" | "service";
export type PreparationUnit = "hours" | "days";

export interface AddonOperationalFields {
  preparation_time_hours?: number | null;
  cutoff_type?: AddonCutoffType | null;
  requires_approval?: boolean;
  category?: AddonCategory | null;
}

export interface AddonOperationalSettingRow extends AddonOperationalFields {
  id: string;
}

const VALID_CUTOFF_TYPES = new Set<AddonCutoffType>(["before_checkin", "before_booking"]);
const VALID_CATEGORIES = new Set<AddonCategory>(["comfort", "experience", "logistics", "service"]);

export const ADDON_CATEGORY_LABELS: Record<AddonCategory, string> = {
  comfort: "Comfort",
  experience: "Experience",
  logistics: "Logistics",
  service: "Service",
};

export const ADDON_CUTOFF_LABELS: Record<AddonCutoffType, string> = {
  before_checkin: "Before check-in",
  before_booking: "Before booking",
};

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
    typeof item.category === "string" && VALID_CATEGORIES.has(item.category as AddonCategory)
      ? (item.category as AddonCategory)
      : null;

  return {
    ...(preparationTimeHours !== null ? { preparation_time_hours: preparationTimeHours } : {}),
    ...(cutoffType ? { cutoff_type: cutoffType } : {}),
    ...(requiresApproval ? { requires_approval: true } : {}),
    ...(category ? { category } : {}),
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
