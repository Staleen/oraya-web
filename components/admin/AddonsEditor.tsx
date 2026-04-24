"use client";
import type { Addon } from "./types";
import { GOLD, CHARCOAL, MIDNIGHT, MUTED, LATO, SURFACE, BORDER, fieldStyle } from "./theme";

const PRICING_MODELS: { value: Addon["pricing_model"]; label: string }[] = [
  { value: "flat_fee",           label: "Flat fee"          },
  { value: "per_night",          label: "Per night"         },
  { value: "per_person_per_day", label: "Per person / day"  },
  { value: "per_unit",           label: "Per unit"          },
];

const CURRENCIES = ["USD", "EUR", "GBP", "LBP"];

export default function AddonsEditor({
  addons, addonsSaving, addonsSaved, updateAddon, saveAddons,
}: {
  addons: Addon[];
  addonsSaving: boolean;
  addonsSaved: boolean;
  updateAddon: (id: string, patch: Partial<Addon>) => void;
  saveAddons: () => void;
}) {
  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.75rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
          Add-ons
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {addonsSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
          <button
            onClick={saveAddons}
            disabled={addonsSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "10px 24px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1 }}
          >
            {addonsSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 110px 160px", gap: "10px", alignItems: "center", paddingBottom: "10px", borderBottom: `0.5px solid ${BORDER}`, marginBottom: "8px" }}>
        {["On", "Name", "Currency", "Price", "Pricing model"].map(h => (
          <span key={h} style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED }}>{h}</span>
        ))}
      </div>

      {/* Addon rows */}
      {addons.map(addon => (
        <div
          key={addon.id}
          style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 110px 160px", gap: "10px", alignItems: "center", padding: "10px 0", borderBottom: `0.5px solid rgba(255,255,255,0.03)` }}
        >
          {/* Enabled toggle */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={addon.enabled}
              onChange={e => updateAddon(addon.id, { enabled: e.target.checked })}
              style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
            />
          </div>

          {/* Label */}
          <input
            type="text"
            value={addon.label}
            onChange={e => updateAddon(addon.id, { label: e.target.value })}
            style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
            onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
          />

          {/* Currency */}
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

          {/* Price */}
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

          {/* Pricing model */}
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
      ))}

      {addons.length === 0 && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>No add-ons loaded.</p>
      )}
    </div>
  );
}
