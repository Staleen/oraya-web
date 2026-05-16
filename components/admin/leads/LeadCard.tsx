"use client";

import type { CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, SURFACE, WHITE } from "@/components/admin/theme";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  computeNights,
  displayName,
  formatRelativeTime,
  initialFor,
  nonEmpty,
  priorityFlagsFor,
  requestKind,
} from "./leadHelpers";

/**
 * Phase 16A.2.f — single lead card in the left list.
 *
 * Renders as a real <button> for keyboard nav. Selected state is a clear
 * gold left rail + tinted background; priority labels get a colored left rail
 * (red for needs_human, gold for VIP).
 */

export interface LeadCardProps {
  lead: WhatsappLeadAdminRow;
  selected: boolean;
  onSelect: (id: string) => void;
}

function railColor(lead: WhatsappLeadAdminRow, selected: boolean): string {
  if (selected) return GOLD;
  const flags = priorityFlagsFor(lead);
  if (flags.needsHuman) return "#e07070";
  if (flags.vip) return GOLD;
  if (lead.follow_up_status === "needs_action") return "#e07070";
  if (lead.follow_up_status === "new") return "#7fb3e0";
  return "transparent";
}

function cardStyle(selected: boolean, lead: WhatsappLeadAdminRow): CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    backgroundColor: selected ? "rgba(197,164,109,0.08)" : SURFACE,
    border: `0.5px solid ${selected ? GOLD : BORDER}`,
    borderLeft: `3px solid ${railColor(lead, selected)}`,
    padding: "12px 14px",
    cursor: "pointer",
    fontFamily: LATO,
    color: WHITE,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxSizing: "border-box",
    minWidth: 0,
  };
}

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  minWidth: 0,
};

const NAME_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "13px",
  fontWeight: 500,
  color: WHITE,
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};

const META_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  color: MUTED,
  letterSpacing: "0.2px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const PHONE_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  color: "rgba(255,255,255,0.7)",
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const SUB_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  color: "rgba(255,255,255,0.75)",
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const PILL_ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  alignItems: "center",
};

function statusPillStyle(status: WhatsappLeadAdminRow["follow_up_status"]): CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    fontFamily: LATO,
    fontSize: "9px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: WHITE,
    backgroundColor: STATUS_COLOR[status],
    whiteSpace: "nowrap",
  };
}

function chipStyle(kind: "vip" | "needs_human" | "event" | "pending"): CSSProperties {
  const colorMap: Record<typeof kind, { fg: string; border: string; bg: string }> = {
    vip: { fg: GOLD, border: GOLD, bg: "rgba(197,164,109,0.10)" },
    needs_human: { fg: "#e07070", border: "#e07070", bg: "rgba(224,112,112,0.10)" },
    event: { fg: "#c9b27f", border: "#c9b27f", bg: "rgba(201,178,127,0.10)" },
    pending: { fg: MUTED, border: BORDER, bg: "transparent" },
  };
  const c = colorMap[kind];
  return {
    display: "inline-block",
    padding: "2px 6px",
    fontFamily: LATO,
    fontSize: "9px",
    letterSpacing: "1px",
    textTransform: "uppercase",
    color: c.fg,
    border: `0.5px solid ${c.border}`,
    backgroundColor: c.bg,
    whiteSpace: "nowrap",
  };
}

const AVATAR_STYLE: CSSProperties = {
  flexShrink: 0,
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  backgroundColor: "rgba(255,255,255,0.06)",
  border: `0.5px solid ${BORDER}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: LATO,
  fontSize: "13px",
  color: GOLD,
  fontWeight: 500,
};

export default function LeadCard({ lead, selected, onSelect }: LeadCardProps) {
  const flags = priorityFlagsFor(lead);
  const kind = requestKind(lead);
  const nights = computeNights(lead.normalized_check_in, lead.normalized_check_out);
  const nightsLabel =
    nights !== null && nights > 0
      ? `${nights} night${nights === 1 ? "" : "s"}`
      : null;

  let dateLine = "";
  if (lead.check_in_text || lead.check_out_text) {
    dateLine = `${nonEmpty(lead.check_in_text)} → ${nonEmpty(lead.check_out_text)}`;
  }

  const villaLine = lead.villa?.trim() ? lead.villa.trim() : "Villa not yet specified";
  const kindLabel = kind === "stay" ? "Stay" : kind === "event" ? "Event" : "Inquiry";
  const guests = lead.guest_count?.trim();

  return (
    <button
      type="button"
      onClick={() => onSelect(lead.id)}
      aria-pressed={selected}
      aria-label={`Lead from ${displayName(lead)} — ${kindLabel} — status ${STATUS_LABEL[lead.follow_up_status]}`}
      style={cardStyle(selected, lead)}
    >
      <div style={ROW_STYLE}>
        <div style={AVATAR_STYLE} aria-hidden="true">
          {initialFor(lead.name, lead.phone)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
            <span style={NAME_STYLE}>{displayName(lead)}</span>
            <span style={META_STYLE}>{formatRelativeTime(lead.created_at)}</span>
          </div>
          <span style={PHONE_STYLE}>{nonEmpty(lead.phone)}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
        <span style={SUB_STYLE}>
          {kindLabel} · {villaLine}
          {guests ? ` · ${guests} guests` : ""}
        </span>
        {dateLine ? <span style={SUB_STYLE}>{dateLine}</span> : null}
      </div>

      <div style={PILL_ROW_STYLE}>
        <span style={statusPillStyle(lead.follow_up_status)}>
          {STATUS_LABEL[lead.follow_up_status]}
        </span>
        {flags.vip ? <span style={chipStyle("vip")}>VIP</span> : null}
        {flags.needsHuman ? <span style={chipStyle("needs_human")}>Needs human</span> : null}
        {flags.event ? <span style={chipStyle("event")}>Event</span> : null}
        {flags.pendingFollowup ? <span style={chipStyle("pending")}>Pending follow-up</span> : null}
        {nightsLabel ? <span style={chipStyle("pending")}>{nightsLabel}</span> : null}
      </div>
    </button>
  );
}
