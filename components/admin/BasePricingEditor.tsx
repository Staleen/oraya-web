"use client";
import type { VillaBasePricing } from "@/lib/admin-pricing";
import { BORDER, CHARCOAL, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, fieldStyle } from "./theme";

function priceInputValue(value: number | null) {
  return value ?? "";
}

export default function BasePricingEditor({
  pricing,
  pricingSaving,
  pricingSaved,
  updatePricing,
  savePricing,
}: {
  pricing: VillaBasePricing[];
  pricingSaving: boolean;
  pricingSaved: boolean;
  updatePricing: (villa: string, patch: Partial<VillaBasePricing>) => void;
  savePricing: () => void;
}) {
  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.75rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
            Base pricing
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
            Manual nightly pricing foundation only. Seasonal overrides are stored structurally for future use, with no booking flow integration yet.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {pricingSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
          <button
            onClick={savePricing}
            disabled={pricingSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "10px 24px", cursor: pricingSaving ? "not-allowed" : "pointer", opacity: pricingSaving ? 0.7 : 1 }}
          >
            {pricingSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "16px" }}>
        {pricing.map((villaPricing) => (
          <div key={villaPricing.villa} style={{ border: `0.5px solid ${BORDER}`, padding: "1.25rem" }}>
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontFamily: PLAYFAIR, fontSize: "1.4rem", color: GOLD, margin: "0 0 4px" }}>
                {villaPricing.villa}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                Seasonal overrides stored: {villaPricing.seasonal_overrides.length}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div>
                <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                  Base price
                </label>
                <input
                  type="number"
                  min={0}
                  value={priceInputValue(villaPricing.base_price)}
                  onChange={(e) => updatePricing(villaPricing.villa, { base_price: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="-"
                  style={fieldStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
              </div>

              <div>
                <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                  Weekend price
                </label>
                <input
                  type="number"
                  min={0}
                  value={priceInputValue(villaPricing.weekend_price)}
                  onChange={(e) => updatePricing(villaPricing.villa, { weekend_price: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="-"
                  style={fieldStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
              </div>

              <div>
                <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                  Weekday price override
                </label>
                <input
                  type="number"
                  min={0}
                  value={priceInputValue(villaPricing.weekday_price)}
                  onChange={(e) => updatePricing(villaPricing.villa, { weekday_price: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="-"
                  style={fieldStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
              </div>

              <div>
                <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                  Minimum stay
                </label>
                <input
                  type="number"
                  min={1}
                  value={priceInputValue(villaPricing.minimum_stay)}
                  onChange={(e) => updatePricing(villaPricing.villa, { minimum_stay: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="-"
                  style={fieldStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
