"use client";
import { useEffect, useState } from "react";
import AddonsEditor from "@/components/admin/AddonsEditor";
import BasePricingEditor from "@/components/admin/BasePricingEditor";
import { VILLA_BASE_PRICING_KEY, parseVillaPricingSetting, stringifyVillaPricingSetting, type VillaBasePricing } from "@/lib/admin-pricing";
import { ADDON_OPERATIONAL_SETTINGS_KEY, mergeAddonsWithOperationalSettings, parseAddonOperationalSetting, stringifyAddonOperationalSetting } from "@/lib/addon-operations";
import { validatePricing } from "@/lib/pricing/validation";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import type { Addon, AddonValidationIssue } from "@/components/admin/types";

function createAddonId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `addon_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `addon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminRatesPage() {
  const { error, setError } = useAdminData();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [addonsSaved, setAddonsSaved] = useState(false);
  const [addonValidationAttempted, setAddonValidationAttempted] = useState(false);
  const [villaPricing, setVillaPricing] = useState<VillaBasePricing[]>(parseVillaPricingSetting(null));
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [pricingValidationAttempted, setPricingValidationAttempted] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(true);

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
        setRatesLoading(false);
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
      setRatesLoading(false);
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

  function addAddon() {
    setAddons((prev) => ([
      ...prev,
      {
        id: createAddonId(),
        label: "",
        currency: "USD",
        price: 0,
        pricing_model: "flat_fee",
        enabled: true,
        preparation_time_hours: null,
        cutoff_type: null,
        requires_approval: false,
        category: "service",
        enforcement_mode: "soft",
      },
    ]));
    setAddonsSaved(false);
  }

  function removeAddon(id: string) {
    setAddons((prev) => prev.filter((addon) => addon.id !== id));
    setAddonsSaved(false);
  }

  function validateAddons(items: Addon[]): AddonValidationIssue[] {
    const issues: AddonValidationIssue[] = [];
    const labelCounts = new Map<string, number>();

    for (const addon of items) {
      const normalizedLabel = addon.label.trim().toLocaleLowerCase();
      if (normalizedLabel) {
        labelCounts.set(normalizedLabel, (labelCounts.get(normalizedLabel) ?? 0) + 1);
      }
    }

    for (const addon of items) {
      const label = addon.label.trim();
      const enforcementMode = addon.enforcement_mode ?? null;
      const price = addon.price;
      const prep = addon.preparation_time_hours ?? null;

      if (!label) {
        issues.push({ addon_id: addon.id, level: "error", field: "label", message: "Label is required." });
      } else if ((labelCounts.get(label.toLocaleLowerCase()) ?? 0) > 1) {
        issues.push({ addon_id: addon.id, level: "error", field: "label", message: "Label must be unique." });
      }

      if (price !== null && !Number.isFinite(price)) {
        issues.push({ addon_id: addon.id, level: "error", field: "price", message: "Price is invalid." });
      } else if (price !== null && price < 0) {
        issues.push({ addon_id: addon.id, level: "error", field: "price", message: "Price cannot be negative." });
      }

      if (prep !== null && !Number.isFinite(prep)) {
        issues.push({
          addon_id: addon.id,
          level: "error",
          field: "preparation_time_hours",
          message: "Preparation time is invalid.",
        });
      } else if (prep !== null && prep < 0) {
        issues.push({
          addon_id: addon.id,
          level: "error",
          field: "preparation_time_hours",
          message: "Preparation time cannot be negative.",
        });
      }

      if (!addon.pricing_model) {
        issues.push({
          addon_id: addon.id,
          level: "error",
          field: "pricing_model",
          message: "Pricing model is required.",
        });
      }

      if (!enforcementMode) {
        issues.push({
          addon_id: addon.id,
          level: "error",
          field: "enforcement_mode",
          message: "Operational mode is required.",
        });
      }

      if (addon.enabled && price === 0) {
        issues.push({
          addon_id: addon.id,
          level: "warning",
          field: "price",
          message: "Enabled add-on with price 0 will appear free.",
        });
      }

      if (enforcementMode === "strict" && (prep === null || prep <= 0)) {
        issues.push({
          addon_id: addon.id,
          level: "warning",
          field: "preparation_time_hours",
          message: "Strict add-ons usually need a preparation time.",
        });
      }

      if (addon.requires_approval && enforcementMode === "none") {
        issues.push({
          addon_id: addon.id,
          level: "warning",
          field: "enforcement_mode",
          message: "Requires approval is unusual when operational mode is None.",
        });
      }
    }

    return issues;
  }

  const addonValidationIssues = validateAddons(addons);

  async function saveAddons() {
    const hasBlockingAddonErrors = addonValidationIssues.some((issue) => issue.level === "error");
    if (hasBlockingAddonErrors) {
      setAddonValidationAttempted(true);
      setAddonsSaved(false);
      setError("");
      return;
    }

    setAddonValidationAttempted(false);
    setAddonsSaving(true);
    setAddonsSaved(false);
    setError("");
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
    const hasBlockingPricingErrors = villaPricing.some((item) =>
      validatePricing(item).some((issue) => issue.level === "error"),
    );
    if (hasBlockingPricingErrors) {
      setPricingValidationAttempted(true);
      setError("");
      return;
    }

    setPricingValidationAttempted(false);
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
      {ratesLoading ? (
        <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.03)", padding: "1rem", marginBottom: "2rem" }} aria-hidden="true">
          <SkeletonText width="140px" height="10px" style={{ marginBottom: "18px" }} />
          <SkeletonBlock height="46px" style={{ marginBottom: "14px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "14px" }}>
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} height="82px" />)}
          </div>
          {[0, 1].map((item) => (
            <SkeletonBlock key={item} height="104px" style={{ marginTop: "10px" }} />
          ))}
        </div>
      ) : (
        <BasePricingEditor
          pricing={villaPricing}
          pricingSaving={pricingSaving}
          pricingSaved={pricingSaved}
          updatePricing={updatePricing}
          savePricing={savePricing}
          pricingValidationAttempted={pricingValidationAttempted}
        />
      )}
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "#C5A46D", margin: "0 0 8px" }}>
          Add-ons
        </p>
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#8a8070", margin: 0 }}>
          Existing optional extras remain separate from base villa pricing and continue to use their current admin flow.
        </p>
      </div>
      {ratesLoading ? (
        <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.03)", padding: "1rem" }} aria-hidden="true">
          <SkeletonText width="150px" height="10px" style={{ marginBottom: "16px" }} />
          <SkeletonBlock height="42px" style={{ marginBottom: "12px" }} />
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock key={item} height="74px" style={{ marginTop: "8px" }} />
          ))}
        </div>
      ) : (
        <AddonsEditor
          addons={addons}
          addonsSaving={addonsSaving}
          addonsSaved={addonsSaved}
          updateAddon={updateAddon}
          addAddon={addAddon}
          removeAddon={removeAddon}
          validationIssues={addonValidationIssues}
          validationAttempted={addonValidationAttempted}
          saveAddons={saveAddons}
        />
      )}
    </>
  );
}
