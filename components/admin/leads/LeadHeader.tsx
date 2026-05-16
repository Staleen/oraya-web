"use client";

import { useState, type CSSProperties } from "react";
import { BORDER, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "@/components/admin/theme";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  displayName,
  formatRelativeTime,
  nonEmpty,
  whatsappHref,
} from "./leadHelpers";

/**
 * Phase 16A.2.f — header strip of the selected-lead detail pane.
 *
 * Contains:
 *   - guest name, phone, status pill, relative time
 *   - WhatsApp open CTA (gold filled primary)
 *   - copy phone secondary
 *   - optional back-to-list affordance for mobile (handled via onBack prop)
 */

export interface LeadHeaderProps {
  lead: WhatsappLeadAdminRow;
  onBack?: () => void;
}

const WHATSAPP_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.1.65 4.05 1.75 5.66L2 22l4.59-1.2a9.93 9.93 0 0 0 5.45 1.55c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.13c-.24.69-1.4 1.31-1.97 1.4-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.37-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.59.83 2 .9 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.14.17-.31.39-.44.52-.14.14-.29.29-.13.58.16.29.7 1.16 1.51 1.88 1.04.92 1.92 1.2 2.21 1.34.29.14.46.12.63-.07.17-.19.73-.85.93-1.14.19-.29.39-.24.65-.14.27.1 1.69.8 1.98.94.29.14.49.22.56.34.08.13.08.69-.16 1.38z" />
  </svg>
);

const NAME_STYLE: CSSProperties = {
  fontFamily: PLAYFAIR,
  fontSize: "22px",
  color: WHITE,
  margin: 0,
  lineHeight: 1.2,
};

const META_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  letterSpacing: "1px",
  color: MUTED,
  margin: 0,
};

const PHONE_LINK_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "13px",
  color: GOLD,
  textDecoration: "none",
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontFamily: LATO,
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MIDNIGHT,
  backgroundColor: GOLD,
  border: `1px solid ${GOLD}`,
  padding: "8px 14px",
  cursor: "pointer",
  textDecoration: "none",
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  backgroundColor: "transparent",
  border: `0.5px solid ${GOLD}`,
  padding: "8px 12px",
  cursor: "pointer",
};

const BACK_BUTTON_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  backgroundColor: "transparent",
  border: "none",
  padding: "4px 0",
  cursor: "pointer",
  alignSelf: "flex-start",
};

function statusPillStyle(status: WhatsappLeadAdminRow["follow_up_status"]): CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "999px",
    fontFamily: LATO,
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: WHITE,
    backgroundColor: STATUS_COLOR[status],
    whiteSpace: "nowrap",
  };
}

export default function LeadHeader({ lead, onBack }: LeadHeaderProps) {
  const [copied, setCopied] = useState(false);
  const waHref = whatsappHref(lead.phone);

  async function copyPhone() {
    if (!lead.phone) return;
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {onBack ? (
        <button type="button" onClick={onBack} style={BACK_BUTTON_STYLE}>
          ← Back to list
        </button>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            minWidth: 0,
            flex: "1 1 220px",
            wordBreak: "break-word",
          }}
        >
          <h2 style={NAME_STYLE}>{displayName(lead)}</h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                style={PHONE_LINK_STYLE}
              >
                {nonEmpty(lead.phone)}
              </a>
            ) : (
              <span style={{ ...PHONE_LINK_STYLE, color: MUTED }}>{nonEmpty(lead.phone)}</span>
            )}
            <span aria-hidden="true" style={{ color: MUTED }}>·</span>
            <span style={statusPillStyle(lead.follow_up_status)}>
              {STATUS_LABEL[lead.follow_up_status]}
            </span>
            <span aria-hidden="true" style={{ color: MUTED }}>·</span>
            <span style={META_STYLE}>{formatRelativeTime(lead.created_at)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              style={PRIMARY_BUTTON_STYLE}
            >
              {WHATSAPP_ICON}
              Open WhatsApp
            </a>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              style={{ ...PRIMARY_BUTTON_STYLE, opacity: 0.4, cursor: "not-allowed" }}
            >
              {WHATSAPP_ICON}
              No phone
            </button>
          )}
          <button
            type="button"
            onClick={copyPhone}
            disabled={!lead.phone}
            aria-disabled={!lead.phone}
            style={{
              ...SECONDARY_BUTTON_STYLE,
              opacity: lead.phone ? 1 : 0.4,
              cursor: lead.phone ? "pointer" : "not-allowed",
            }}
          >
            {copied ? "Copied" : "Copy phone"}
          </button>
        </div>
      </div>
    </div>
  );
}
