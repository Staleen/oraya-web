"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE } from "@/components/admin/theme";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import { buildGuestSummary } from "./leadHelpers";

/**
 * Phase 16A.2.f — narrative card stitched from structured lead fields.
 *
 * Deterministic. No AI generation. No external calls. The template lives in
 * leadHelpers.buildGuestSummary; this component is the visual frame.
 */

export interface LeadGuestSummaryProps {
  lead: WhatsappLeadAdminRow;
}

const WRAPPER: CSSProperties = {
  border: `0.5px solid ${BORDER}`,
  backgroundColor: SURFACE,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflowWrap: "anywhere",
};

const KICKER: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2.5px",
  textTransform: "uppercase",
  color: GOLD,
  margin: 0,
};

const NARRATIVE: CSSProperties = {
  fontFamily: PLAYFAIR,
  fontSize: "16px",
  lineHeight: 1.5,
  color: WHITE,
  margin: 0,
};

const FOOTNOTE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  color: MUTED,
  margin: 0,
};

export default function LeadGuestSummary({ lead }: LeadGuestSummaryProps) {
  const narrative = buildGuestSummary(lead);
  return (
    <section aria-label="Guest summary" style={WRAPPER}>
      <p style={KICKER}>Guest summary</p>
      <p style={NARRATIVE}>{narrative}</p>
      <p style={FOOTNOTE}>
        Summary is generated from the structured fields the AI Butler captured —
        not from the live WhatsApp chat.
      </p>
    </section>
  );
}
