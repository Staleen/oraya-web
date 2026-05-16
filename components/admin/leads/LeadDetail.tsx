"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE } from "@/components/admin/theme";
import type { FollowUpStatus, WhatsappLeadAdminRow } from "@/lib/butler/leads";
import LeadHeader from "./LeadHeader";
import LeadGuestSummary from "./LeadGuestSummary";
import RequestReviewPanel from "./RequestReviewPanel";
import LeadOperatorWorkspace from "./LeadOperatorWorkspace";
import { formatDateTime } from "./leadHelpers";

/**
 * Phase 16A.2.f — right-pane shell.
 *
 * Composes header → guest summary → request review → operator workspace →
 * meta footer. Owns no state of its own; the page handles fetches and PATCHes.
 */

export interface LeadDetailProps {
  lead: WhatsappLeadAdminRow | null;
  saving: boolean;
  onStatusChange: (id: string, next: FollowUpStatus) => void;
  onSaveNote: (id: string, next: string | null) => void;
  onBack?: () => void;
  hiddenByFilter?: boolean;
}

const EMPTY_WRAPPER: CSSProperties = {
  border: `0.5px solid ${BORDER}`,
  backgroundColor: SURFACE,
  padding: "3rem 2rem",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  alignItems: "center",
  textAlign: "center",
};

const EMPTY_TITLE: CSSProperties = {
  fontFamily: PLAYFAIR,
  fontSize: "18px",
  color: WHITE,
  margin: 0,
};

const EMPTY_TEXT: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  color: MUTED,
  margin: 0,
};

const META_FOOTER: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: "10px 16px",
  fontFamily: LATO,
  fontSize: "10px",
  color: MUTED,
};

const META_LABEL: CSSProperties = {
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  margin: "0 0 2px",
};

const HIDDEN_BANNER: CSSProperties = {
  border: `0.5px solid ${BORDER}`,
  backgroundColor: "rgba(197,164,109,0.05)",
  padding: "10px 14px",
  fontFamily: LATO,
  fontSize: "11px",
  color: MUTED,
};

export default function LeadDetail({
  lead,
  saving,
  onStatusChange,
  onSaveNote,
  onBack,
  hiddenByFilter,
}: LeadDetailProps) {
  if (!lead) {
    return (
      <div style={EMPTY_WRAPPER}>
        <p style={EMPTY_TITLE}>Select a lead to view details</p>
        <p style={EMPTY_TEXT}>Choose a card on the left to open the operator workspace.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <LeadHeader lead={lead} onBack={onBack} />

      {hiddenByFilter ? (
        <p style={HIDDEN_BANNER}>
          This lead is not in the current filter — clear filters to find it in
          the list again.
        </p>
      ) : null}

      <LeadGuestSummary lead={lead} />
      <RequestReviewPanel lead={lead} />
      <LeadOperatorWorkspace
        lead={lead}
        saving={saving}
        onStatusChange={(next) => onStatusChange(lead.id, next)}
        onSaveNote={(next) => onSaveNote(lead.id, next)}
      />

      <div style={META_FOOTER}>
        <div>
          <p style={META_LABEL}>Lead id</p>
          <p style={{ margin: 0, wordBreak: "break-all", color: "rgba(255,255,255,0.6)" }}>
            {lead.id}
          </p>
        </div>
        <div>
          <p style={META_LABEL}>Source</p>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.6)" }}>{lead.source || "—"}</p>
        </div>
        <div>
          <p style={META_LABEL}>Received</p>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.6)" }}>
            {formatDateTime(lead.created_at)}
          </p>
        </div>
        <div>
          <p style={META_LABEL}>Last updated</p>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.6)" }}>
            {formatDateTime(lead.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
