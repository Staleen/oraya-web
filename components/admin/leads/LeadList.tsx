"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, WHITE } from "@/components/admin/theme";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import LeadCard from "./LeadCard";

/**
 * Phase 16A.2.f — left-pane list of lead cards.
 * Phase 16A.2.g — empty states split between "Open inbox empty" (shows the
 *   "Show all leads" affordance) and "filters return zero" (shows "Clear
 *   filters"). True empty (no leads in the database at all) is unchanged.
 *
 * Scrolls vertically on desktop (parent gives it a fixed height). On mobile
 * it grows naturally; selection on mobile is handled by the page, which hides
 * this pane and shows the detail pane.
 */

export interface LeadListProps {
  leads: WhatsappLeadAdminRow[];
  selectedLeadId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  totalLoaded: number;
  hasFiltersActive: boolean;
  onClearFilters: () => void;
  // 16A.2.g: empty-state branching for the Open inbox.
  isOpenInbox: boolean;
  onShowAllLeads: () => void;
}

const EMPTY_WRAPPER: CSSProperties = {
  padding: "2rem 1rem",
  textAlign: "center",
};

const EMPTY_TITLE: CSSProperties = {
  fontFamily: PLAYFAIR,
  fontSize: "16px",
  color: WHITE,
  margin: "0 0 0.5rem",
};

const EMPTY_TEXT: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  color: MUTED,
  margin: 0,
};

const CLEAR_BUTTON: CSSProperties = {
  marginTop: "12px",
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  backgroundColor: "transparent",
  border: `0.5px solid ${GOLD}`,
  padding: "6px 12px",
  cursor: "pointer",
};

function SkeletonCard() {
  const base: CSSProperties = {
    height: "12px",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: "2px",
  };
  return (
    <div
      aria-hidden="true"
      style={{
        padding: "12px 14px",
        border: `0.5px solid ${BORDER}`,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ ...base, width: "60%" }} />
      <div style={{ ...base, width: "40%" }} />
      <div style={{ ...base, width: "80%" }} />
    </div>
  );
}

export default function LeadList({
  leads,
  selectedLeadId,
  onSelect,
  loading,
  totalLoaded,
  hasFiltersActive,
  onClearFilters,
  isOpenInbox,
  onShowAllLeads,
}: LeadListProps) {
  if (loading && totalLoaded === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (leads.length === 0) {
    if (totalLoaded === 0) {
      // True empty — no leads exist in the DB yet.
      return (
        <div style={EMPTY_WRAPPER}>
          <p style={EMPTY_TITLE}>No WhatsApp leads yet</p>
          <p style={EMPTY_TEXT}>
            Leads captured by the AI Butler will appear here.
          </p>
        </div>
      );
    }
    if (isOpenInbox) {
      // Open inbox with nothing actionable — closed/spam/converted leads still
      // exist in the DB and are reachable via "Show all leads", the Closed
      // scope chip, or a direct status filter.
      return (
        <div style={EMPTY_WRAPPER}>
          <p style={EMPTY_TITLE}>No open leads right now</p>
          <p style={EMPTY_TEXT}>
            All caught up. Closed, converted, and spam leads are still
            available through the Closed scope.
          </p>
          <button type="button" onClick={onShowAllLeads} style={CLEAR_BUTTON}>
            Show all leads
          </button>
        </div>
      );
    }
    return (
      <div style={EMPTY_WRAPPER}>
        <p style={EMPTY_TITLE}>No leads match these filters</p>
        <p style={EMPTY_TEXT}>Try widening the search or clearing filters.</p>
        {hasFiltersActive ? (
          <button type="button" onClick={onClearFilters} style={CLEAR_BUTTON}>
            Clear filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label="WhatsApp leads"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {leads.map((lead) => (
        <div key={lead.id} role="listitem" style={{ minWidth: 0 }}>
          <LeadCard
            lead={lead}
            selected={selectedLeadId === lead.id}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}
