"use client";
import type { VillaBasePricing, SeasonalOverride } from "@/lib/admin-pricing";
import { BORDER, CHARCOAL, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, fieldStyle } from "./theme";

function priceInputValue(value: number | null) {
  return value ?? "";
}

function newSeasonId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function blankSeason(): SeasonalOverride {
  return {
    id:            newSeasonId(),
    start_date:    "",
    end_date:      "",
    base_price:    null,
    weekday_price: null,
    weekend_price: null,
    minimum_stay:  null,
  };
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
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.75rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
            Base pricing
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
            Admin-only nightly pricing foundation in USD. Base price is required per villa, while weekday price, weekend price, and minimum stay remain optional.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          {pricingSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
          <button
            onClick={savePricing}
            disabled={pricingSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "12px 24px", cursor: pricingSaving ? "not-allowed" : "pointer", opacity: pricingSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
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
                Currency: USD | Seasonal overrides stored: {villaPricing.seasonal_overrides.length}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div>
                <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                  Base price
                </label>
                <input
                  type="number"
                  min={0}
                  required
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
                  Weekday price
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
                  Minimum stay (nights)
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

            <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `0.5px solid rgba(255,255,255,0.04)` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                <div>
                  <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>
                    Seasonal pricing
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                    Dates inside a seasonal range use these rates instead of the base/weekday/weekend values above. Leave a price empty to fall back to the villa-level rate.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updatePricing(villaPricing.villa, {
                    seasonal_overrides: [...villaPricing.seasonal_overrides, blankSeason()],
                  })}
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: `0.5px solid ${GOLD}`, padding: "8px 14px", cursor: "pointer" }}
                >
                  + Add season
                </button>
              </div>

              {villaPricing.seasonal_overrides.length === 0 ? (
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                  No seasonal periods configured.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {villaPricing.seasonal_overrides.map((season, idx) => {
                    const patchSeason = (patch: Partial<SeasonalOverride>) => {
                      const next = villaPricing.seasonal_overrides.map((s, i) =>
                        i === idx ? { ...s, ...patch } : s,
                      );
                      updatePricing(villaPricing.villa, { seasonal_overrides: next });
                    };
                    const removeSeason = () => {
                      const next = villaPricing.seasonal_overrides.filter((_, i) => i !== idx);
                      updatePricing(villaPricing.villa, { seasonal_overrides: next });
                    };
                    return (
                      <div key={season.id} style={{ border: `0.5px solid ${BORDER}`, padding: "12px", backgroundColor: "rgba(255,255,255,0.01)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                          <div>
                            <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                              Start date
                            </label>
                            <input
                              type="date"
                              value={season.start_date}
                              onChange={(e) => patchSeason({ start_date: e.target.value })}
                              style={fieldStyle}
                              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                            />
                          </div>
                          <div>
                            <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                              End date
                            </label>
                            <input
                              type="date"
                              value={season.end_date}
                              onChange={(e) => patchSeason({ end_date: e.target.value })}
                              style={fieldStyle}
                              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                            />
                          </div>
                          <div>
                            <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                              Base price
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={priceInputValue(season.base_price)}
                              onChange={(e) => patchSeason({ base_price: e.target.value === "" ? null : Number(e.target.value) })}
                              placeholder="-"
                              style={fieldStyle}
                              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                            />
                          </div>
                          <div>
                            <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                              Weekday price
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={priceInputValue(season.weekday_price)}
                              onChange={(e) => patchSeason({ weekday_price: e.target.value === "" ? null : Number(e.target.value) })}
                              placeholder="-"
                              style={fieldStyle}
                              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                            />
                          </div>
                          <div>
                            <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                              Weekend price
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={priceInputValue(season.weekend_price)}
                              onChange={(e) => patchSeason({ weekend_price: e.target.value === "" ? null : Number(e.target.value) })}
                              placeholder="-"
                              style={fieldStyle}
                              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                            />
                          </div>
                          <div>
                            <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                              Minimum stay
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={priceInputValue(season.minimum_stay)}
                              onChange={(e) => patchSeason({ minimum_stay: e.target.value === "" ? null : Number(e.target.value) })}
                              placeholder="-"
                              style={fieldStyle}
                              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
                            />
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                          <button
                            type="button"
                            onClick={removeSeason}
                            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#e07070", backgroundColor: "transparent", border: "0.5px solid rgba(224,112,112,0.35)", padding: "6px 12px", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
