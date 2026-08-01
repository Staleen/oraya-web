"use client";
import { memo, type ReactNode } from "react";
import type { Booking } from "../types";
import { BORDER, fmt, GOLD, LATO, MUTED, PLAYFAIR, WHITE } from "../theme";
import {
  BookingRefBadge,
  StatusBadge,
  addonHasTrackedOffer,
  completedHistoryFeedbackLine,
  formatDateTimeValue,
  formatEventOrStayDateLine,
  formatMoney,
  getCompletedHistoryTotalDisplay,
  getPaymentStatus,
  isEventInquiryBooking,
  renderPaymentStatusBadge,
} from "./helpers";
import type { BookingCardActions } from "./actions";
import { formatBookingRef } from "./booking-ref";
import { parseEventSetupEstimateFromMessage } from "@/lib/event-inquiry-message";

/**
 * Remediation 2 (B.1) — renderCompactRow extracted verbatim into a memoized
 * child. Cross-booking lookups (member name, confirmed-conflict hold,
 * dead-day upsells) arrive as scalar props computed by the parent, and the
 * expanded body arrives as `expandedContent` (null while collapsed), so
 * collapsed rows keep identical props across unrelated updates.
 */
function CompactRowImpl({
  booking,
  section,
  confirmedBand,
  expanded,
  isMobile,
  displayName,
  conflictHoldRow,
  conflictHoldReason,
  hasDeadDayUpsell,
  expandedContent,
  actions,
}: {
  booking: Booking;
  section: "confirmed" | "cancelled" | "pending";
  confirmedBand?: "upcoming" | "completed";
  expanded: boolean;
  isMobile: boolean;
  displayName: string;
  conflictHoldRow: boolean;
  conflictHoldReason: string | null;
  hasDeadDayUpsell: boolean;
  expandedContent: ReactNode;
  actions: BookingCardActions;
}) {
    
    const isCompletedBand = section === "confirmed" && confirmedBand === "completed";
    const dateLine = section === "confirmed" ? formatEventOrStayDateLine(booking) : `${fmt(booking.check_in)} to ${fmt(booking.check_out)}`;
    
    const accent = section === "confirmed" ? "#6fcf8a" : section === "cancelled" ? "#e07070" : conflictHoldRow ? "#e07070" : GOLD;
    
    
    const feedbackEmphasisForExpand: "completed" | "upcoming" =
      section === "confirmed" && confirmedBand === "completed" ? "completed" : "upcoming";
    const submittedAt = section === "pending" ? formatDateTimeValue(booking.created_at) : null;
    const rowIsEvent = isEventInquiryBooking(booking);
    const rowKind = rowIsEvent ? "Event inquiry" : "Stay booking";
    const rowEventType = booking.event_type?.trim() || null;
    const rowSetupEst = rowIsEvent ? parseEventSetupEstimateFromMessage(booking.message) : null;
    const rowSetupTotal =
      typeof rowSetupEst?.total === "number" && Number.isFinite(rowSetupEst.total) ? rowSetupEst.total : null;
    const rowSetupDisplay = rowSetupTotal !== null ? formatMoney(rowSetupTotal) : null;
    const rowProposalHint =
      section === "pending" && rowIsEvent
        ? booking.proposal_status === "accepted" && booking.status === "pending"
          ? "Accepted · awaiting deposit"
          : booking.proposal_status === "sent"
            ? "Proposal sent"
            : booking.proposal_status === "draft"
              ? "Proposal draft"
              : booking.proposal_status === "declined"
                ? "Proposal declined"
                : null
        : null;
    // Bug 10: ordered, semicolon-style line keeps related signals grouped (kind & event type | dates & villa | submitted | totals & state).
    const pendingSummaryLine =
      section === "pending" && submittedAt
        ? [
            [rowKind, rowEventType].filter(Boolean).join(" · "),
            `${fmt(booking.check_in)} → ${fmt(booking.check_out)}`,
            booking.villa,
            `Submitted ${submittedAt}`,
            rowSetupDisplay ? `Est. setup ${rowSetupDisplay}` : null,
            rowProposalHint,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;

    return (
      <div
        key={booking.id}
        style={{
          border: `0.5px solid ${BORDER}`,
          borderRadius: "16px",
          backgroundColor: isCompletedBand ? "rgba(197,164,109,0.04)" : "rgba(255,255,255,0.02)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <button
            type="button"
            onClick={() => actions.toggleExpandedCompact(booking.id)}
            style={{
              flex: 1,
              minWidth: 0,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr auto" : "minmax(0, 1.15fr) minmax(0, 0.9fr) auto auto",
              gap: "12px",
              alignItems: "center",
              textAlign: "left",
              border: "none",
              backgroundColor: "transparent",
              color: WHITE,
              padding: isMobile ? "14px 16px" : "14px 18px",
              cursor: "pointer",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "1.18rem" : "1.35rem", color: WHITE, margin: "0 0 4px" }}>
                {displayName}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                {booking.villa}
              </p>
              {pendingSummaryLine && (
                <p
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    color: "rgba(245,241,235,0.72)",
                    margin: "8px 0 0",
                    lineHeight: 1.45,
                  }}
                >
                  {pendingSummaryLine}
                </p>
              )}
              {isCompletedBand && (
                <>
                  <p style={{ fontFamily: LATO, fontSize: "10px", color: "rgba(255,255,255,0.55)", margin: "8px 0 0", lineHeight: 1.45 }}>
                    {isEventInquiryBooking(booking) ? "Proposal / est. total" : "Est. total"} · {getCompletedHistoryTotalDisplay(booking)}
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "9px", color: MUTED, margin: "4px 0 0", lineHeight: 1.4 }}>
                    {completedHistoryFeedbackLine(booking)}
                  </p>
                </>
              )}
            </div>

            {!isMobile && (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: 0, lineHeight: 1.5 }}>
                {dateLine}
              </p>
            )}

            <div style={{ display: "grid", gap: "6px", justifyItems: isMobile ? "end" : "start" }}>
              {isMobile && (
                <p
                  style={{
                    fontFamily: LATO,
                    fontSize: "12px",
                    color: MUTED,
                    margin: 0,
                    textAlign: "right",
                    lineHeight: 1.5,
                  }}
                >
                  {dateLine}
                </p>
              )}
            <BookingRefBadge bookingRef={formatBookingRef(booking.id)} />
            <StatusBadge status={booking.status} />
            {section === "confirmed" && renderPaymentStatusBadge(booking)}
            {/* Phase 14A: pending-row payment + conflict badges */}
            {section === "pending" && getPaymentStatus(booking) === "payment_requested" && renderPaymentStatusBadge(booking)}
            {/* Phase 14B: Event Inquiry badge (visible whenever the booking is classified as an event inquiry) */}
            {isEventInquiryBooking(booking) && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                  color: "#9db7d9",
                  backgroundColor: "rgba(157,183,217,0.14)",
                  border: "0.5px solid rgba(157,183,217,0.32)",
                  padding: "5px 9px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Event Inquiry{booking.event_type ? ` · ${booking.event_type}` : ""}
              </span>
            )}
            {section === "pending" && conflictHoldRow && conflictHoldReason && (
              <span
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: isMobile ? "flex-end" : "flex-start",
                  gap: "3px",
                  maxWidth: "100%",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: LATO,
                    fontSize: "9px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: "#e07070",
                    backgroundColor: "rgba(224,112,112,0.12)",
                    border: "0.5px solid rgba(224,112,112,0.32)",
                    padding: "5px 9px",
                    borderRadius: "6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Conflict / On Hold
                </span>
                <span
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    color: MUTED,
                    lineHeight: 1.3,
                    textAlign: isMobile ? "right" : "left",
                  }}
                >
                  {conflictHoldReason}
                </span>
              </span>
            )}
            {hasDeadDayUpsell && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                  color: "#7ecfcf",
                  backgroundColor: "rgba(126,207,207,0.12)",
                  border: "0.5px solid rgba(126,207,207,0.28)",
                  padding: "5px 9px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Upsell
              </span>
            )}
            {(booking.addons_snapshot ?? []).some((addon) => addonHasTrackedOffer(addon)) && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                  color: "#7ecfcf",
                  backgroundColor: "rgba(126,207,207,0.12)",
                  border: "0.5px solid rgba(126,207,207,0.28)",
                  padding: "5px 9px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Offer used
              </span>
            )}
          </div>

              <span
                style={{
                  color: accent,
                  fontFamily: LATO,
                  fontSize: "12px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {expanded ? "Close" : "View"}
              </span>
            </button>
            {isCompletedBand && (
              <button
                type="button"
                title="Prepare feedback request (opens details + message)"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.prepFeedbackForBooking(booking.id);
                }}
                style={{
                  width: "52px",
                  flexShrink: 0,
                  alignSelf: "stretch",
                  border: "none",
                  borderLeft: `0.5px solid ${BORDER}`,
                  backgroundColor: "rgba(197,164,109,0.14)",
                  color: GOLD,
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "0.8px",
                  lineHeight: 1.25,
                  textTransform: "uppercase",
                  cursor: "pointer",
                  padding: "6px 4px",
                }}
              >
                Prep
                <br />
                FB
              </button>
            )}
          </div>

        {expanded && expandedContent != null && (
          <div style={{ padding: "0 12px 12px" }}>
            {expandedContent}
          </div>
        )}
      </div>
    );
}

export const CompactRow = memo(CompactRowImpl);
