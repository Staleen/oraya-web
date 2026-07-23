import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  getAddonAppliesTo,
  mergeAddonsWithOperationalSettings,
  parseAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";

/**
 * Remediation 5.3 — the /book add-on catalog load, extracted verbatim from
 * the page effect: fetch enabled add-ons + operational settings, merge, keep
 * only stay-applicable ones. Generic over the caller's Addon row shape (the
 * page keeps its local `Addon` interface).
 */
export async function loadStayAddons<
  T extends { id: string; enabled: boolean; applies_to?: string | null },
>(): Promise<Array<T & AddonOperationalFields>> {
  const [addonsData, addonSettingsData] = await Promise.all([
    fetch("/api/addons").then((r) => r.json()),
    fetch(`/api/settings?key=${encodeURIComponent(ADDON_OPERATIONAL_SETTINGS_KEY)}`).then((r) =>
      r.json(),
    ),
  ]);
  const addonRows = Array.isArray(addonsData.addons) ? (addonsData.addons as T[]) : [];
  const operationalSettings = parseAddonOperationalSetting(addonSettingsData.value);
  return mergeAddonsWithOperationalSettings(addonRows, operationalSettings).filter(
    (addon) =>
      addon.enabled && ["stay", "both"].includes(getAddonAppliesTo(addon.applies_to)),
  );
}
