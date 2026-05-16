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
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
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

const CONVERT_CONTAINER: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "14px 16px",
  border: `1px dashed rgba(197,164,109,0.45)`,
  backgroundColor: "rgba(197,164,109,0.04)",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const CONVERT_LABEL_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const CONVERT_KICKER: CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2.5px",
  textTransform: "uppercase",
  color: GOLD,
  margin: 0,
};

const FUTURE_BADGE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "#1F2B38", // MIDNIGHT — solid background calls out the future-phase state
  backgroundColor: GOLD,
  borderRadius: "2px",
  whiteSpace: "nowrap",
};

const CONVERT_BUTTON: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  fontFamily: LATO,
  fontSize: "11px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: WHITE,
  backgroundColor: "transparent",
  border: `1px dashed ${MUTED}`,
  padding: "12px 16px",
  cursor: "not-allowed",
  opacity: 0.95, // clearly visible — the dashed border + DISABLED badge carry the "inert" signal
  alignSelf: "flex-start",
  maxWidth: "100%",
  flexWrap: "wrap" as CSSProperties["flexWrap"],
  textAlign: "left" as CSSProperties["textAlign"],
};

const DISABLED_BADGE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 6px",
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: MUTED,
  border: `0.5px solid ${MUTED}`,
  borderRadius: "2px",
  whiteSpace: "nowrap",
};

const CONVERT_HELP: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  lineHeight: 1.5,
  color: MUTED,
  margin: 0,
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

      <div style={CONVERT_CONTAINER}>
        <div style={CONVERT_LABEL_ROW}>
          <p style={CONVERT_KICKER}>Future booking conversion</p>
          <span style={FUTURE_BADGE}>Later phase</span>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          tabIndex={-1}
          title="Available in a later phase — not active yet"
          style={CONVERT_BUTTON}
        >
          <span style={DISABLED_BADGE}>Disabled</span>
          <span>Convert to booking request — available in a later phase</span>
        </button>
        <p style={CONVERT_HELP}>
          This lead is only a request summary. Booking conversion will be added
          in a later controlled phase. For now, contact the guest on WhatsApp
          to confirm intent.
        </p>
      </div>
    </section>
  );
}
