"use client";
import { useMemo } from "react";
import type { VillaBasePricing, SeasonalOverride } from "@/lib/admin-pricing";
import { validatePricing, type ValidationIssue, type ValidationField } from "@/lib/pricing/validation";
import { calculateStayPricing } from "@/lib/pricing/engine";
import type { NightSource } from "@/lib/pricing/types";
import { BORDER, CHARCOAL, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, fieldStyle } from "./theme";

const ERROR_RED   = "#e07070";
const WARN_AMBER  = "#e0b070";
const REST_BORDER = "rgba(197,164,109,0.25)";

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

// ── Sample preview (display-only) ──────────────────────────────────────────
// Static reference night used to show admins how the engine resolves a
// representative date with the current rates. 2026-08-14 is a Friday in UTC,
// so it surfaces weekend / seasonal / base resolution with a single call.
const SAMPLE_CHECK_IN  = "2026-08-14";
const SAMPLE_CHECK_OUT = "2026-08-15";
const SAMPLE_MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SAMPLE_DAYS      = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function sampleLabel(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${SAMPLE_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} (${SAMPLE_DAYS[date.getUTCDay()]})`;
}

function sampleSourceLabel(source: NightSource): string {
  switch (source) {
    case "seasonal": return "Seasonal";
    case "weekend":  return "Weekend";
    case "weekday":  return "Weekday";
    case "base":     return "Base";
    case "unpriced": return "Not priced";
  }
}

function findFieldIssue(
  issues:    ValidationIssue[],
  scope:     "villa" | "season",
  seasonId:  string | undefined,
  field:     ValidationField,
): ValidationIssue | undefined {
  return issues.find(
    (i) => i.scope === scope && i.season_id === seasonId && i.field === field,
  );
}

function FieldHelper({ issue }: { issue: ValidationIssue | undefined }) {
  if (!issue) return null;
  return (
    <p style={{ fontFamily: LATO, fontSize: "10px", color: issue.level === "error" ? ERROR_RED : WARN_AMBER, margin: "4px 0 0", lineHeight: 1.5 }}>
      {issue.message}
    </p>
  );
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

  const issuesByVilla = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    for (const p of pricing) map.set(p.villa, validatePricing(p));
    return map;
  }, [pricing]);

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
        {pricing.map((villaPricing) => {
          const issues       = issuesByVilla.get(villaPricing.villa) ?? [];
          const issueCount   = issues.length;
          const villaIssue   = (field: ValidationField) => findFieldIssue(issues, "villa", undefined, field);

          const baseIssue    = villaIssue("base_price");
          const weekendIssue = villaIssue("weekend_price");
          const weekdayIssue = villaIssue("weekday_price");
          const minStayIssue = villaIssue("minimum_stay");

          const baseRest    = baseIssue    ? ERROR_RED : REST_BORDER;
          const weekendRest = weekendIssue ? ERROR_RED : REST_BORDER;
          const weekdayRest = weekdayIssue ? ERROR_RED : REST_BORDER;
          const minStayRest = minStayIssue ? ERROR_RED : REST_BORDER;

          const sample = calculateStayPricing(
            {
              base_price:         villaPricing.base_price,
              weekday_price:      villaPricing.weekday_price,
              weekend_price:      villaPricing.weekend_price,
              minimum_stay:       villaPricing.minimum_stay,
              seasonal_overrides: villaPricing.seasonal_overrides,
            },
            { check_in: SAMPLE_CHECK_IN, check_out: SAMPLE_CHECK_OUT },
          );
          const sampleNight = sample.nightly[0] ?? null;

          return (
            <div key={villaPricing.villa} style={{ border: `0.5px solid ${BORDER}`, padding: "1.25rem" }}>
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "1.4rem", color: GOLD, margin: "0 0 4px" }}>
                  {villaPricing.villa}
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                  Currency: USD | Seasonal overrides stored: {villaPricing.seasonal_overrides.length}
                  {issueCount > 0 && (
                    <span style={{ color: WARN_AMBER }}>
                      {" | "}{issueCount} issue{issueCount === 1 ? "" : "s"} to review
                    </span>
                  )}
                </p>
                {sampleNight && (
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "4px 0 0" }}>
                    Sample: {sampleLabel(sampleNight.date)} → {sampleNight.price === null ? "Not priced" : `$${sampleNight.price.toLocaleString()}`} ({sampleSourceLabel(sampleNight.source)})
                  </p>
                )}
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
                    style={{ ...fieldStyle, borderColor: baseRest }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = baseRest; }}
                  />
                  <FieldHelper issue={baseIssue} />
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
                    style={{ ...fieldStyle, borderColor: weekendRest }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = weekendRest; }}
                  />
                  <FieldHelper issue={weekendIssue} />
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
                    style={{ ...fieldStyle, borderColor: weekdayRest }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = weekdayRest; }}
                  />
                  <FieldHelper issue={weekdayIssue} />
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
                    style={{ ...fieldStyle, borderColor: minStayRest }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = minStayRest; }}
                  />
                  <FieldHelper issue={minStayIssue} />
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

                      const seasonIssues   = issues.filter((i) => i.scope === "season" && i.season_id === season.id);
                      const seasonHasError = seasonIssues.some((i) => i.level === "error");
                      const startIssue     = findFieldIssue(issues, "season", season.id, "start_date");
                      const endIssue       = findFieldIssue(issues, "season", season.id, "end_date");
                      const sBaseIssue     = findFieldIssue(issues, "season", season.id, "base_price");
                      const sWeekdayIssue  = findFieldIssue(issues, "season", season.id, "weekday_price");
                      const sWeekendIssue  = findFieldIssue(issues, "season", season.id, "weekend_price");
                      const sMinStayIssue  = findFieldIssue(issues, "season", season.id, "minimum_stay");

                      const startRest    = startIssue    ? ERROR_RED : REST_BORDER;
                      const endRest      = endIssue      ? ERROR_RED : REST_BORDER;
                      const sBaseRest    = sBaseIssue    ? ERROR_RED : REST_BORDER;
                      const sWeekdayRest = sWeekdayIssue ? ERROR_RED : REST_BORDER;
                      const sWeekendRest = sWeekendIssue ? ERROR_RED : REST_BORDER;
                      const sMinStayRest = sMinStayIssue ? ERROR_RED : REST_BORDER;

                      return (
                        <div key={season.id} style={{ border: `0.5px solid ${BORDER}`, padding: "12px", backgroundColor: "rgba(255,255,255,0.01)" }}>
                          {seasonIssues.length > 0 && (
                            <div style={{ marginBottom: "10px", padding: "8px 10px", border: `0.5px solid ${seasonHasError ? "rgba(224,112,112,0.3)" : "rgba(224,176,112,0.3)"}`, backgroundColor: seasonHasError ? "rgba(224,112,112,0.05)" : "rgba(224,176,112,0.04)" }}>
                              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: seasonHasError ? ERROR_RED : WARN_AMBER, margin: "0 0 6px" }}>
                                {seasonIssues.length} {seasonIssues.length === 1 ? "issue" : "issues"}
                              </p>
                              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                                {seasonIssues.map((iss, iIdx) => (
                                  <li
                                    key={`${iss.field ?? "general"}-${iIdx}`}
                                    style={{ fontFamily: LATO, fontSize: "11px", color: iss.level === "error" ? ERROR_RED : WARN_AMBER, lineHeight: 1.5 }}
                                  >
                                    {iss.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                            <div>
                              <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                                Start date
                              </label>
                              <input
                                type="date"
                                value={season.start_date}
                                onChange={(e) => patchSeason({ start_date: e.target.value })}
                                style={{ ...fieldStyle, borderColor: startRest }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = startRest; }}
                              />
                              <FieldHelper issue={startIssue} />
                            </div>
                            <div>
                              <label style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                                End date
                              </label>
                              <input
                                type="date"
                                value={season.end_date}
                                onChange={(e) => patchSeason({ end_date: e.target.value })}
                                style={{ ...fieldStyle, borderColor: endRest }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = endRest; }}
                              />
                              <FieldHelper issue={endIssue} />
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
                                style={{ ...fieldStyle, borderColor: sBaseRest }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = sBaseRest; }}
                              />
                              <FieldHelper issue={sBaseIssue} />
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
                                style={{ ...fieldStyle, borderColor: sWeekdayRest }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = sWeekdayRest; }}
                              />
                              <FieldHelper issue={sWeekdayIssue} />
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
                                style={{ ...fieldStyle, borderColor: sWeekendRest }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = sWeekendRest; }}
                              />
                              <FieldHelper issue={sWeekendIssue} />
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
                                style={{ ...fieldStyle, borderColor: sMinStayRest }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = sMinStayRest; }}
                              />
                              <FieldHelper issue={sMinStayIssue} />
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                            <button
                              type="button"
                              onClick={removeSeason}
                              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: ERROR_RED, backgroundColor: "transparent", border: "0.5px solid rgba(224,112,112,0.35)", padding: "6px 12px", cursor: "pointer" }}
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
          );
        })}
      </div>
    </div>
  );
}
