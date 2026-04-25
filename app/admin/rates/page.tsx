"use client";
import { useEffect, useState } from "react";
import AddonsEditor from "@/components/admin/AddonsEditor";
import BasePricingEditor from "@/components/admin/BasePricingEditor";
import { VILLA_BASE_PRICING_KEY, parseVillaPricingSetting, stringifyVillaPricingSetting, type VillaBasePricing } from "@/lib/admin-pricing";
import { ADDON_OPERATIONAL_SETTINGS_KEY, mergeAddonsWithOperationalSettings, parseAddonOperationalSetting, stringifyAddonOperationalSetting } from "@/lib/addon-operations";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import type { Addon } from "@/components/admin/types";

export default function AdminRatesPage() {
  const { error, setError } = useAdminData();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [addonsSaved, setAddonsSaved] = useState(false);
  const [villaPricing, setVillaPricing] = useState<VillaBasePricing[]>(parseVillaPricingSetting(null));
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRatesPageData() {
      const [addonsResult, settingsResult] = await Promise.allSettled([
        fetch("/api/addons", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/settings", { cache: "no-store" }).then((r) => r.json()),
      ]);

      if (cancelled) return;

      if (addonsResult.status === "rejected") {
        console.error("[admin] addons fetch error:", addonsResult.reason);
      }

      if (settingsResult.status === "rejected") {
        console.error("[admin] pricing settings fetch error:", settingsResult.reason);
        return;
      }

      const rows = settingsResult.value.settings ?? [];
      const pricingRow = rows.find((row: { key: string; value: string }) => row.key === VILLA_BASE_PRICING_KEY);
      const addonOperationsRow = rows.find((row: { key: string; value: string }) => row.key === ADDON_OPERATIONAL_SETTINGS_KEY);
      const operationalSettings = parseAddonOperationalSetting(addonOperationsRow?.value);
      const addonRows = addonsResult.status === "fulfilled" && Array.isArray(addonsResult.value.addons)
        ? addonsResult.value.addons
        : [];

      setVillaPricing(parseVillaPricingSetting(pricingRow?.value));
      setAddons(mergeAddonsWithOperationalSettings(addonRows, operationalSettings));
    }

    loadRatesPageData();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateAddon(id: string, patch: Partial<Addon>) {
    setAddons((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
    setAddonsSaved(false);
  }

  async function saveAddons() {
    setAddonsSaving(true);
    setAddonsSaved(false);
    const baseAddonsRes = await fetch("/api/admin/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addons: addons.map(({ id, label, enabled, currency, price, pricing_model }) => ({
          id,
          label,
          enabled,
          currency,
          price,
          pricing_model,
        })),
      }),
    });
    if (!baseAddonsRes.ok) {
      setAddonsSaving(false);
      const d = await baseAddonsRes.json();
      setError(d.error ?? "Failed to save add-ons.");
      return;
    }

    const addonSettingsRes = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: ADDON_OPERATIONAL_SETTINGS_KEY,
        value: stringifyAddonOperationalSetting(addons),
      }),
    });

    setAddonsSaving(false);
    if (addonSettingsRes.ok) {
      setAddonsSaved(true);
      setTimeout(() => setAddonsSaved(false), 3000);
    } else {
      const d = await addonSettingsRes.json();
      setError(d.error ?? "Failed to save add-on preparation settings.");
    }
  }

  function updatePricing(villa: string, patch: Partial<VillaBasePricing>) {
    setVillaPricing((prev) => prev.map((item) => item.villa === villa ? { ...item, ...patch } : item));
    setPricingSaved(false);
  }

  async function savePricing() {
    const missingBasePrice = villaPricing.find((item) => item.base_price === null);
    if (missingBasePrice) {
      setError(`Base price is required for ${missingBasePrice.villa}.`);
      return;
    }

    setPricingSaving(true);
    setPricingSaved(false);
    setError("");
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VILLA_BASE_PRICING_KEY, value: stringifyVillaPricingSetting(villaPricing) }),
    });
    setPricingSaving(false);
    if (res.ok) {
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save base pricing.");
    }
  }

  return (
    <>
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "#C5A46D", margin: "0 0 8px" }}>
          Rates
        </p>
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#8a8070", margin: 0 }}>
          Configure base villa pricing first, then manage add-ons below. These values are stored in admin settings only and do not affect booking calculations yet.
        </p>
      </div>
      <BasePricingEditor
        pricing={villaPricing}
        pricingSaving={pricingSaving}
        pricingSaved={pricingSaved}
        updatePricing={updatePricing}
        savePricing={savePricing}
      />
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "#C5A46D", margin: "0 0 8px" }}>
          Add-ons
        </p>
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#8a8070", margin: 0 }}>
          Existing optional extras remain separate from base villa pricing and continue to use their current admin flow.
        </p>
      </div>
      <AddonsEditor
        addons={addons}
        addonsSaving={addonsSaving}
        addonsSaved={addonsSaved}
        updateAddon={updateAddon}
        saveAddons={saveAddons}
      />
    </>
  );
}
