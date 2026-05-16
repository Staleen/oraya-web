"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, WHITE } from "@/components/admin/theme";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import LeadCard from "./LeadCard";

/**
 * Phase 16A.2.f — left-pane list of lead cards.
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
      return (
        <div style={EMPTY_WRAPPER}>
          <p style={EMPTY_TITLE}>No WhatsApp leads yet</p>
          <p style={EMPTY_TEXT}>
            Leads captured by the AI Butler will appear here.
          </p>
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
      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      {leads.map((lead) => (
        <div key={lead.id} role="listitem">
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
