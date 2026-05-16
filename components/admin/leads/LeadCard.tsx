"use client";

import { useEffect, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { BORDER, GOLD, LATO, MIDNIGHT, MUTED, SURFACE, WHITE } from "@/components/admin/theme";
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
 * Phase 16A.2.h — adds a compact quick-delete affordance with a two-step
 *   inline confirm. The card is rendered as a div with role="button" (rather
 *   than a real <button>) so the inline Delete / Confirm / Cancel controls
 *   can be real nested <button> elements without producing invalid HTML.
 *   Keyboard nav (Enter/Space) on the card is preserved manually. Quick
 *   delete is omitted entirely when the lead has a `linked_booking_id` so
 *   the operator can't bypass the server-side guard from the list view.
 *
 * Selected state is a clear gold left rail + tinted background; priority
 * labels get a colored left rail (red for needs_human, gold for VIP).
 */

export interface LeadCardProps {
  lead: WhatsappLeadAdminRow;
  selected: boolean;
  onSelect: (id: string) => void;
  // 16A.2.h: optional quick-delete wiring. When `onDeleteLead` is omitted
  // (e.g. a future caller hasn't wired delete yet) the card falls back to
  // its pre-16A.2.h shape with no danger affordance.
  deleting?: boolean;
  deleteError?: string | null;
  onDeleteLead?: (id: string) => void;
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
    // 16A.2.h: outline only on keyboard focus so the div-as-button stays
    // visually quiet during mouse use but is still discoverable for a11y.
    outline: "none",
  };
}

// 16A.2.h — danger styles. Red mirrors the existing right-pane Danger Zone
// in LeadOperatorWorkspace.tsx (#e07070) so the visual language is shared.
const DANGER_RED = "#e07070";

const DELETE_ACTION_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  minWidth: 0,
};

const QUICK_DELETE_BUTTON: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: DANGER_RED,
  backgroundColor: "transparent",
  border: `0.5px solid rgba(224,112,112,0.55)`,
  padding: "4px 10px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const QUICK_DELETE_CONFIRM_PROMPT: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  color: DANGER_RED,
  letterSpacing: "0.2px",
  margin: 0,
  marginRight: "auto",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

const QUICK_CONFIRM_BUTTON: CSSProperties = {
  ...QUICK_DELETE_BUTTON,
  color: MIDNIGHT,
  backgroundColor: DANGER_RED,
  border: `0.5px solid ${DANGER_RED}`,
  fontWeight: 600,
};

const QUICK_CANCEL_BUTTON: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: MUTED,
  backgroundColor: "transparent",
  border: `0.5px solid ${BORDER}`,
  padding: "4px 10px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const QUICK_DELETE_ERROR_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  color: DANGER_RED,
  backgroundColor: "rgba(224,112,112,0.08)",
  border: `0.5px solid rgba(224,112,112,0.35)`,
  padding: "6px 8px",
  margin: 0,
  width: "100%",
  boxSizing: "border-box",
};

function quickDeleteErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "linked_booking_exists") {
    return "Linked to a booking — clear the link before deleting.";
  }
  if (code === "not_found") {
    return "Lead no longer exists. Refresh the list.";
  }
  if (code === "invalid_request") {
    return "Invalid lead id. Refresh and try again.";
  }
  return "Couldn't delete this lead. Please try again.";
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

export default function LeadCard({
  lead,
  selected,
  onSelect,
  deleting,
  deleteError,
  onDeleteLead,
}: LeadCardProps) {
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

  // 16A.2.h: quick-delete is omitted entirely for leads with a linked
  // booking — the server refuses these anyway, and a disabled chip on every
  // converted card would be noisy in the list view. The right-pane Danger
  // Zone still explains the linked-booking situation when one of these
  // leads is opened.
  const hasLinkedBooking = !!lead.linked_booking_id;
  const canQuickDelete = !!onDeleteLead && !hasLinkedBooking;

  const [confirming, setConfirming] = useState(false);

  // Drop any half-confirmed delete if the row is swapped underneath us
  // (e.g. the selected lead changes id or a fresh fetch replaces the row).
  useEffect(() => {
    setConfirming(false);
  }, [lead.id]);

  // When a delete attempt fails the page sets deleteError for this card —
  // bounce the card back to its idle state so the operator sees the error
  // banner instead of a sticky "Confirm delete" button.
  useEffect(() => {
    if (deleteError) setConfirming(false);
  }, [deleteError]);

  const quickDeleteErrorText = quickDeleteErrorMessage(deleteError);

  function handleCardClick() {
    onSelect(lead.id);
  }

  function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Standard role="button" keyboard support. Ignore when the event was
    // raised by a nested control (e.g. the Delete button) so focusing the
    // delete affordance and hitting Space doesn't also select the card.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(lead.id);
    }
  }

  function stop(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
  }

  function handleDeleteClick(e: MouseEvent<HTMLButtonElement>) {
    stop(e);
    if (!canQuickDelete || deleting) return;
    setConfirming(true);
  }

  function handleConfirmClick(e: MouseEvent<HTMLButtonElement>) {
    stop(e);
    if (!canQuickDelete || deleting) return;
    onDeleteLead?.(lead.id);
  }

  function handleCancelClick(e: MouseEvent<HTMLButtonElement>) {
    stop(e);
    if (deleting) return;
    setConfirming(false);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
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

      {canQuickDelete ? (
        <div style={DELETE_ACTION_ROW}>
          {!confirming ? (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={!!deleting}
              aria-label={`Delete lead from ${displayName(lead)}`}
              style={{
                ...QUICK_DELETE_BUTTON,
                opacity: deleting ? 0.5 : 1,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : (
            <>
              <span style={QUICK_DELETE_CONFIRM_PROMPT}>Delete permanently?</span>
              <button
                type="button"
                onClick={handleConfirmClick}
                disabled={!!deleting}
                aria-label={`Confirm permanent delete of lead from ${displayName(lead)}`}
                style={{
                  ...QUICK_CONFIRM_BUTTON,
                  opacity: deleting ? 0.7 : 1,
                  cursor: deleting ? "wait" : "pointer",
                }}
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={!!deleting}
                style={{
                  ...QUICK_CANCEL_BUTTON,
                  opacity: deleting ? 0.5 : 1,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </>
          )}
          {quickDeleteErrorText ? (
            <p role="alert" style={QUICK_DELETE_ERROR_STYLE}>
              {quickDeleteErrorText}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
