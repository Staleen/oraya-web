"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE } from "@/components/admin/theme";
import type { LeadKpiCounts } from "./leadHelpers";

/**
 * Phase 16A.2.f — top KPI ribbon for /admin/leads.
 *
 * Each card doubles as a filter shortcut. Clicking a card calls the matching
 * `on*` callback; the page decides which filter slot to toggle. The visual
 * "active" state is owned by the parent (passed via `activeKey`).
 */

export type KpiKey = "new" | "needsAction" | "events" | "vipOrNeedsHuman" | "converted";

export interface LeadKpisProps {
  counts: LeadKpiCounts;
  activeKey: KpiKey | null;
  onSelect: (key: KpiKey) => void;
  compact?: boolean;
}

const CARD_BASE: CSSProperties = {
  flex: "1 1 140px",
  minWidth: "140px",
  padding: "14px 16px",
  textAlign: "left",
  backgroundColor: SURFACE,
  border: `0.5px solid ${BORDER}`,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontFamily: LATO,
};

function cardStyle(active: boolean): CSSProperties {
  return {
    ...CARD_BASE,
    borderColor: active ? GOLD : BORDER,
    backgroundColor: active ? "rgba(197,164,109,0.08)" : SURFACE,
  };
}

const LABEL_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  margin: 0,
};

const NUMBER_STYLE: CSSProperties = {
  fontFamily: PLAYFAIR,
  fontSize: "28px",
  color: WHITE,
  margin: 0,
  lineHeight: 1,
};

const HINT_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  color: MUTED,
  margin: 0,
};

const ENTRIES: Array<{ key: KpiKey; label: string; hint: string }> = [
  { key: "new", label: "New", hint: "Status: new" },
  { key: "needsAction", label: "Needs action", hint: "Status: needs_action" },
  { key: "events", label: "Events", hint: "Event requests" },
  { key: "vipOrNeedsHuman", label: "VIP / Needs human", hint: "Priority labels" },
  { key: "converted", label: "Converted", hint: "Status: converted" },
];

export default function LeadKpis({ counts, activeKey, onSelect, compact }: LeadKpisProps) {
  return (
    <div
      role="group"
      aria-label="Lead KPI shortcuts"
      style={{
        display: "flex",
        flexWrap: compact ? "nowrap" : "wrap",
        gap: "10px",
        overflowX: compact ? "auto" : "visible",
        WebkitOverflowScrolling: "touch",
        paddingBottom: compact ? "4px" : 0,
      }}
    >
      {ENTRIES.map((entry) => {
        const value = counts[entry.key];
        const active = activeKey === entry.key;
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            aria-pressed={active}
            style={cardStyle(active)}
          >
            <span style={LABEL_STYLE}>{entry.label}</span>
            <span style={NUMBER_STYLE}>{value}</span>
            <span style={HINT_STYLE}>{entry.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
