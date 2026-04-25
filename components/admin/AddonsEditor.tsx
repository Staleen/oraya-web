"use client";
import { useEffect, useState } from "react";
import type { Addon, AddonValidationIssue } from "./types";
import {
  ADDON_CATEGORY_LABELS,
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
const ENFORCEMENT_OPTIONS: Array<{ value: AddonEnforcementMode; label: string; help: string }> = [
  { value: "strict", label: ADDON_ENFORCEMENT_LABELS.strict, help: "Unavailable if prep time is too short" },
  { value: "soft", label: ADDON_ENFORCEMENT_LABELS.soft, help: "Allow with warning" },
  { value: "none", label: ADDON_ENFORCEMENT_LABELS.none, help: "Always available" },
];

export default function AddonsEditor({
  addons, addonsSaving, addonsSaved, updateAddon, addAddon, removeAddon, validationIssues, validationAttempted, saveAddons,
}: {
  addons: Addon[];
  addonsSaving: boolean;
  addonsSaved: boolean;
  updateAddon: (id: string, patch: Partial<Addon>) => void;
  addAddon: () => void;
  removeAddon: (id: string) => void;
  validationIssues: AddonValidationIssue[];
  validationAttempted: boolean;
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

  function fieldLabel(label: string) {
    return (
      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED }}>
        {label}
      </span>
    );
  }

  function getAddonIssues(addonId: string, level?: "error" | "warning") {
    return validationIssues.filter((issue) =>
      issue.addon_id === addonId && (!level || issue.level === level)
    );
  }

  function getFieldStatusStyle(
    addonId: string,
    field: AddonValidationIssue["field"],
    enabled: boolean,
  ) {
    if (validationAttempted && validationIssues.some((issue) => issue.addon_id === addonId && issue.level === "error" && issue.field === field)) {
      return { borderColor: "#e07070" };
    }
    if (validationIssues.some((issue) => issue.addon_id === addonId && issue.level === "warning" && issue.field === field)) {
      return { borderColor: "rgba(226,171,90,0.55)" };
    }
    return { opacity: enabled ? 1 : 0.5 };
  }

  function pricingModelLabel(value: Addon["pricing_model"]) {
    return PRICING_MODELS.find((model) => model.value === value)?.label ?? value;
  }

  function managerSummary(addon: Addon) {
    const parts: string[] = [];
    const priceLabel = addon.price !== null
      ? `${addon.currency} ${addon.price} ${pricingModelLabel(addon.pricing_model).toLowerCase()}`
      : `Price on request ${pricingModelLabel(addon.pricing_model).toLowerCase()}`;
    parts.push(priceLabel);

    if (addon.preparation_time_hours && addon.preparation_time_hours > 0) {
      const unit = addon.preparation_time_hours % 24 === 0 ? "days" : "hours";
      const amount = unit === "days" ? addon.preparation_time_hours / 24 : addon.preparation_time_hours;
      parts.push(`${amount} ${amount === 1 ? unit.slice(0, -1) : unit} advance notice`);
    } else {
      parts.push("No advance notice");
    }

    parts.push(`${getAddonEnforcementMode(addon.enforcement_mode).charAt(0).toUpperCase()}${getAddonEnforcementMode(addon.enforcement_mode).slice(1)} rule`);
    parts.push(addon.requires_approval ? "Manager approval required" : "No manager approval");

    return parts.join(" · ");
  }

  const pricingGridColumns = isMobile ? "1fr" : "110px minmax(0, 1fr) minmax(0, 1.3fr)";
  const operationGridColumns = isMobile ? "1fr" : "minmax(0, 1.1fr) 110px minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr)";

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
            onClick={addAddon}
            disabled={addonsSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: `0.5px solid ${BORDER}`, padding: "12px 18px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            + Add Add-on
          </button>
          <button
            onClick={saveAddons}
            disabled={addonsSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "12px 24px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            {addonsSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "14px" }}>
        {addons.map((addon) => {
          const addonErrors = getAddonIssues(addon.id, "error");
          const addonWarnings = getAddonIssues(addon.id, "warning");
          const showErrors = validationAttempted && addonErrors.length > 0;
          return (
            <div
              key={addon.id}
              style={{
                border: `0.5px solid ${showErrors ? "rgba(224,112,112,0.45)" : "rgba(255,255,255,0.06)"}`,
                backgroundColor: "rgba(255,255,255,0.02)",
                padding: isMobile ? "14px" : "18px",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0, 1fr) auto", alignItems: isMobile ? "stretch" : "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={addon.enabled}
                    onChange={e => updateAddon(addon.id, { enabled: e.target.checked })}
                    style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: addon.enabled ? GOLD : MUTED,
                    border: `0.5px solid ${addon.enabled ? "rgba(197,164,109,0.35)" : "rgba(138,128,112,0.28)"}`,
                    backgroundColor: addon.enabled ? "rgba(197,164,109,0.08)" : "rgba(138,128,112,0.08)",
                    padding: "4px 8px",
                    whiteSpace: "nowrap",
                  }}>
                    {addon.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div style={{ display: "grid", gap: "6px", minWidth: 0 }}>
                  {fieldLabel("Add-on name")}
                  <input
                    type="text"
                    value={addon.label}
                    onChange={e => updateAddon(addon.id, { label: e.target.value })}
                    placeholder="Add-on name"
                    style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", ...getFieldStatusStyle(addon.id, "label", addon.enabled) }}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAddon(addon.id)}
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#d9a2a2", backgroundColor: "transparent", border: "none", padding: isMobile ? "2px 0" : 0, cursor: "pointer", justifySelf: isMobile ? "start" : "end" }}
                  >
                    Remove
                  </button>
              </div>

              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.6, margin: "0 0 16px" }}>
                {managerSummary(addon)}
              </p>

              <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
                {fieldLabel("Pricing")}
                <div style={{ display: "grid", gridTemplateColumns: pricingGridColumns, gap: "10px" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Currency")}
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
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Price")}
                    <input
                      type="number"
                      min={0}
                      value={addon.price ?? ""}
                      onChange={e => updateAddon(addon.id, { price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      placeholder="Price"
                      style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", ...getFieldStatusStyle(addon.id, "price", addon.enabled) }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    />
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Pricing model")}
                    <select
                      value={addon.pricing_model}
                      onChange={e => updateAddon(addon.id, { pricing_model: e.target.value as Addon["pricing_model"] })}
                      style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", ...getFieldStatusStyle(addon.id, "pricing_model", addon.enabled) }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    >
                      {PRICING_MODELS.map(pm => (
                        <option key={pm.value} value={pm.value} style={{ backgroundColor: MIDNIGHT }}>{pm.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {fieldLabel("Operations")}
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, lineHeight: 1.6, margin: 0 }}>
                  Strict blocks booking if the rule is not satisfied. Soft allows booking but warns admin/customer. None means no operational restriction.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: operationGridColumns, gap: "10px" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Advance notice required")}
                    <input
                      type="number"
                      min={0}
                      value={getAmount(addon)}
                      onChange={e => updatePreparationAmount(addon, e.target.value)}
                      placeholder="Prep time"
                      style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", ...getFieldStatusStyle(addon.id, "preparation_time_hours", addon.enabled) }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    />
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Unit")}
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
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Category")}
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
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Booking rule")}
                    <select
                      value={getAddonEnforcementMode(addon.enforcement_mode)}
                      onChange={e => updateAddon(addon.id, { enforcement_mode: e.target.value as AddonEnforcementMode })}
                      style={{ ...fieldStyle, padding: "10px 12px", fontSize: "13px", cursor: "pointer", ...getFieldStatusStyle(addon.id, "enforcement_mode", addon.enabled) }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    >
                      {ENFORCEMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>
                          {option.label} - {option.help}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label style={{ display: "grid", gap: "8px", alignContent: "start", fontFamily: LATO, fontSize: "12px", color: addon.enabled ? MUTED : "rgba(138,128,112,0.5)", cursor: "pointer" }}>
                    {fieldLabel("Needs manager approval")}
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "42px", padding: "0 2px" }}>
                      <input
                        type="checkbox"
                        checked={addon.requires_approval ?? false}
                        onChange={e => updateAddon(addon.id, { requires_approval: e.target.checked })}
                        style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
                      />
                      <span>Needs manager approval</span>
                    </span>
                  </label>
                </div>
              </div>

              {showErrors || addonWarnings.length > 0 ? (
                <div style={{ display: "grid", gap: "4px", marginTop: "14px" }}>
                  {showErrors && addonErrors.map((issue, index) => (
                    <p key={`error-${issue.message}-${index}`} style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070", margin: 0, lineHeight: 1.5 }}>
                      {issue.message}
                    </p>
                  ))}
                  {addonWarnings.map((issue, index) => (
                    <p key={`warning-${issue.message}-${index}`} style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.5 }}>
                      {issue.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {addons.length === 0 && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>No add-ons loaded.</p>
      )}
    </div>
  );
}
