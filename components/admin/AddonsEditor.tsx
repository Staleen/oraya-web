"use client";
import { useEffect, useState } from "react";
import type { Addon } from "./types";
import {
  ADDON_CATEGORY_LABELS,
  ADDON_CUTOFF_LABELS,
  ADDON_ENFORCEMENT_LABELS,
  derivePreparationUnit,
  getAddonEnforcementMode,
  getPreparationAmount,
  normalizePreparationTime,
  type AddonCategory,
  type AddonEnforcementMode,
  type PreparationUnit,
} from "@/lib/addon-operations";
import { GOLD, CHARCOAL, MIDNIGHT, MUTED, LATO, SURFACE, BORDER, fieldStyle } from "./theme";

const PRICING_MODELS: { value: Addon["pricing_model"]; label: string }[] = [
  { value: "flat_fee",           label: "Flat fee"          },
  { value: "per_night",          label: "Per night"         },
  { value: "per_person_per_day", label: "Per person / day"  },
  { value: "per_unit",           label: "Per unit"          },
];

const CURRENCIES = ["USD", "EUR", "GBP", "LBP"];
const CATEGORY_OPTIONS: Array<{ value: AddonCategory; label: string }> = [
  { value: "comfort", label: ADDON_CATEGORY_LABELS.comfort },
  { value: "experience", label: ADDON_CATEGORY_LABELS.experience },
  { value: "logistics", label: ADDON_CATEGORY_LABELS.logistics },
  { value: "service", label: ADDON_CATEGORY_LABELS.service },
];
const CUTOFF_OPTIONS = [
  { value: "before_checkin", label: ADDON_CUTOFF_LABELS.before_checkin },
] as const;
const ENFORCEMENT_OPTIONS: Array<{ value: AddonEnforcementMode; label: string; help: string }> = [
  { value: "strict", label: ADDON_ENFORCEMENT_LABELS.strict, help: "Disable if not enough preparation time" },
  { value: "soft", label: ADDON_ENFORCEMENT_LABELS.soft, help: "Allow with warning" },
  { value: "none", label: ADDON_ENFORCEMENT_LABELS.none, help: "Always available" },
];

export default function AddonsEditor({
  addons, addonsSaving, addonsSaved, updateAddon, saveAddons,
}: {
  addons: Addon[];
  addonsSaving: boolean;
  addonsSaved: boolean;
  updateAddon: (id: string, patch: Partial<Addon>) => void;
  saveAddons: () => void;
}) {
  const [preparationUnits, setPreparationUnits] = useState<Record<string, PreparationUnit>>({});

  useEffect(() => {
    setPreparationUnits((prev) => {
      const next = { ...prev };
      for (const addon of addons) {
        if (!next[addon.id]) {
          next[addon.id] = derivePreparationUnit(addon.preparation_time_hours ?? null);
        }
      }
      return next;
    });
  }, [addons]);

  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;

  function getUnit(addon: Addon): PreparationUnit {
    return preparationUnits[addon.id] ?? derivePreparationUnit(addon.preparation_time_hours ?? null);
  }

  function getAmount(addon: Addon): string {
    const amount = getPreparationAmount(addon.preparation_time_hours ?? null, getUnit(addon));
    if (amount === null) return "";
    return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
  }

  function updatePreparationAmount(addon: Addon, rawValue: string) {
    updateAddon(addon.id, {
      preparation_time_hours: rawValue === "" ? null : normalizePreparationTime(parseFloat(rawValue), getUnit(addon)),
    });
  }

  function updatePreparationUnit(addon: Addon, unit: PreparationUnit) {
    setPreparationUnits((prev) => ({ ...prev, [addon.id]: unit }));
  }

  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.75rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
          Add-ons
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          {addonsSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
          <button
            onClick={saveAddons}
            disabled={addonsSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "12px 24px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            {addonsSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: "grid", gap: "12px" }}>
          {addons.map((addon) => (
            <div key={addon.id} style={{ border: `0.5px solid rgba(255,255,255,0.03)`, padding: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  {addon.label}
                </p>
                <input
                  type="checkbox"
                  checked={addon.enabled}
                  onChange={e => updateAddon(addon.id, { enabled: e.target.checked })}
                  style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
                />
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                <input
                  type="text"
                  value={addon.label}
                  onChange={e => updateAddon(addon.id, { label: e.target.value })}
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
                <select
                  value={addon.currency}
                  onChange={e => updateAddon(addon.id, { currency: e.target.value })}
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c} style={{ backgroundColor: MIDNIGHT }}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={addon.price ?? ""}
                  onChange={e => updateAddon(addon.id, { price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                  placeholder="-"
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
                <select
                  value={addon.pricing_model}
                  onChange={e => updateAddon(addon.id, { pricing_model: e.target.value as Addon["pricing_model"] })}
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  {PRICING_MODELS.map(pm => (
                    <option key={pm.value} value={pm.value} style={{ backgroundColor: MIDNIGHT }}>{pm.label}</option>
                  ))}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 100px", gap: "10px" }}>
                  <input
                    type="number"
                    min={0}
                    value={getAmount(addon)}
                    onChange={e => updatePreparationAmount(addon, e.target.value)}
                    placeholder="Preparation time"
                    style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                  />
                  <select
                    value={getUnit(addon)}
                    onChange={e => updatePreparationUnit(addon, e.target.value as PreparationUnit)}
                    style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                  >
                    <option value="hours" style={{ backgroundColor: MIDNIGHT }}>hours</option>
                    <option value="days" style={{ backgroundColor: MIDNIGHT }}>days</option>
                  </select>
                </div>
                <select
                  value={addon.cutoff_type ?? ""}
                  onChange={e => updateAddon(addon.id, { cutoff_type: e.target.value === "" ? null : "before_checkin" })}
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  <option value="" style={{ backgroundColor: MIDNIGHT }}>Cutoff type</option>
                  {CUTOFF_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={addon.category ?? ""}
                  onChange={e => updateAddon(addon.id, { category: e.target.value === "" ? null : e.target.value as AddonCategory })}
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  <option value="" style={{ backgroundColor: MIDNIGHT }}>Category</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={getAddonEnforcementMode(addon.enforcement_mode)}
                  onChange={e => updateAddon(addon.id, { enforcement_mode: e.target.value as AddonEnforcementMode })}
                  style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  {ENFORCEMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>
                      {option.label} - {option.help}
                    </option>
                  ))}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: LATO, fontSize: "12px", color: addon.enabled ? MUTED : "rgba(138,128,112,0.5)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={addon.requires_approval ?? false}
                    onChange={e => updateAddon(addon.id, { requires_approval: e.target.checked })}
                    style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  Requires approval
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 110px 160px", gap: "10px", alignItems: "center", paddingBottom: "10px", borderBottom: `0.5px solid ${BORDER}`, marginBottom: "8px" }}>
            {["On", "Name", "Currency", "Price", "Pricing model"].map(h => (
              <span key={h} style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED }}>{h}</span>
            ))}
          </div>

          {addons.map(addon => (
            <div key={addon.id} style={{ padding: "10px 0", borderBottom: `0.5px solid rgba(255,255,255,0.03)` }}>
              <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 110px 160px", gap: "10px", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={addon.enabled}
                    onChange={e => updateAddon(addon.id, { enabled: e.target.checked })}
                    style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </div>
                <input
                  type="text"
                  value={addon.label}
                  onChange={e => updateAddon(addon.id, { label: e.target.value })}
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
                <select
                  value={addon.currency}
                  onChange={e => updateAddon(addon.id, { currency: e.target.value })}
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c} style={{ backgroundColor: MIDNIGHT }}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={addon.price ?? ""}
                  onChange={e => updateAddon(addon.id, { price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                  placeholder="-"
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
                <select
                  value={addon.pricing_model}
                  onChange={e => updateAddon(addon.id, { pricing_model: e.target.value as Addon["pricing_model"] })}
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  {PRICING_MODELS.map(pm => (
                    <option key={pm.value} value={pm.value} style={{ backgroundColor: MIDNIGHT }}>{pm.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px", marginTop: "10px", paddingLeft: "40px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 100px", gap: "10px" }}>
                  <input
                    type="number"
                    min={0}
                    value={getAmount(addon)}
                    onChange={e => updatePreparationAmount(addon, e.target.value)}
                    placeholder="Preparation time"
                    style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                  />
                  <select
                    value={getUnit(addon)}
                    onChange={e => updatePreparationUnit(addon, e.target.value as PreparationUnit)}
                    style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                  >
                    <option value="hours" style={{ backgroundColor: MIDNIGHT }}>hours</option>
                    <option value="days" style={{ backgroundColor: MIDNIGHT }}>days</option>
                  </select>
                </div>
                <select
                  value={addon.cutoff_type ?? ""}
                  onChange={e => updateAddon(addon.id, { cutoff_type: e.target.value === "" ? null : "before_checkin" })}
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  <option value="" style={{ backgroundColor: MIDNIGHT }}>Cutoff type</option>
                  {CUTOFF_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={addon.category ?? ""}
                  onChange={e => updateAddon(addon.id, { category: e.target.value === "" ? null : e.target.value as AddonCategory })}
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  <option value="" style={{ backgroundColor: MIDNIGHT }}>Category</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={getAddonEnforcementMode(addon.enforcement_mode)}
                  onChange={e => updateAddon(addon.id, { enforcement_mode: e.target.value as AddonEnforcementMode })}
                  style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                  onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                >
                  {ENFORCEMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>
                      {option.label} - {option.help}
                    </option>
                  ))}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: LATO, fontSize: "12px", color: addon.enabled ? MUTED : "rgba(138,128,112,0.5)", cursor: "pointer", minHeight: "40px" }}>
                  <input
                    type="checkbox"
                    checked={addon.requires_approval ?? false}
                    onChange={e => updateAddon(addon.id, { requires_approval: e.target.checked })}
                    style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  Requires approval
                </label>
              </div>
            </div>
          ))}
        </>
      )}

      {addons.length === 0 && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>No add-ons loaded.</p>
      )}
    </div>
  );
}
