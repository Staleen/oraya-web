"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { BORDER, GOLD, LATO, MIDNIGHT, MUTED, SURFACE, WHITE, fieldStyle } from "@/components/admin/theme";
import { FOLLOW_UP_STATUSES, type FollowUpStatus, type WhatsappLeadAdminRow } from "@/lib/butler/leads";
import { STATUS_LABEL, formatDateTime } from "./leadHelpers";

/**
 * Phase 16A.2.f — operator workspace inside the lead detail pane.
 *
 * Pure controlled component over `lead`. Two write affordances:
 *   - status change (quick-action chip row + long-tail <select>)
 *   - admin notes textarea (with explicit Save / Discard)
 *
 * Labels and linked_booking_id are read-only in v1. The page handles the
 * PATCH; this component just emits callbacks and shows save/saving state.
 */

export interface LeadOperatorWorkspaceProps {
  lead: WhatsappLeadAdminRow;
  saving: boolean;
  onStatusChange: (next: FollowUpStatus) => void;
  onSaveNote: (next: string | null) => void;
}

const SECTION_STYLE: CSSProperties = {
  border: `0.5px solid ${BORDER}`,
  backgroundColor: SURFACE,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const KICKER: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2.5px",
  textTransform: "uppercase",
  color: GOLD,
  margin: 0,
};

const LABEL_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  margin: "0 0 6px",
};

const VALUE_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  color: WHITE,
  margin: 0,
  wordBreak: "break-word",
};

const QUICK_ACTIONS: Array<{ status: FollowUpStatus; label: string }> = [
  { status: "contacted", label: "Contacted" },
  { status: "needs_action", label: "Needs action" },
  { status: "converted", label: "Converted" },
];

function quickChipStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    fontFamily: LATO,
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: active ? GOLD : MUTED,
    backgroundColor: active ? "rgba(197,164,109,0.08)" : "transparent",
    border: `0.5px solid ${active ? GOLD : BORDER}`,
    padding: "6px 12px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
  };
}

const STATUS_SELECT_STYLE: CSSProperties = {
  ...fieldStyle,
  padding: "8px 10px",
  fontSize: "12px",
  width: "auto",
  backgroundColor: MIDNIGHT,
  color: WHITE,
  borderColor: "rgba(197,164,109,0.32)",
  colorScheme: "dark",
};

const STATUS_OPTION_STYLE: CSSProperties = {
  backgroundColor: MIDNIGHT,
  color: WHITE,
};

const TEXTAREA_STYLE: CSSProperties = {
  ...fieldStyle,
  padding: "10px 12px",
  fontSize: "13px",
  resize: "vertical",
  minHeight: "92px",
};

const SAVE_BUTTON_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  backgroundColor: "transparent",
  border: `0.5px solid ${GOLD}`,
  padding: "8px 14px",
  cursor: "pointer",
};

const DISCARD_BUTTON_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  backgroundColor: "transparent",
  border: `0.5px solid ${BORDER}`,
  padding: "8px 14px",
  cursor: "pointer",
};

const LABEL_PILL_STYLE: CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  fontFamily: LATO,
  fontSize: "10px",
  color: MUTED,
  border: `0.5px solid ${BORDER}`,
  whiteSpace: "nowrap",
};

export default function LeadOperatorWorkspace({
  lead,
  saving,
  onStatusChange,
  onSaveNote,
}: LeadOperatorWorkspaceProps) {
  const savedNote = lead.admin_notes ?? "";
  const [draft, setDraft] = useState(savedNote);

  // When the operator switches leads (or the upstream notes change), reset
  // the textarea to the saved value.
  useEffect(() => {
    setDraft(lead.admin_notes ?? "");
  }, [lead.id, lead.admin_notes]);

  const dirty = draft !== savedNote;

  function handleSave() {
    const trimmed = draft.trim();
    onSaveNote(trimmed === "" ? null : draft);
  }

  function handleDiscard() {
    setDraft(savedNote);
  }

  return (
    <section aria-label="Operator workspace" style={SECTION_STYLE}>
      <p style={KICKER}>Operator workspace</p>

      <div>
        <p style={LABEL_STYLE}>Quick status</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {QUICK_ACTIONS.map((qa) => {
            const active = lead.follow_up_status === qa.status;
            return (
              <button
                key={qa.status}
                type="button"
                onClick={() => !saving && onStatusChange(qa.status)}
                aria-pressed={active}
                disabled={saving}
                style={quickChipStyle(active, saving)}
              >
                {qa.label}
              </button>
            );
          })}
          <label aria-label="Full status selector" style={{ display: "inline-flex" }}>
            <select
              value={lead.follow_up_status}
              onChange={(e) => onStatusChange(e.target.value as FollowUpStatus)}
              disabled={saving}
              style={STATUS_SELECT_STYLE}
            >
              {FOLLOW_UP_STATUSES.map((s) => (
                <option key={s} value={s} style={STATUS_OPTION_STYLE}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div>
        <p style={LABEL_STYLE}>Admin notes</p>
        <textarea
          aria-label="Admin notes"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          rows={4}
          style={TEXTAREA_STYLE}
        />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{
              ...SAVE_BUTTON_STYLE,
              opacity: !dirty || saving ? 0.5 : 1,
              cursor: !dirty || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save note"}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              style={DISCARD_BUTTON_STYLE}
            >
              Discard
            </button>
          ) : null}
          {dirty ? (
            <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED }}>
              Unsaved changes
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <p style={LABEL_STYLE}>Labels</p>
        {lead.labels && lead.labels.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {lead.labels.map((l) => (
              <span key={l} style={LABEL_PILL_STYLE}>
                {l}
              </span>
            ))}
          </div>
        ) : (
          <p style={VALUE_STYLE}>—</p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "12px",
        }}
      >
        <div>
          <p style={LABEL_STYLE}>Linked booking</p>
          <p
            style={{
              ...VALUE_STYLE,
              color: lead.linked_booking_id ? WHITE : MUTED,
              fontSize: "11px",
              wordBreak: "break-all",
            }}
          >
            {lead.linked_booking_id ?? "—"}
          </p>
        </div>
        <div>
          <p style={LABEL_STYLE}>Last updated</p>
          <p style={{ ...VALUE_STYLE, fontSize: "11px" }}>
            {formatDateTime(lead.updated_at)}
          </p>
        </div>
      </div>
    </section>
  );
}
