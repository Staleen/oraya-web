"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, WHITE } from "@/components/admin/theme";
import { FOLLOW_UP_STATUSES, type FollowUpStatus } from "@/lib/butler/leads";
import {
  STATUS_LABEL,
  applyStatusWithScopeRelax,
  type LeadFilterState,
  type ScopeFilter,
} from "./leadHelpers";

/**
 * Phase 16A.2.f — filter/search bar for /admin/leads.
 * Phase 16A.2.g — added Inbox scope row (Open/All/Closed) above the status
 *   chips so the operator's default view is the active inbox; closed/spam/
 *   converted leads are still reachable via the Closed or All scope and via
 *   the direct status chips.
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
  countText: string;
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

// Scope chips sit at the top of the filter area and are visually a touch
// heavier than the status chips so the operator clearly sees "I'm in the
// open inbox" at a glance.
function scopeChipStyle(active: boolean): CSSProperties {
  return {
    fontFamily: LATO,
    fontSize: "11px",
    letterSpacing: "2px",
    textTransform: "uppercase",
    fontWeight: active ? 600 : 400,
    color: active ? "#1F2B38" : GOLD,
    backgroundColor: active ? GOLD : "transparent",
    border: `1px solid ${GOLD}`,
    padding: "8px 16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const SCOPE_OPTIONS: Array<{ value: ScopeFilter; label: string; description: string }> = [
  { value: "open", label: "Open", description: "Active inbox: new, contacted, needs action" },
  { value: "all", label: "All", description: "Every loaded lead" },
  { value: "closed", label: "Closed", description: "Converted, lost, spam" },
];

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
  minWidth: 0,
  maxWidth: "100%",
};

const SEARCH_INPUT_STYLE: CSSProperties = {
  width: "100%",
  minWidth: 0,
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
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  backgroundColor: "#1F2B38", // MIDNIGHT — explicit per PR #16 dropdown contrast fix
  color: WHITE,
  border: `0.5px solid rgba(197,164,109,0.32)`,
  padding: "8px 10px",
  fontFamily: LATO,
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
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
  totalLoaded: _totalLoaded,
  totalShown: _totalShown,
  countText,
}: LeadFiltersProps) {
  function set<K extends keyof LeadFilterState>(key: K, value: LeadFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  // Status chip selection routes through the scope-relax helper so picking
  // (e.g.) "Spam" while in the Open inbox jumps the scope to All instead of
  // silently returning zero results.
  function selectStatus(next: FollowUpStatus | "all") {
    onChange(applyStatusWithScopeRelax(filters, next));
  }

  const activeScope = filters.scope;
  const scopeDescription =
    SCOPE_OPTIONS.find((s) => s.value === activeScope)?.description ?? "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={LABEL_STYLE}>Inbox</p>
        <div
          role="group"
          aria-label="Inbox scope"
          style={{ ...ROW_STYLE, gap: "8px" }}
        >
          {SCOPE_OPTIONS.map((opt) => {
            const active = filters.scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("scope", opt.value)}
                aria-pressed={active}
                title={opt.description}
                style={scopeChipStyle(active)}
              >
                {opt.label}
              </button>
            );
          })}
          <span
            style={{
              ...COUNT_STYLE,
              fontSize: "10px",
              color: MUTED,
              flex: "1 1 auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {countText}
          </span>
        </div>
        <p
          style={{
            ...LABEL_STYLE,
            margin: "6px 0 0",
            letterSpacing: "1px",
            textTransform: "none",
            fontSize: "10px",
            color: MUTED,
          }}
        >
          {scopeDescription}
        </p>
      </div>

      <div style={{ minWidth: 0 }}>
        <p style={LABEL_STYLE}>Status</p>
        <div style={ROW_STYLE}>
          {STATUS_OPTIONS.map((opt) => {
            const active = filters.status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectStatus(opt.value as FollowUpStatus | "all")}
                aria-pressed={active}
                style={chipStyle(active)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...ROW_STYLE, gap: "16px", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
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

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "8px",
          width: "100%",
          minWidth: 0,
        }}
      >
        <label
          aria-label="Search leads by name, phone, villa, or label"
          style={{ display: "block", width: "100%", minWidth: 0 }}
        >
          <input
            type="search"
            placeholder="Search name, phone, villa, label…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            style={SEARCH_INPUT_STYLE}
          />
        </label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            minWidth: 0,
          }}
        >
          <label
            aria-label="Filter by villa"
            style={{ display: "block", flex: "1 1 160px", minWidth: 0 }}
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
        </div>
      </div>
    </div>
  );
}
