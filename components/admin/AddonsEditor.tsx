"use client";
import { useEffect, useRef, useState } from "react";
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
  { value: "flat_fee", label: "Flat fee" },
  { value: "per_night", label: "Per night" },
  { value: "per_person_per_day", label: "Per person / day" },
  { value: "per_unit", label: "Per unit" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "LBP"];
const CATEGORY_OPTIONS: Array<{ value: AddonCategory; label: string }> = [
  { value: "comfort", label: ADDON_CATEGORY_LABELS.comfort },
  { value: "experience", label: ADDON_CATEGORY_LABELS.experience },
  { value: "logistics", label: ADDON_CATEGORY_LABELS.logistics },
  { value: "service", label: ADDON_CATEGORY_LABELS.service },
];
const ENFORCEMENT_OPTIONS: Array<{ value: AddonEnforcementMode; label: string; help: string }> = [
  { value: "strict", label: ADDON_ENFORCEMENT_LABELS.strict, help: "Disable if not enough preparation time" },
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
  const [expandedAddonId, setExpandedAddonId] = useState<string | null>(null);
  const previousAddonIdsRef = useRef<string[]>([]);

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

  useEffect(() => {
    if (addonsSaved) {
      setExpandedAddonId(null);
    }
  }, [addonsSaved]);

  useEffect(() => {
    if (addons.length === 0) {
      setExpandedAddonId(null);
      previousAddonIdsRef.current = [];
      return;
    }

    const previousAddonIds = previousAddonIdsRef.current;
    const newAddon = addons.find((addon) => !previousAddonIds.includes(addon.id));

    if (newAddon) {
      setExpandedAddonId(newAddon.id);
      previousAddonIdsRef.current = addons.map((addon) => addon.id);
      return;
    }

    if (expandedAddonId && !addons.some((addon) => addon.id === expandedAddonId)) {
      setExpandedAddonId(null);
    }

    previousAddonIdsRef.current = addons.map((addon) => addon.id);
  }, [addons, expandedAddonId]);

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

  function priceSummary(addon: Addon) {
    const pricePart = addon.price !== null ? `${addon.currency} ${addon.price}` : "Price on request";
    return `${pricePart} - ${pricingModelLabel(addon.pricing_model)}`;
  }

  function operationalSummary(addon: Addon) {
    const parts: string[] = [];
    if (addon.preparation_time_hours && addon.preparation_time_hours > 0) {
      const unit = addon.preparation_time_hours % 24 === 0 ? "days" : "hours";
      const amount = unit === "days" ? addon.preparation_time_hours / 24 : addon.preparation_time_hours;
      parts.push(`${amount} ${amount === 1 ? unit.slice(0, -1) : unit} notice`);
    } else {
      parts.push("No notice");
    }
    const mode = getAddonEnforcementMode(addon.enforcement_mode);
    parts.push(mode.charAt(0).toUpperCase() + mode.slice(1));
    if (addon.requires_approval) parts.push("Approval");
    return parts.join(" - ");
  }

  function toggleExpanded(id: string) {
    setExpandedAddonId((current) => current === id ? null : id);
  }

  function handleAddAddon() {
    addAddon();
  }

  const expandedGridColumns = isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))";
  const operationsGridColumns = isMobile ? "1fr" : "minmax(0, 1.1fr) 110px minmax(0, 1.3fr) minmax(0, 1fr)";
  const editingAddon = expandedAddonId ? addons.find((addon) => addon.id === expandedAddonId) ?? null : null;

  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "12px" }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
          Add-ons Manager
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          {addonsSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
          <button
            onClick={handleAddAddon}
            disabled={addonsSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: `0.5px solid ${BORDER}`, padding: "10px 16px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            + Add Add-on
          </button>
          <button
            onClick={saveAddons}
            disabled={addonsSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "10px 20px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            {addonsSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {addons.map((addon) => {
          const addonErrors = getAddonIssues(addon.id, "error");
          const addonWarnings = getAddonIssues(addon.id, "warning");
          const showErrors = validationAttempted && addonErrors.length > 0;
          const isExpanded = !isMobile && expandedAddonId === addon.id;

          return (
            <div
              key={addon.id}
              style={{
                border: `0.5px solid ${showErrors ? "rgba(224,112,112,0.45)" : isExpanded ? "rgba(197,164,109,0.25)" : "rgba(255,255,255,0.06)"}`,
                backgroundColor: isExpanded ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr) auto auto",
                  alignItems: "center",
                  gap: "12px",
                  padding: isMobile ? "12px" : "12px 14px",
                }}
              >
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

                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: LATO, fontSize: isMobile ? "14px" : "13px", color: addon.enabled ? "#FFFFFF" : "rgba(255,255,255,0.55)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {addon.label.trim() || "New add-on"}
                  </span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: LATO, fontSize: "11px", color: GOLD, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {priceSummary(addon)}
                  </span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {operationalSummary(addon)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpanded(addon.id)}
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer", justifySelf: isMobile ? "start" : "center" }}
                >
                  {expandedAddonId === addon.id ? "Close" : "Edit"}
                </button>

                <button
                  type="button"
                  onClick={() => removeAddon(addon.id)}
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#d9a2a2", backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer", justifySelf: isMobile ? "start" : "end" }}
                >
                  Remove
                </button>
              </div>

              {isExpanded && (
                <div style={{ padding: isMobile ? "0 12px 12px" : "0 14px 14px", borderTop: "0.5px solid rgba(255,255,255,0.06)", display: "grid", gap: "14px" }}>
                  <div style={{ display: "grid", gap: "10px", paddingTop: "14px" }}>
                    {fieldLabel("Pricing")}
                    <div style={{ display: "grid", gridTemplateColumns: expandedGridColumns, gap: "10px" }}>
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
                      Strict: blocks booking if rule is not satisfied. Soft: allows booking but flags it for review. None: no operational restriction.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: operationsGridColumns, gap: "10px" }}>
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

                  <div style={{ display: "grid", gap: "10px" }}>
                    {fieldLabel("Advanced details")}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr)", gap: "10px" }}>
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
                    </div>
                  </div>

                  {(showErrors || addonWarnings.length > 0) && (
                    <div style={{ display: "grid", gap: "4px" }}>
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isMobile && editingAddon && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(10,10,10,0.72)",
          zIndex: 1000,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}>
          <div style={{
            width: "100%",
            maxHeight: "92vh",
            backgroundColor: MIDNIGHT,
            borderTop: `0.5px solid ${BORDER}`,
            padding: "16px 16px 0",
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
            gap: "14px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>
                  Edit Add-on
                </p>
                <p style={{ fontFamily: LATO, fontSize: "16px", color: "#FFFFFF", margin: 0, lineHeight: 1.4, wordBreak: "break-word" }}>
                  {editingAddon.label.trim() || "New add-on"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedAddonId(null)}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "none", padding: "4px 0", cursor: "pointer", flexShrink: 0 }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowY: "auto", display: "grid", gap: "16px", paddingBottom: "8px" }}>
              <div style={{ display: "grid", gap: "10px" }}>
                {fieldLabel("Pricing")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Currency")}
                    <select
                      value={editingAddon.currency}
                      onChange={e => updateAddon(editingAddon.id, { currency: e.target.value })}
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", cursor: "pointer", opacity: editingAddon.enabled ? 1 : 0.5, minHeight: "48px" }}
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
                      value={editingAddon.price ?? ""}
                      onChange={e => updateAddon(editingAddon.id, { price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      placeholder="Price"
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", minHeight: "48px", ...getFieldStatusStyle(editingAddon.id, "price", editingAddon.enabled) }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    />
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Pricing model")}
                    <select
                      value={editingAddon.pricing_model}
                      onChange={e => updateAddon(editingAddon.id, { pricing_model: e.target.value as Addon["pricing_model"] })}
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", cursor: "pointer", minHeight: "48px", ...getFieldStatusStyle(editingAddon.id, "pricing_model", editingAddon.enabled) }}
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
                  Strict: blocks booking if rule is not satisfied. Soft: allows booking but flags it for review. None: no operational restriction.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Advance notice required")}
                    <input
                      type="number"
                      min={0}
                      value={getAmount(editingAddon)}
                      onChange={e => updatePreparationAmount(editingAddon, e.target.value)}
                      placeholder="Prep time"
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", minHeight: "48px", ...getFieldStatusStyle(editingAddon.id, "preparation_time_hours", editingAddon.enabled) }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    />
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Unit")}
                    <select
                      value={getUnit(editingAddon)}
                      onChange={e => updatePreparationUnit(editingAddon, e.target.value as PreparationUnit)}
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", cursor: "pointer", opacity: editingAddon.enabled ? 1 : 0.5, minHeight: "48px" }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    >
                      <option value="hours" style={{ backgroundColor: MIDNIGHT }}>hours</option>
                      <option value="days" style={{ backgroundColor: MIDNIGHT }}>days</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Booking rule")}
                    <select
                      value={getAddonEnforcementMode(editingAddon.enforcement_mode)}
                      onChange={e => updateAddon(editingAddon.id, { enforcement_mode: e.target.value as AddonEnforcementMode })}
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", cursor: "pointer", minHeight: "48px", ...getFieldStatusStyle(editingAddon.id, "enforcement_mode", editingAddon.enabled) }}
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
                  <label style={{ display: "grid", gap: "8px", alignContent: "start", fontFamily: LATO, fontSize: "12px", color: editingAddon.enabled ? MUTED : "rgba(138,128,112,0.5)", cursor: "pointer" }}>
                    {fieldLabel("Needs manager approval")}
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", padding: "0 2px" }}>
                      <input
                        type="checkbox"
                        checked={editingAddon.requires_approval ?? false}
                        onChange={e => updateAddon(editingAddon.id, { requires_approval: e.target.checked })}
                        style={{ accentColor: GOLD, width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <span>Needs manager approval</span>
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {fieldLabel("Advanced details")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {fieldLabel("Category")}
                    <select
                      value={editingAddon.category ?? ""}
                      onChange={e => updateAddon(editingAddon.id, { category: e.target.value === "" ? null : e.target.value as AddonCategory })}
                      style={{ ...fieldStyle, padding: "12px 14px", fontSize: "14px", cursor: "pointer", opacity: editingAddon.enabled ? 1 : 0.5, minHeight: "48px" }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                    >
                      <option value="" style={{ backgroundColor: MIDNIGHT }}>Category</option>
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} style={{ backgroundColor: MIDNIGHT }}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {((validationAttempted && getAddonIssues(editingAddon.id, "error").length > 0) || getAddonIssues(editingAddon.id, "warning").length > 0) && (
                <div style={{ display: "grid", gap: "4px" }}>
                  {validationAttempted && getAddonIssues(editingAddon.id, "error").map((issue, index) => (
                    <p key={`mobile-error-${issue.message}-${index}`} style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070", margin: 0, lineHeight: 1.5 }}>
                      {issue.message}
                    </p>
                  ))}
                  {getAddonIssues(editingAddon.id, "warning").map((issue, index) => (
                    <p key={`mobile-warning-${issue.message}-${index}`} style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.5 }}>
                      {issue.message}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div style={{
              position: "sticky",
              bottom: 0,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              padding: "12px 0 16px",
              backgroundColor: MIDNIGHT,
            }}>
              <button
                type="button"
                onClick={() => setExpandedAddonId(null)}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: `0.5px solid ${BORDER}`, padding: "14px 16px", cursor: "pointer" }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={saveAddons}
                disabled={addonsSaving}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "14px 16px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1 }}
              >
                {addonsSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addons.length === 0 && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>No add-ons loaded.</p>
      )}
    </div>
  );
}
