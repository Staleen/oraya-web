"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, SURFACE, WHITE } from "@/components/admin/theme";
import { FOLLOW_UP_STATUSES, type FollowUpStatus } from "@/lib/butler/leads";
import { STATUS_LABEL, type LeadFilterState } from "./leadHelpers";

/**
 * Phase 16A.2.f — filter/search bar for /admin/leads.
 *
 * Pure controlled component: parent owns the LeadFilterState. All filters
 * are applied client-side over the loaded list (see leadHelpers.applyClientFilters).
 */

export interface LeadFiltersProps {
  filters: LeadFilterState;
  onChange: (next: LeadFilterState) => void;
  villaOptions: string[];
  totalLoaded: number;
  totalShown: number;
}

function chipStyle(active: boolean): CSSProperties {
  return {
    fontFamily: LATO,
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: active ? GOLD : MUTED,
    backgroundColor: active ? "rgba(197,164,109,0.08)" : "transparent",
    border: `0.5px solid ${active ? GOLD : BORDER}`,
    padding: "6px 12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const LABEL_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  margin: "0 0 6px",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px",
};

const SEARCH_INPUT_STYLE: CSSProperties = {
  flex: "1 1 220px",
  minWidth: "180px",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: `0.5px solid ${BORDER}`,
  padding: "8px 10px",
  fontFamily: LATO,
  fontSize: "12px",
  color: WHITE,
  outline: "none",
  boxSizing: "border-box",
};

const VILLA_SELECT_STYLE: CSSProperties = {
  ...SEARCH_INPUT_STYLE,
  flex: "0 0 auto",
  minWidth: "140px",
  width: "auto",
  backgroundColor: "#1F2B38", // MIDNIGHT — explicit per PR #16 dropdown contrast fix
  color: WHITE,
  borderColor: "rgba(197,164,109,0.32)",
  colorScheme: "dark",
};

const OPTION_STYLE: CSSProperties = {
  backgroundColor: "#1F2B38",
  color: WHITE,
};

const COUNT_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: MUTED,
};

const STATUS_OPTIONS: Array<{ value: FollowUpStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  ...FOLLOW_UP_STATUSES.map((s) => ({ value: s as FollowUpStatus | "all", label: STATUS_LABEL[s] })),
];

const TYPE_OPTIONS: Array<{ value: LeadFilterState["type"]; label: string }> = [
  { value: "all", label: "Any type" },
  { value: "stay", label: "Stay" },
  { value: "event", label: "Event" },
];

export default function LeadFilters({
  filters,
  onChange,
  villaOptions,
  totalLoaded,
  totalShown,
}: LeadFiltersProps) {
  function set<K extends keyof LeadFilterState>(key: K, value: LeadFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <p style={LABEL_STYLE}>Status</p>
        <div style={ROW_STYLE}>
          {STATUS_OPTIONS.map((opt) => {
            const active = filters.status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("status", opt.value)}
                aria-pressed={active}
                style={chipStyle(active)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...ROW_STYLE, gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <p style={LABEL_STYLE}>Type</p>
          <div style={ROW_STYLE}>
            {TYPE_OPTIONS.map((opt) => {
              const active = filters.type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("type", opt.value)}
                  aria-pressed={active}
                  style={chipStyle(active)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <p style={LABEL_STYLE}>Priority</p>
          <div style={ROW_STYLE}>
            <button
              type="button"
              onClick={() =>
                set("priority", filters.priority === "vip_or_human" ? "all" : "vip_or_human")
              }
              aria-pressed={filters.priority === "vip_or_human"}
              style={chipStyle(filters.priority === "vip_or_human")}
            >
              VIP / Needs human
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...ROW_STYLE, gap: "10px" }}>
        <label
          aria-label="Search leads by name, phone, villa, or label"
          style={{ flex: "1 1 220px", minWidth: "180px", display: "flex" }}
        >
          <input
            type="search"
            placeholder="Search name, phone, villa, label…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            style={SEARCH_INPUT_STYLE}
          />
        </label>
        <label
          aria-label="Filter by villa"
          style={{ display: "inline-flex" }}
        >
          <select
            value={filters.villa}
            onChange={(e) => set("villa", e.target.value)}
            style={VILLA_SELECT_STYLE}
          >
            <option value="all" style={OPTION_STYLE}>
              All villas
            </option>
            {villaOptions.map((v) => (
              <option key={v} value={v} style={OPTION_STYLE}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span style={COUNT_STYLE}>
          {totalShown} of {totalLoaded}
        </span>
      </div>
    </div>
  );
}
