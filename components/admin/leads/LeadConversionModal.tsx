"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BORDER, GOLD, LATO, MIDNIGHT, MUTED, SURFACE, WHITE, fieldStyle } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";
import { isStayLead } from "./leadHelpers";

const ALLOWED_VILLAS = ["Villa Mechmech", "Villa Byblos"] as const;
const BEDROOM_OPTIONS = ["1", "2", "3"] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ConversionDraft = {
  villa: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  sleepingGuests: string;
  bedrooms: string;
  specialRequests: string;
  addonsInterest: string;
};

type BookingCreateResponse = {
  booking?: {
    id?: unknown;
    [key: string]: unknown;
  };
  error?: string;
};

export interface LeadConversionModalProps {
  lead: WhatsappLeadAdminRow;
  onClose: () => void;
  onConverted: (lead: WhatsappLeadAdminRow) => void;
}

const OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  backgroundColor: "rgba(0,0,0,0.64)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "32px 16px",
  overflowY: "auto",
  boxSizing: "border-box",
};

const MODAL_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "720px",
  backgroundColor: MIDNIGHT,
  border: `1px solid ${BORDER}`,
  boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
  padding: "22px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const TITLE_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "16px",
  fontWeight: 600,
  color: WHITE,
  margin: 0,
};

const SUBTITLE_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  lineHeight: 1.6,
  color: MUTED,
  margin: "6px 0 0",
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  width: "100%",
  minWidth: 0,
};

const LABEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "1.8px",
  textTransform: "uppercase",
  color: MUTED,
  minWidth: 0,
};

const INPUT_STYLE: CSSProperties = {
  ...fieldStyle,
  backgroundColor: "rgba(255,255,255,0.04)",
  color: WHITE,
  borderColor: "rgba(197,164,109,0.28)",
  padding: "10px 12px",
  fontSize: "13px",
  colorScheme: "dark",
};

const TEXTAREA_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  minHeight: "86px",
  resize: "vertical",
};

const SOURCE_TEXT_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  lineHeight: 1.45,
  color: MUTED,
  margin: "2px 0 0",
  textTransform: "none",
  letterSpacing: "0.2px",
};

const NOTICE_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  lineHeight: 1.6,
  color: MUTED,
  border: `0.5px solid ${BORDER}`,
  backgroundColor: "rgba(197,164,109,0.05)",
  padding: "12px 14px",
  margin: 0,
};

const ERROR_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  lineHeight: 1.5,
  color: "#e07070",
  border: "0.5px solid rgba(224,112,112,0.35)",
  backgroundColor: "rgba(224,112,112,0.08)",
  padding: "10px 12px",
  margin: 0,
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MIDNIGHT,
  backgroundColor: GOLD,
  border: `1px solid ${GOLD}`,
  padding: "11px 16px",
  cursor: "pointer",
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  backgroundColor: "transparent",
  border: `0.5px solid ${GOLD}`,
  padding: "11px 16px",
  cursor: "pointer",
};

function normalizeCanonicalVilla(value: string | null): string {
  const raw = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/");
  const villaLookup: Record<string, (typeof ALLOWED_VILLAS)[number]> = {
    "villa mechmech": "Villa Mechmech",
    mechmech: "Villa Mechmech",
    mishmish: "Villa Mechmech",
    "villa byblos": "Villa Byblos",
    byblos: "Villa Byblos",
    jbeil: "Villa Byblos",
    "byblos/jbeil": "Villa Byblos",
  };
  if (raw in villaLookup) return villaLookup[raw];
  return "";
}

function parsePositiveIntegerText(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function defaultBedroomsForGuests(guestCount: number | null): "1" | "2" | "3" {
  if (guestCount !== null && guestCount <= 2) return "1";
  if (guestCount !== null && guestCount <= 4) return "2";
  return "3";
}

function isValidDateOnly(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const stamp = Date.UTC(year, month - 1, day);
  const round = new Date(stamp);
  return (
    round.getUTCFullYear() === year &&
    round.getUTCMonth() === month - 1 &&
    round.getUTCDate() === day
  );
}

function strictDateOrBlank(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  return isValidDateOnly(trimmed) ? trimmed : "";
}

function hasSourceDateText(lead: WhatsappLeadAdminRow): boolean {
  return Boolean(lead.check_in_text?.trim() || lead.check_out_text?.trim());
}

function sourceRangeLooksUnsafe(lead: WhatsappLeadAdminRow): boolean {
  const checkIn = lead.check_in_text?.trim() ?? "";
  const checkOut = lead.check_out_text?.trim() ?? "";
  if (!checkIn || !checkOut) return false;
  if (strictDateOrBlank(lead.normalized_check_in) && strictDateOrBlank(lead.normalized_check_out)) {
    return lead.normalized_check_out! <= lead.normalized_check_in!;
  }
  const inDay = checkIn.match(/\b([0-3]?\d)\b/);
  const outDay = checkOut.match(/\b([0-3]?\d)\b/);
  if (!inDay || !outDay) return false;
  const inNumber = Number(inDay[1]);
  const outNumber = Number(outDay[1]);
  if (!Number.isFinite(inNumber) || !Number.isFinite(outNumber)) return false;
  return outNumber <= inNumber;
}

function initialDraftForLead(lead: WhatsappLeadAdminRow): ConversionDraft {
  const guests = parsePositiveIntegerText(lead.guest_count);
  const guestText = guests !== null ? String(guests) : "";
  return {
    villa: normalizeCanonicalVilla(lead.villa),
    checkIn: strictDateOrBlank(lead.normalized_check_in),
    checkOut: strictDateOrBlank(lead.normalized_check_out),
    guestName: lead.name?.trim() ?? "",
    guestPhone: lead.phone?.trim() ?? "",
    guestEmail: "",
    sleepingGuests: guestText,
    bedrooms: defaultBedroomsForGuests(guests),
    specialRequests: lead.special_requests?.trim() ?? "",
    addonsInterest: lead.addons_interest?.trim() ?? "",
  };
}

function bedroomLabel(value: string): string {
  return `${value} ${value === "1" ? "Bedroom" : "Bedrooms"}`;
}

function buildBookingMessage(draft: ConversionDraft): string {
  const notes = draft.specialRequests.trim();
  const addonsInterest = draft.addonsInterest.trim();
  return [
    "[Stay Setup]",
    `Bedrooms to be used: ${bedroomLabel(draft.bedrooms)}`,
    `Estimated guests: ${draft.sleepingGuests.trim()}`,
    "Sleeping setup: To be reviewed by Oraya.",
    `Guest Notes: ${notes || "None"}`,
    `Add-ons interest: ${addonsInterest || "None"}`,
  ].join("\n");
}

function validateDraft(lead: WhatsappLeadAdminRow, draft: ConversionDraft): string | null {
  if (!isStayLead(lead)) return "This event lead cannot be converted in this phase.";
  if (lead.linked_booking_id) return "This lead is already linked to a booking request.";
  if (!ALLOWED_VILLAS.includes(draft.villa as (typeof ALLOWED_VILLAS)[number])) {
    return "Please select a villa.";
  }
  if (!draft.checkIn.trim() || !isValidDateOnly(draft.checkIn.trim())) {
    return "Please confirm the exact check-in date.";
  }
  if (!draft.checkOut.trim() || !isValidDateOnly(draft.checkOut.trim())) {
    return "Please confirm the exact check-out date.";
  }
  if (draft.checkOut.trim() <= draft.checkIn.trim()) return "Check-out must be after check-in.";
  if (!draft.guestName.trim()) return "Guest name is required.";
  if (!draft.guestPhone.trim() && !draft.guestEmail.trim()) return "Guest phone or email is required.";
  if (draft.guestEmail.trim() && !EMAIL_RE.test(draft.guestEmail.trim())) {
    return "Please enter a valid guest email address.";
  }
  const sleepingGuests = Number(draft.sleepingGuests.trim());
  if (!Number.isInteger(sleepingGuests) || sleepingGuests < 1) {
    return "Sleeping guests must be a positive number.";
  }
  if (!BEDROOM_OPTIONS.includes(draft.bedrooms as (typeof BEDROOM_OPTIONS)[number])) {
    return "Bedrooms must be 1, 2, or 3.";
  }
  return null;
}

function safeBookingError(status: number, raw: string | undefined): string {
  const lower = (raw ?? "").toLowerCase();
  if (status === 409 || lower.includes("unavailable") || lower.includes("already blocked")) {
    return "These dates are not available. The lead was not converted.";
  }
  if (
    lower.includes("pricing") ||
    lower.includes("add-on") ||
    lower.includes("addon") ||
    lower.includes("validate")
  ) {
    return "The booking request could not be created. Please review the details.";
  }
  return "Could not create booking request. Please try again.";
}

export default function LeadConversionModal({
  lead,
  onClose,
  onConverted,
}: LeadConversionModalProps) {
  const [draft, setDraft] = useState<ConversionDraft>(() => initialDraftForLead(lead));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDraft(initialDraftForLead(lead));
    setError("");
    setSubmitting(false);
  }, [lead]);

  const sourceDateText = useMemo(() => {
    const checkIn = lead.check_in_text?.trim() || "not captured";
    const checkOut = lead.check_out_text?.trim() || "not captured";
    return `${checkIn} -> ${checkOut}`;
  }, [lead.check_in_text, lead.check_out_text]);
  const dateHelperText = useMemo(() => {
    const hasNormalizedDates =
      strictDateOrBlank(lead.normalized_check_in) && strictDateOrBlank(lead.normalized_check_out);
    if (hasNormalizedDates || !hasSourceDateText(lead)) return "";
    if (sourceRangeLooksUnsafe(lead)) return "Captured dates need admin correction before conversion.";
    return "Source date text was captured from WhatsApp. Please enter exact dates in YYYY-MM-DD before creating the request.";
  }, [lead]);

  function set<K extends keyof ConversionDraft>(key: K, value: ConversionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const validationError = validateDraft(lead, draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const bookingBody = {
        villa: draft.villa.trim(),
        check_in: draft.checkIn.trim(),
        check_out: draft.checkOut.trim(),
        sleeping_guests: draft.sleepingGuests.trim(),
        day_visitors: "0",
        message: buildBookingMessage(draft),
        addons: [],
        guest_name: draft.guestName.trim(),
        guest_email: draft.guestEmail.trim() || null,
        guest_phone: draft.guestPhone.trim() || null,
        guest_country: null,
      };

      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingBody),
      });
      const bookingJson = (await bookingRes.json().catch(() => ({}))) as BookingCreateResponse;
      if (!bookingRes.ok) {
        setError(safeBookingError(bookingRes.status, bookingJson.error));
        return;
      }

      const bookingId = typeof bookingJson.booking?.id === "string" ? bookingJson.booking.id : "";
      if (!bookingId) {
        setError("Booking request was created, but no booking id was returned. The lead was not linked.");
        return;
      }

      const patchRes = await fetch(`/api/admin/leads/${lead.id}`, {
        ...adminApiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linked_booking_id: bookingId,
          follow_up_status: "converted",
        }),
      });
      const patchJson = (await patchRes.json().catch(() => ({}))) as {
        ok?: boolean;
        lead?: WhatsappLeadAdminRow;
      };
      if (!patchRes.ok || !patchJson.ok || !patchJson.lead) {
        setError(`Booking request was created (${bookingId}), but the lead could not be linked.`);
        return;
      }

      onConverted(patchJson.lead);
    } catch {
      setError("Could not create booking request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lead-conversion-title" style={OVERLAY_STYLE}>
      <div style={MODAL_STYLE}>
        <div>
          <h2 id="lead-conversion-title" style={TITLE_STYLE}>Prepare booking request</h2>
          <p style={SUBTITLE_STYLE}>
            This will create a pending booking request. It will not confirm
            availability, take payment, or share access details.
          </p>
        </div>

        <p style={NOTICE_STYLE}>
          Creating this request does not confirm the booking. Oraya must still
          review availability, pricing, add-ons, and payment.
        </p>

        <div style={GRID_STYLE}>
          <label style={LABEL_STYLE}>
            Villa
            <select
              value={draft.villa}
              onChange={(e) => set("villa", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
            >
              <option value="">Select villa</option>
              {ALLOWED_VILLAS.map((villa) => (
                <option key={villa} value={villa}>{villa}</option>
              ))}
            </select>
          </label>

          <label style={LABEL_STYLE}>
            Sleeping guests
            <input
              value={draft.sleepingGuests}
              onChange={(e) => set("sleepingGuests", e.target.value)}
              inputMode="numeric"
              style={INPUT_STYLE}
              disabled={submitting}
            />
          </label>

          <label style={LABEL_STYLE}>
            Check-in
            <input
              type="date"
              value={draft.checkIn}
              onChange={(e) => set("checkIn", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
            />
            <span style={SOURCE_TEXT_STYLE}>Source: {sourceDateText}</span>
            {dateHelperText ? <span style={SOURCE_TEXT_STYLE}>{dateHelperText}</span> : null}
          </label>

          <label style={LABEL_STYLE}>
            Check-out
            <input
              type="date"
              value={draft.checkOut}
              onChange={(e) => set("checkOut", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
            />
          </label>

          <label style={LABEL_STYLE}>
            Guest name
            <input
              value={draft.guestName}
              onChange={(e) => set("guestName", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
            />
          </label>

          <label style={LABEL_STYLE}>
            Guest phone
            <input
              value={draft.guestPhone}
              onChange={(e) => set("guestPhone", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
            />
          </label>

          <label style={LABEL_STYLE}>
            Guest email
            <input
              value={draft.guestEmail}
              onChange={(e) => set("guestEmail", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
              placeholder="Optional when phone exists"
            />
          </label>

          <label style={LABEL_STYLE}>
            Bedrooms to be used
            <select
              value={draft.bedrooms}
              onChange={(e) => set("bedrooms", e.target.value)}
              style={INPUT_STYLE}
              disabled={submitting}
            >
              {BEDROOM_OPTIONS.map((value) => (
                <option key={value} value={value}>{bedroomLabel(value)}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={LABEL_STYLE}>
          Special requests / notes
          <textarea
            value={draft.specialRequests}
            onChange={(e) => set("specialRequests", e.target.value)}
            style={TEXTAREA_STYLE}
            disabled={submitting}
          />
        </label>

        <label style={LABEL_STYLE}>
          Add-ons interest
          <textarea
            value={draft.addonsInterest}
            onChange={(e) => set("addonsInterest", e.target.value)}
            style={TEXTAREA_STYLE}
            disabled={submitting}
          />
          <span style={SOURCE_TEXT_STYLE}>
            Displayed as notes only. No add-on IDs are auto-selected from prose.
          </span>
        </label>

        {error ? <p role="alert" style={ERROR_STYLE}>{error}</p> : null}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              ...SECONDARY_BUTTON_STYLE,
              opacity: submitting ? 0.55 : 1,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            style={{
              ...PRIMARY_BUTTON_STYLE,
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "Creating..." : "Create pending request"}
          </button>
        </div>
      </div>
    </div>
  );
}
