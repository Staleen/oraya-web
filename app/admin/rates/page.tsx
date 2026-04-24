"use client";
import { useEffect, useState } from "react";
import AddonsEditor from "@/components/admin/AddonsEditor";
import BasePricingEditor from "@/components/admin/BasePricingEditor";
import { VILLA_BASE_PRICING_KEY, parseVillaPricingSetting, stringifyVillaPricingSetting, type VillaBasePricing } from "@/lib/admin-pricing";
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
    fetch("/api/addons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.addons)) setAddons(d.addons); })
      .catch((e) => console.error("[admin] addons fetch error:", e));

    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.settings ?? [];
        const pricingRow = rows.find((row: { key: string; value: string }) => row.key === VILLA_BASE_PRICING_KEY);
        setVillaPricing(parseVillaPricingSetting(pricingRow?.value));
      })
      .catch((e) => console.error("[admin] pricing settings fetch error:", e));
  }, []);

  function updateAddon(id: string, patch: Partial<Addon>) {
    setAddons((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
    setAddonsSaved(false);
  }

  async function saveAddons() {
    setAddonsSaving(true);
    setAddonsSaved(false);
    const res = await fetch("/api/admin/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addons }),
    });
    setAddonsSaving(false);
    if (res.ok) {
      setAddonsSaved(true);
      setTimeout(() => setAddonsSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save add-ons.");
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
          Configure base villa pricing first, then manage add-ons below. These values are stored for admin use only and do not affect booking calculations yet.
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
          Existing optional extras remain separate from base villa pricing.
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
