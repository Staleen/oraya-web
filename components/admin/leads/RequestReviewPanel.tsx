"use client";

import type { CSSProperties, ReactNode } from "react";
import { BORDER, GOLD, LATO, MUTED, SURFACE, WHITE } from "@/components/admin/theme";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import { computeNights, nonEmpty, requestKind } from "./leadHelpers";

/**
 * Phase 16A.2.f — pre-filled request review panel.
 *
 * Variant by request_type:
 *   - "stay"  → villa, check-in, check-out, nights, guests, add-ons, special requests
 *   - "event" → event type, event date(s), villa, guests, special requests
 *   - other   → defensive labeled list of whatever the lead carries
 *
 * The disabled "Convert to booking request" ghost button sits at the bottom.
 * It has no onClick, no href, aria-disabled="true", tabIndex={-1}, and a
 * cursor: not-allowed style. It triggers NO network request.
 */

export interface RequestReviewPanelProps {
  lead: WhatsappLeadAdminRow;
}

const WRAPPER: CSSProperties = {
  border: `0.5px solid ${BORDER}`,
  backgroundColor: SURFACE,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const KICKER: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2.5px",
  textTransform: "uppercase",
  color: GOLD,
  margin: 0,
};

const TITLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "0.5px",
  color: WHITE,
  margin: 0,
};

const NOTICE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  color: MUTED,
  margin: 0,
  lineHeight: 1.5,
};

const FIELD_LIST: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "10px 16px",
};

const FIELD_LABEL: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  margin: "0 0 2px",
};

const FIELD_VALUE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "13px",
  color: WHITE,
  margin: 0,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const CONVERT_BUTTON: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  backgroundColor: "transparent",
  border: `1px dashed ${BORDER}`,
  padding: "12px 16px",
  cursor: "not-allowed",
  opacity: 0.55,
  alignSelf: "flex-start",
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p style={FIELD_LABEL}>{label}</p>
      <p style={FIELD_VALUE}>{value}</p>
    </div>
  );
}

function StayFields({ lead }: { lead: WhatsappLeadAdminRow }) {
  const nights = computeNights(lead.normalized_check_in, lead.normalized_check_out);
  const checkIn = lead.normalized_check_in
    ? `${lead.normalized_check_in} (parsed)`
    : nonEmpty(lead.check_in_text);
  const checkOut = lead.normalized_check_out
    ? `${lead.normalized_check_out} (parsed)`
    : nonEmpty(lead.check_out_text);
  return (
    <div style={FIELD_LIST}>
      <Field label="Villa" value={nonEmpty(lead.villa)} />
      <Field label="Check-in" value={checkIn} />
      <Field label="Check-out" value={checkOut} />
      <Field label="Nights" value={nights === null ? "—" : `${nights}`} />
      <Field label="Guests" value={nonEmpty(lead.guest_count)} />
      <Field label="Add-ons interest" value={nonEmpty(lead.addons_interest)} />
      <Field label="Special requests" value={nonEmpty(lead.special_requests)} />
    </div>
  );
}

function EventFields({ lead }: { lead: WhatsappLeadAdminRow }) {
  const eventType = lead.request_type?.trim() && lead.request_type.trim().toLowerCase() !== "event"
    ? lead.request_type.trim()
    : "Event (type not specified)";
  const dateText =
    [lead.check_in_text, lead.check_out_text].filter(Boolean).join(" → ") || "—";
  return (
    <div style={FIELD_LIST}>
      <Field label="Event type" value={eventType} />
      <Field label="Event date(s)" value={dateText} />
      <Field label="Villa" value={nonEmpty(lead.villa)} />
      <Field label="Guests" value={nonEmpty(lead.guest_count)} />
      <Field label="Add-ons interest" value={nonEmpty(lead.addons_interest)} />
      <Field label="Special requests" value={nonEmpty(lead.special_requests)} />
    </div>
  );
}

function OtherFields({ lead }: { lead: WhatsappLeadAdminRow }) {
  return (
    <div style={FIELD_LIST}>
      <Field label="Request type" value={nonEmpty(lead.request_type)} />
      <Field label="Villa" value={nonEmpty(lead.villa)} />
      <Field
        label="Dates mentioned"
        value={
          [lead.check_in_text, lead.check_out_text].filter(Boolean).join(" → ") || "—"
        }
      />
      <Field label="Guests" value={nonEmpty(lead.guest_count)} />
      <Field label="Add-ons interest" value={nonEmpty(lead.addons_interest)} />
      <Field label="Special requests" value={nonEmpty(lead.special_requests)} />
    </div>
  );
}

export default function RequestReviewPanel({ lead }: RequestReviewPanelProps) {
  const kind = requestKind(lead);

  return (
    <section aria-label="Pre-filled request summary" style={WRAPPER}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <p style={KICKER}>Pre-filled request summary</p>
        <p style={TITLE}>No booking has been created.</p>
        <p style={NOTICE}>
          Operational review only. No availability is held, no dates are
          reserved, no payment is taken.
        </p>
      </div>

      {kind === "stay" ? <StayFields lead={lead} /> : null}
      {kind === "event" ? <EventFields lead={lead} /> : null}
      {kind === "other" ? <OtherFields lead={lead} /> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <button
          type="button"
          disabled
          aria-disabled="true"
          tabIndex={-1}
          title="Available in a later phase"
          style={CONVERT_BUTTON}
        >
          Convert to booking request — available in a later phase
        </button>
        <p style={{ ...NOTICE, fontSize: "10px" }}>
          A future phase will wire this to the audited booking pipeline. For
          now, contact the guest on WhatsApp to confirm intent.
        </p>
      </div>
    </section>
  );
}
