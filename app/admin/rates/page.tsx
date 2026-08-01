"use client";
import { useEffect, useRef, useState } from "react";
import AddonsEditor from "@/components/admin/AddonsEditor";
import BasePricingEditor from "@/components/admin/BasePricingEditor";
import { VILLA_BASE_PRICING_KEY, parseVillaPricingSetting, stringifyVillaPricingSetting, type VillaBasePricing } from "@/lib/admin-pricing";
import { ADDON_OPERATIONAL_SETTINGS_KEY, mergeAddonsWithOperationalSettings, parseAddonOperationalSetting, stringifyAddonOperationalSetting } from "@/lib/addon-operations";
import { EVENT_SERVICE_SEED_DEFINITIONS } from "@/lib/event-service-seed";
import { validatePricing } from "@/lib/pricing/validation";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import type { Addon, AddonValidationIssue } from "@/components/admin/types";

function createAddonId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `addon_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `addon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Event service seed data ──────────────────────────────────────────────────
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
  // Audit R-2/R-3: when either load fails, editing is disabled entirely —
  // stale/default values must never become saveable over live pricing.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncingEventServices, setSyncingEventServices] = useState(false);
  const [syncEventServicesDone, setSyncEventServicesDone] = useState(false);
  // Audit R-2: add-on ids present at last successful load, so Save can tell
  // the API which deletions are explicit operator removals.
  const loadedAddonIdsRef = useRef<Set<string>>(new Set());

  async function loadRatesPageData() {
    setRatesLoading(true);
    setLoadError(null);
    const [addonsResult, settingsResult] = await Promise.allSettled([
      fetch("/api/addons", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error(`Add-ons request failed (${r.status}).`);
        const data = await r.json();
        if (!Array.isArray(data.addons)) throw new Error("Add-ons response was malformed.");
        return data.addons as Addon[];
      }),
      fetch("/api/admin/settings", adminApiFetchInit).then(async (r) => {
        if (!r.ok) throw new Error(`Settings request failed (${r.status}).`);
        const data = await r.json();
        if (!Array.isArray(data.settings)) throw new Error("Settings response was malformed.");
        return data.settings as Array<{ key: string; value: string }>;
      }),
    ]);

    if (addonsResult.status === "rejected" || settingsResult.status === "rejected") {
      const reason =
        addonsResult.status === "rejected"
          ? addonsResult.reason
          : settingsResult.status === "rejected"
            ? settingsResult.reason
            : null;
      console.error("[admin] rates load error:", reason);
      setLoadError(reason instanceof Error ? reason.message : "Network error while loading rates.");
      setRatesLoading(false);
      return;
    }

    const rows = settingsResult.value;
    const pricingRow = rows.find((row) => row.key === VILLA_BASE_PRICING_KEY);
    const addonOperationsRow = rows.find((row) => row.key === ADDON_OPERATIONAL_SETTINGS_KEY);
    const operationalSettings = parseAddonOperationalSetting(addonOperationsRow?.value);
    const mergedAddons = mergeAddonsWithOperationalSettings(addonsResult.value, operationalSettings);

    loadedAddonIdsRef.current = new Set(mergedAddons.map((addon) => addon.id));
    setVillaPricing(parseVillaPricingSetting(pricingRow?.value));
    setAddons(mergedAddons);
    setRatesLoading(false);
  }

  useEffect(() => {
    void loadRatesPageData();
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
        applies_to: "stay",
        applicable_event_types: [],
        quantity_enabled: false,
        unit_label: null,
        pricing_unit: null,
        min_quantity: null,
        max_quantity: null,
      },
    ]));
    setAddonsSaved(false);
  }

  function removeAddon(id: string) {
    setAddons((prev) => prev.filter((addon) => addon.id !== id));
    setAddonsSaved(false);
  }

  function addEventServiceAddon() {
    setAddons((prev) => ([
      ...prev,
      {
        id: createAddonId(),
        label: "",
        currency: "USD",
        price: 0,
        pricing_model: "flat_fee" as const,
        enabled: true,
        preparation_time_hours: null,
        cutoff_type: null,
        requires_approval: false,
        category: null,
        enforcement_mode: "soft" as const,
        applies_to: "event" as const,
        applicable_event_types: [],
        quantity_enabled: false,
        unit_label: null,
        pricing_unit: null,
        min_quantity: null,
        max_quantity: null,
      },
    ]));
    setAddonsSaved(false);
  }

  const eventServiceCount = addons.filter((a) =>
    a.applies_to === "event" || a.applies_to === "both"
  ).length;

  async function syncEventServices() {
    setSyncingEventServices(true);
    setSyncEventServicesDone(false);
    setError("");

    const syncRes = await fetch("/api/admin/event-services/sync", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    setSyncingEventServices(false);
    if (syncRes.ok) {
      await loadRatesPageData();
      setSyncEventServicesDone(true);
      setTimeout(() => setSyncEventServicesDone(false), 3000);
    } else {
      const d = await syncRes.json();
      setError(d.error ?? "Failed to sync event services.");
    }
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
    // Audit R-2/R-3: never save over live data from a failed or partial load.
    if (loadError !== null) {
      setError("Rates failed to load — reload the page data before saving.");
      return;
    }
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
    const currentIds = new Set(addons.map((addon) => addon.id));
    const baseAddonsRes = await fetch("/api/admin/addons", {
      ...adminApiFetchInit,
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
        // Audit R-2: ids the operator explicitly removed since the last load —
        // the API refuses a full wipe that is not covered by this list.
        deleted_ids: Array.from(loadedAddonIdsRef.current).filter((id) => !currentIds.has(id)),
      }),
    });
    if (!baseAddonsRes.ok) {
      setAddonsSaving(false);
      const d = await baseAddonsRes.json().catch(() => ({}));
      setError(d.error ?? "Failed to save add-ons.");
      return;
    }

    const addonSettingsRes = await fetch("/api/admin/settings", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: ADDON_OPERATIONAL_SETTINGS_KEY,
        value: stringifyAddonOperationalSetting(addons),
      }),
    });

    setAddonsSaving(false);
    if (addonSettingsRes.ok) {
      // Audit R-4: re-read persisted state so concurrent-session changes and
      // the server's view of this save are visible instead of trusted locally.
      await loadRatesPageData();
      setAddonsSaved(true);
      setTimeout(() => setAddonsSaved(false), 3000);
    } else {
      const d = await addonSettingsRes.json().catch(() => ({}));
      setError(d.error ?? "Failed to save add-on preparation settings.");
    }
  }

  function updatePricing(villa: string, patch: Partial<VillaBasePricing>) {
    setVillaPricing((prev) => prev.map((item) => item.villa === villa ? { ...item, ...patch } : item));
    setPricingSaved(false);
  }

  async function savePricing() {
    // Audit R-2/R-3: never save over live data from a failed or partial load.
    if (loadError !== null) {
      setError("Rates failed to load — reload the page data before saving.");
      return;
    }
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
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VILLA_BASE_PRICING_KEY, value: stringifyVillaPricingSetting(villaPricing) }),
    });
    setPricingSaving(false);
    if (res.ok) {
      // Audit R-4: re-read persisted state after every successful save.
      await loadRatesPageData();
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 3000);
    } else {
      const d = await res.json().catch(() => ({}));
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
          Configure base villa pricing first, then manage add-ons below. These rates and add-ons drive the live guest quotes on /book and the totals saved on new bookings — changes take effect for guests immediately after Save.
        </p>
      </div>
      {!ratesLoading && loadError !== null && (
        <div
          style={{
            border: "0.5px solid rgba(224,112,112,0.34)",
            backgroundColor: "rgba(224,112,112,0.08)",
            padding: "14px 16px",
            marginBottom: "2rem",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f4b3b3", margin: "0 0 4px", lineHeight: 1.6 }}>
            Couldn&apos;t load the current rates — editing is disabled so a stale view can&apos;t overwrite live pricing or delete add-ons.
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "#8a8070", margin: "0 0 10px", lineHeight: 1.5 }}>
            {loadError}
          </p>
          <button
            onClick={() => void loadRatesPageData()}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              color: "#C5A46D", backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.35)",
              padding: "10px 18px", cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}
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
      ) : loadError !== null ? null : (
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
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#8a8070", margin: "0 0 10px" }}>
          Stay extras and event services. Set <em>Applies to</em> on each row to control where it appears.
        </p>
        {!ratesLoading && loadError === null && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
            <button
              onClick={syncEventServices}
              disabled={syncingEventServices}
              style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "1px",
                textTransform: "uppercase", color: syncingEventServices ? "#8a8070" : "#C5A46D",
                background: "rgba(197,164,109,0.07)", border: "0.5px solid rgba(197,164,109,0.35)",
                padding: "6px 14px", cursor: syncingEventServices ? "not-allowed" : "pointer",
              }}
            >
              {syncingEventServices ? "Syncing..." : "Sync Event Services"}
            </button>
            {syncEventServicesDone && (
              <span style={{ fontFamily: LATO, fontSize: "11px", color: "#7aad7a" }}>
                Sync completed
              </span>
            )}
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#8a8070" }}>
              {eventServiceCount === 0
                ? `Repairs ${EVENT_SERVICE_SEED_DEFINITIONS.length} canonical services (no duplicates).`
                : "Repairs metadata + inserts missing canonical services."}
            </span>
          </div>
        )}
      </div>
      {ratesLoading ? (
        <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.03)", padding: "1rem" }} aria-hidden="true">
          <SkeletonText width="150px" height="10px" style={{ marginBottom: "16px" }} />
          <SkeletonBlock height="42px" style={{ marginBottom: "12px" }} />
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock key={item} height="74px" style={{ marginTop: "8px" }} />
          ))}
        </div>
      ) : loadError !== null ? null : (
        <AddonsEditor
          addons={addons}
          addonsSaving={addonsSaving}
          addonsSaved={addonsSaved}
          updateAddon={updateAddon}
          addAddon={addAddon}
          addEventServiceAddon={addEventServiceAddon}
          removeAddon={removeAddon}
          validationIssues={addonValidationIssues}
          validationAttempted={addonValidationAttempted}
          saveAddons={saveAddons}
        />
      )}
    </>
  );
}
