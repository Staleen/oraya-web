"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VillaBasePricing, SeasonalOverride } from "@/lib/admin-pricing";
import { validatePricing, type ValidationIssue, type ValidationField } from "@/lib/pricing/validation";
import { calculateStayPricing } from "@/lib/pricing/engine";
import type { NightSource } from "@/lib/pricing/types";
import { BORDER, CHARCOAL, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, fieldStyle, MIDNIGHT } from "./theme";

const ERROR_RED = "#e07070";
const WARN_AMBER = "#e0b070";
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
    id: newSeasonId(),
    start_date: "",
    end_date: "",
    base_price: null,
    weekday_price: null,
    weekend_price: null,
    minimum_stay: null,
  };
}

const SAMPLE_CHECK_IN = "2026-08-14";
const SAMPLE_CHECK_OUT = "2026-08-15";
const SAMPLE_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SAMPLE_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

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
    case "weekend": return "Weekend";
    case "weekday": return "Weekday";
    case "base": return "Base";
    case "unpriced": return "Not priced";
  }
}

function findFieldIssue(
  issues: ValidationIssue[],
  scope: "villa" | "season",
  seasonId: string | undefined,
  field: ValidationField,
): ValidationIssue | undefined {
  return issues.find((i) => i.scope === scope && i.season_id === seasonId && i.field === field);
}

function FieldHelper({ issue }: { issue: ValidationIssue | undefined }) {
  if (!issue) return null;
  return (
    <p style={{ fontFamily: LATO, fontSize: "10px", color: issue.level === "error" ? ERROR_RED : WARN_AMBER, margin: "4px 0 0", lineHeight: 1.5 }}>
      {issue.message}
    </p>
  );
}

function sectionLabel(label: string) {
  return (
    <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
      {label}
    </p>
  );
}

function priceSummary(value: number | null) {
  return value === null ? "-" : `$${value.toLocaleString()}`;
}

function seasonalRowSummary(season: SeasonalOverride) {
  const dateRange = season.start_date && season.end_date
    ? `${season.start_date} to ${season.end_date}`
    : season.start_date || season.end_date || "Dates not set";
  return {
    dateRange,
    base: priceSummary(season.base_price),
    weekday: priceSummary(season.weekday_price),
    weekend: priceSummary(season.weekend_price),
    minimum: season.minimum_stay ?? "-",
  };
}

export default function BasePricingEditor({
  pricing,
  pricingSaving,
  pricingSaved,
  updatePricing,
  savePricing,
  pricingValidationAttempted,
}: {
  pricing: VillaBasePricing[];
  pricingSaving: boolean;
  pricingSaved: boolean;
  updatePricing: (villa: string, patch: Partial<VillaBasePricing>) => void;
  savePricing: () => void;
  pricingValidationAttempted: boolean;
}) {
  const [expandedVilla, setExpandedVilla] = useState<string | null>(null);
  const [expandedSeasonByVilla, setExpandedSeasonByVilla] = useState<Record<string, string | null>>({});
  const previousSeasonIdsRef = useRef<Record<string, string[]>>({});
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;

  const issuesByVilla = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    for (const p of pricing) map.set(p.villa, validatePricing(p));
    return map;
  }, [pricing]);

  const summary = useMemo(() => {
    const villasConfigured = pricing.length;
    const baseRates = pricing.map((item) => item.base_price).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const averageBaseRate = baseRates.length > 0 ? Math.round(baseRates.reduce((sum, value) => sum + value, 0) / baseRates.length) : null;
    const totalSeasonalOverrides = pricing.reduce((sum, item) => sum + item.seasonal_overrides.length, 0);
    const minimumNights = pricing.map((item) => item.minimum_stay).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const minimumStaySummary = minimumNights.length > 0 ? `${Math.min(...minimumNights)}-${Math.max(...minimumNights)} nights` : "Not set";
    return { villasConfigured, averageBaseRate, totalSeasonalOverrides, minimumStaySummary };
  }, [pricing]);

  useEffect(() => {
    if (pricingSaved) {
      setExpandedVilla(null);
      setExpandedSeasonByVilla({});
    }
  }, [pricingSaved]);

  useEffect(() => {
    const nextPrevious: Record<string, string[]> = {};
    setExpandedSeasonByVilla((current) => {
      let changed = false;
      const next = { ...current };

      for (const villaPricing of pricing) {
        const seasonIds = villaPricing.seasonal_overrides.map((season) => season.id);
        const previousIds = previousSeasonIdsRef.current[villaPricing.villa] ?? [];
        const newSeason = villaPricing.seasonal_overrides.find((season) => !previousIds.includes(season.id));

        if (newSeason) {
          next[villaPricing.villa] = newSeason.id;
          changed = true;
        } else if (next[villaPricing.villa] && !seasonIds.includes(next[villaPricing.villa] as string)) {
          next[villaPricing.villa] = null;
          changed = true;
        } else if (next[villaPricing.villa] === undefined) {
          next[villaPricing.villa] = null;
          changed = true;
        }

        nextPrevious[villaPricing.villa] = seasonIds;
      }

      previousSeasonIdsRef.current = nextPrevious;
      return changed ? next : current;
    });
  }, [pricing]);

  function toggleVilla(villa: string) {
    setExpandedVilla((current) => current === villa ? null : villa);
  }

  function toggleSeason(villa: string, seasonId: string) {
    setExpandedSeasonByVilla((current) => ({
      ...current,
      [villa]: current[villa] === seasonId ? null : seasonId,
    }));
  }

  function addSeason(villaPricing: VillaBasePricing) {
    const newSeason = blankSeason();
    updatePricing(villaPricing.villa, {
      seasonal_overrides: [...villaPricing.seasonal_overrides, newSeason],
    });
    setExpandedVilla(villaPricing.villa);
    setExpandedSeasonByVilla((current) => ({
      ...current,
      [villaPricing.villa]: newSeason.id,
    }));
  }

  function samplePreview(villaPricing: VillaBasePricing) {
    const sample = calculateStayPricing(
      {
        base_price: villaPricing.base_price,
        weekday_price: villaPricing.weekday_price,
        weekend_price: villaPricing.weekend_price,
        minimum_stay: villaPricing.minimum_stay,
        seasonal_overrides: villaPricing.seasonal_overrides,
      },
      { check_in: SAMPLE_CHECK_IN, check_out: SAMPLE_CHECK_OUT },
    );
    return sample.nightly[0] ?? null;
  }

  const editingVilla = isMobile && expandedVilla
    ? pricing.find((item) => item.villa === expandedVilla) ?? null
    : null;

  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
            Rates Manager
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
            Admin-only nightly pricing in USD. Configure standard rates once, then add seasonal periods only where needed.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          {pricingSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
          <button
            onClick={savePricing}
            disabled={pricingSaving}
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "10px 20px", cursor: pricingSaving ? "not-allowed" : "pointer", opacity: pricingSaving ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            {pricingSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: "10px", marginBottom: "16px" }}>
        {[
          { label: "Villas configured", value: summary.villasConfigured },
          { label: "Average base rate", value: summary.averageBaseRate === null ? "-" : `$${summary.averageBaseRate}` },
          { label: "Seasonal periods", value: summary.totalSeasonalOverrides },
          { label: "Minimum nights", value: summary.minimumStaySummary },
        ].map((item) => (
          <div key={item.label} style={{ border: `0.5px solid rgba(255,255,255,0.06)`, backgroundColor: "rgba(255,255,255,0.02)", padding: "12px 14px" }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 6px" }}>
              {item.label}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "18px", color: GOLD, margin: 0 }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {pricing.map((villaPricing) => {
          const issues = issuesByVilla.get(villaPricing.villa) ?? [];
          const issueCount = issues.length;
          const errorCount = issues.filter((issue) => issue.level === "error").length;
          const villaHasErrors = errorCount > 0;
          const sampleNight = samplePreview(villaPricing);
          const isExpanded = !isMobile && expandedVilla === villaPricing.villa;
          const seasonalCount = villaPricing.seasonal_overrides.length;
          const mobileLabelStyle = {
            fontFamily: LATO,
            fontSize: "8px",
            letterSpacing: "1.6px",
            textTransform: "uppercase" as const,
            color: MUTED,
            display: "block",
            marginBottom: "4px",
          };
          const mobileValueStyle = {
            fontFamily: LATO,
            fontSize: "12px",
            color: "#FFFFFF",
            display: "block",
          };

          return (
            <div
              key={villaPricing.villa}
              style={{
                border: `0.5px solid ${villaHasErrors && pricingValidationAttempted ? "rgba(224,112,112,0.45)" : isExpanded ? "rgba(197,164,109,0.25)" : "rgba(255,255,255,0.06)"}`,
                backgroundColor: isExpanded ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "minmax(0, 1.05fr) minmax(132px, 0.95fr)" : "minmax(0, 1.2fr) repeat(4, minmax(110px, 0.65fr)) minmax(130px, 0.8fr) auto",
                  alignItems: "center",
                  gap: "12px",
                  padding: isMobile ? "12px" : "12px 14px",
                }}
              >
                {isMobile ? (
                  <>
                    <div style={{ minWidth: 0, display: "grid", gap: "8px", alignContent: "start" }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: PLAYFAIR, fontSize: "1.15rem", color: GOLD, margin: "0 0 4px", lineHeight: 1.2 }}>
                          {villaPricing.villa}
                        </p>
                        <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.45 }}>
                          {sampleNight
                            ? `Sample ${sampleLabel(sampleNight.date)} -> ${sampleNight.price === null ? "Not priced" : `$${sampleNight.price.toLocaleString()}`} (${sampleSourceLabel(sampleNight.source)})`
                            : "Sample preview unavailable"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleVilla(villaPricing.villa)}
                        style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer", justifySelf: "start" }}
                      >
                        {expandedVilla === villaPricing.villa ? "Close" : "Edit"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", alignContent: "start" }}>
                      <div>
                        <span style={mobileLabelStyle}>Standard nightly rate</span>
                        <span style={mobileValueStyle}>{priceSummary(villaPricing.base_price)}</span>
                      </div>
                      <div>
                        <span style={mobileLabelStyle}>Weekday rate</span>
                        <span style={mobileValueStyle}>{priceSummary(villaPricing.weekday_price)}</span>
                      </div>
                      <div>
                        <span style={mobileLabelStyle}>Weekend rate</span>
                        <span style={mobileValueStyle}>{priceSummary(villaPricing.weekend_price)}</span>
                      </div>
                      <div>
                        <span style={mobileLabelStyle}>Minimum nights</span>
                        <span style={mobileValueStyle}>{villaPricing.minimum_stay ?? "-"}</span>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <span style={mobileLabelStyle}>Seasonal periods</span>
                        <span style={mobileValueStyle}>
                          {seasonalCount}
                          {issueCount > 0 && (
                            <span style={{ color: WARN_AMBER }}> | {issueCount} issue{issueCount === 1 ? "" : "s"}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: "1.15rem", color: GOLD, margin: "0 0 4px" }}>
                        {villaPricing.villa}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                        {sampleNight
                          ? `Sample ${sampleLabel(sampleNight.date)} -> ${sampleNight.price === null ? "Not priced" : `$${sampleNight.price.toLocaleString()}`} (${sampleSourceLabel(sampleNight.source)})`
                          : "Sample preview unavailable"}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Standard nightly rate
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: "#FFFFFF" }}>
                        {priceSummary(villaPricing.base_price)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Weekday rate
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: "#FFFFFF" }}>
                        {priceSummary(villaPricing.weekday_price)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Weekend rate
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: "#FFFFFF" }}>
                        {priceSummary(villaPricing.weekend_price)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Minimum nights
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: "#FFFFFF" }}>
                        {villaPricing.minimum_stay ?? "-"}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Seasonal periods
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: "#FFFFFF" }}>
                        {seasonalCount}
                        {issueCount > 0 && (
                          <span style={{ color: WARN_AMBER }}> | {issueCount} issue{issueCount === 1 ? "" : "s"}</span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleVilla(villaPricing.villa)}
                      style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer", justifySelf: "end" }}
                    >
                      {expandedVilla === villaPricing.villa ? "Close" : "Edit"}
                    </button>
                  </>
                )}
              </div>

              {isExpanded && (
                <div style={{ padding: "0 14px 14px", borderTop: "0.5px solid rgba(255,255,255,0.06)", display: "grid", gap: "16px" }}>
                  <VillaPricingFields
                    isMobile={false}
                    villaPricing={villaPricing}
                    issues={issues}
                    pricingValidationAttempted={pricingValidationAttempted}
                    updatePricing={updatePricing}
                    addSeason={addSeason}
                    expandedSeasonId={expandedSeasonByVilla[villaPricing.villa] ?? null}
                    toggleSeason={toggleSeason}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isMobile && editingVilla && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(10,10,10,0.72)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: "100%", maxHeight: "92vh", backgroundColor: MIDNIGHT, borderTop: `0.5px solid ${BORDER}`, padding: "16px 16px 0", display: "grid", gridTemplateRows: "auto 1fr auto", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>
                  Edit Villa Pricing
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "1.2rem", color: GOLD, margin: 0 }}>
                  {editingVilla.villa}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedVilla(null)}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "none", padding: "4px 0", cursor: "pointer", flexShrink: 0 }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowY: "auto", display: "grid", gap: "16px", paddingBottom: "8px" }}>
              <VillaPricingFields
                isMobile
                villaPricing={editingVilla}
                issues={issuesByVilla.get(editingVilla.villa) ?? []}
                pricingValidationAttempted={pricingValidationAttempted}
                updatePricing={updatePricing}
                addSeason={addSeason}
                expandedSeasonId={expandedSeasonByVilla[editingVilla.villa] ?? null}
                toggleSeason={toggleSeason}
              />
            </div>

            <div style={{ position: "sticky", bottom: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "12px 0 16px", backgroundColor: MIDNIGHT }}>
              <button
                type="button"
                onClick={() => setExpandedVilla(null)}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: `0.5px solid ${BORDER}`, padding: "14px 16px", cursor: "pointer" }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={savePricing}
                disabled={pricingSaving}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "14px 16px", cursor: pricingSaving ? "not-allowed" : "pointer", opacity: pricingSaving ? 0.7 : 1 }}
              >
                {pricingSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VillaPricingFields({
  isMobile,
  villaPricing,
  issues,
  pricingValidationAttempted,
  updatePricing,
  addSeason,
  expandedSeasonId,
  toggleSeason,
}: {
  isMobile: boolean;
  villaPricing: VillaBasePricing;
  issues: ValidationIssue[];
  pricingValidationAttempted: boolean;
  updatePricing: (villa: string, patch: Partial<VillaBasePricing>) => void;
  addSeason: (villaPricing: VillaBasePricing) => void;
  expandedSeasonId: string | null;
  toggleSeason: (villa: string, seasonId: string) => void;
}) {
  const villaIssue = (field: ValidationField) => findFieldIssue(issues, "villa", undefined, field);
  const issueCount = issues.length;
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const villaHasErrors = errorCount > 0;
  const baseIssue = villaIssue("base_price");
  const weekendIssue = villaIssue("weekend_price");
  const weekdayIssue = villaIssue("weekday_price");
  const minStayIssue = villaIssue("minimum_stay");
  const columns = isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))";

  return (
    <>
      {pricingValidationAttempted && villaHasErrors && (
        <p style={{ fontFamily: LATO, fontSize: "11px", color: ERROR_RED, margin: "12px 0 0", lineHeight: 1.5 }}>
          Fix pricing errors before saving.
        </p>
      )}

      <div style={{ display: "grid", gap: "10px", paddingTop: isMobile ? 0 : "14px" }}>
        {sectionLabel("Base pricing")}
        <div style={{ display: "grid", gridTemplateColumns: columns, gap: "10px" }}>
          <div>
            {sectionLabel("Standard nightly rate")}
            <input
              type="number"
              min={0}
              required
              value={priceInputValue(villaPricing.base_price)}
              onChange={(e) => updatePricing(villaPricing.villa, { base_price: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="-"
              style={{ ...fieldStyle, borderColor: baseIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = baseIssue ? ERROR_RED : REST_BORDER; }}
            />
            <FieldHelper issue={baseIssue} />
          </div>
          <div>
            {sectionLabel("Weekday rate")}
            <input
              type="number"
              min={0}
              value={priceInputValue(villaPricing.weekday_price)}
              onChange={(e) => updatePricing(villaPricing.villa, { weekday_price: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="-"
              style={{ ...fieldStyle, borderColor: weekdayIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = weekdayIssue ? ERROR_RED : REST_BORDER; }}
            />
            <FieldHelper issue={weekdayIssue} />
          </div>
          <div>
            {sectionLabel("Weekend rate")}
            <input
              type="number"
              min={0}
              value={priceInputValue(villaPricing.weekend_price)}
              onChange={(e) => updatePricing(villaPricing.villa, { weekend_price: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="-"
              style={{ ...fieldStyle, borderColor: weekendIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = weekendIssue ? ERROR_RED : REST_BORDER; }}
            />
            <FieldHelper issue={weekendIssue} />
          </div>
          <div>
            {sectionLabel("Minimum nights")}
            <input
              type="number"
              min={1}
              value={priceInputValue(villaPricing.minimum_stay)}
              onChange={(e) => updatePricing(villaPricing.villa, { minimum_stay: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="-"
              style={{ ...fieldStyle, borderColor: minStayIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = minStayIssue ? ERROR_RED : REST_BORDER; }}
            />
            <FieldHelper issue={minStayIssue} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            {sectionLabel("Seasonal periods")}
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "6px 0 0" }}>
              Add seasonal periods only where rates or minimum nights differ from the standard pricing above.
            </p>
          </div>
          <button
            type="button"
            onClick={() => addSeason(villaPricing)}
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
                const next = villaPricing.seasonal_overrides.map((s, i) => (i === idx ? { ...s, ...patch } : s));
                updatePricing(villaPricing.villa, { seasonal_overrides: next });
              };

              const removeSeason = () => {
                const next = villaPricing.seasonal_overrides.filter((_, i) => i !== idx);
                updatePricing(villaPricing.villa, { seasonal_overrides: next });
              };

              const seasonIssues = issues.filter((i) => i.scope === "season" && i.season_id === season.id);
              const seasonHasError = seasonIssues.some((i) => i.level === "error");
              const startIssue = findFieldIssue(issues, "season", season.id, "start_date");
              const endIssue = findFieldIssue(issues, "season", season.id, "end_date");
              const sBaseIssue = findFieldIssue(issues, "season", season.id, "base_price");
              const sWeekdayIssue = findFieldIssue(issues, "season", season.id, "weekday_price");
              const sWeekendIssue = findFieldIssue(issues, "season", season.id, "weekend_price");
              const sMinStayIssue = findFieldIssue(issues, "season", season.id, "minimum_stay");
              const summary = seasonalRowSummary(season);
              const isExpanded = expandedSeasonId === season.id;

              return (
                <div key={season.id} style={{ border: `0.5px solid ${seasonHasError ? "rgba(224,112,112,0.35)" : "rgba(255,255,255,0.06)"}`, backgroundColor: isExpanded ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) repeat(4, minmax(90px, 0.7fr)) auto auto", gap: "12px", alignItems: "center", padding: "12px" }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: "#FFFFFF", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {summary.dateRange}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Standard
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "11px", color: "#FFFFFF" }}>{summary.base}</span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Weekday
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "11px", color: "#FFFFFF" }}>{summary.weekday}</span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Weekend
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "11px", color: "#FFFFFF" }}>{summary.weekend}</span>
                    </div>
                    <div>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "4px" }}>
                        Minimum nights
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "11px", color: "#FFFFFF" }}>{summary.minimum}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSeason(villaPricing.villa, season.id)}
                      style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer", justifySelf: isMobile ? "start" : "center" }}
                    >
                      {isExpanded ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={removeSeason}
                      style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: ERROR_RED, backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer", justifySelf: isMobile ? "start" : "end" }}
                    >
                      Remove
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "0 12px 12px", borderTop: "0.5px solid rgba(255,255,255,0.06)", display: "grid", gap: "10px" }}>
                      {seasonIssues.length > 0 && (
                        <div style={{ marginTop: "12px", padding: "8px 10px", border: `0.5px solid ${seasonHasError ? "rgba(224,112,112,0.3)" : "rgba(224,176,112,0.3)"}`, backgroundColor: seasonHasError ? "rgba(224,112,112,0.05)" : "rgba(224,176,112,0.04)" }}>
                          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: seasonHasError ? ERROR_RED : WARN_AMBER, margin: "0 0 6px" }}>
                            {seasonIssues.length} {seasonIssues.length === 1 ? "issue" : "issues"}
                          </p>
                          <ul style={{ margin: 0, paddingLeft: "16px" }}>
                            {seasonIssues.map((iss, iIdx) => (
                              <li key={`${iss.field ?? "general"}-${iIdx}`} style={{ fontFamily: LATO, fontSize: "11px", color: iss.level === "error" ? ERROR_RED : WARN_AMBER, lineHeight: 1.5 }}>
                                {iss.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginTop: seasonIssues.length > 0 ? 0 : "12px" }}>
                        <div>
                          {sectionLabel("Start date")}
                          <input
                            type="date"
                            value={season.start_date}
                            onChange={(e) => patchSeason({ start_date: e.target.value })}
                            style={{ ...fieldStyle, borderColor: startIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = startIssue ? ERROR_RED : REST_BORDER; }}
                          />
                          <FieldHelper issue={startIssue} />
                        </div>
                        <div>
                          {sectionLabel("End date")}
                          <input
                            type="date"
                            value={season.end_date}
                            onChange={(e) => patchSeason({ end_date: e.target.value })}
                            style={{ ...fieldStyle, borderColor: endIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = endIssue ? ERROR_RED : REST_BORDER; }}
                          />
                          <FieldHelper issue={endIssue} />
                        </div>
                        <div>
                          {sectionLabel("Standard nightly rate")}
                          <input
                            type="number"
                            min={0}
                            value={priceInputValue(season.base_price)}
                            onChange={(e) => patchSeason({ base_price: e.target.value === "" ? null : Number(e.target.value) })}
                            placeholder="-"
                            style={{ ...fieldStyle, borderColor: sBaseIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = sBaseIssue ? ERROR_RED : REST_BORDER; }}
                          />
                          <FieldHelper issue={sBaseIssue} />
                        </div>
                        <div>
                          {sectionLabel("Weekday rate")}
                          <input
                            type="number"
                            min={0}
                            value={priceInputValue(season.weekday_price)}
                            onChange={(e) => patchSeason({ weekday_price: e.target.value === "" ? null : Number(e.target.value) })}
                            placeholder="-"
                            style={{ ...fieldStyle, borderColor: sWeekdayIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = sWeekdayIssue ? ERROR_RED : REST_BORDER; }}
                          />
                          <FieldHelper issue={sWeekdayIssue} />
                        </div>
                        <div>
                          {sectionLabel("Weekend rate")}
                          <input
                            type="number"
                            min={0}
                            value={priceInputValue(season.weekend_price)}
                            onChange={(e) => patchSeason({ weekend_price: e.target.value === "" ? null : Number(e.target.value) })}
                            placeholder="-"
                            style={{ ...fieldStyle, borderColor: sWeekendIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = sWeekendIssue ? ERROR_RED : REST_BORDER; }}
                          />
                          <FieldHelper issue={sWeekendIssue} />
                        </div>
                        <div>
                          {sectionLabel("Minimum nights")}
                          <input
                            type="number"
                            min={1}
                            value={priceInputValue(season.minimum_stay)}
                            onChange={(e) => patchSeason({ minimum_stay: e.target.value === "" ? null : Number(e.target.value) })}
                            placeholder="-"
                            style={{ ...fieldStyle, borderColor: sMinStayIssue ? ERROR_RED : REST_BORDER, marginTop: "6px" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = sMinStayIssue ? ERROR_RED : REST_BORDER; }}
                          />
                          <FieldHelper issue={sMinStayIssue} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
