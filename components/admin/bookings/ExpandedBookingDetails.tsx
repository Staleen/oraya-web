"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Booking, Member } from "../types";
import { AddonIcon } from "@/components/addon-icon";
import { BORDER, fieldStyle, fmt, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "../theme";
import CopyValueButton from "@/components/CopyValueButton";
import {
  StatusBadge,
  addonHasTrackedOffer,
  addonNeedsAttention,
  buildAlternativeOfferMessage,
  cancelFlowLikelySendsEmail,
  computeDefaultProposalPanelOpen,
  dateOnlyGapDays,
  eventInquiryNightCount,
  formatAddonPrice,
  formatDateTimeValue,
  formatEventProposalServiceLabel,
  formatMoney,
  getAddonRiskWarning,
  getAddonStatusTone,
  getBookingPaymentBasis,
  getBookingRevenueData,
  getBookingTotal,
  getCardAccent,
  getCompletedHistoryTotalDisplay,
  getOverlapComparisonTotal,
  getPaymentStatus,
  getPersistedStayValue,
  getPricingIntelligenceMeta,
  getSnapshotNumber,
  getStaySubtotalForOverlapComparison,
  hasDiscountPriceMetadata,
  hasResolvedAddonStatus,
  isBookingCheckedOutAfter,
  isEventInquiryBooking,
  isPaymentDueSoon,
  isPaymentOverdue,
  renderOperationalBadge,
  renderPaymentStatusBadge,
  renderRevenueEstimateRow,
  type DeadDayUpsellOpportunity,
} from "./helpers";
import { addDaysToDateOnly } from "@/lib/calendar/event-block";
import { findAlternativeDateSuggestions, type AlternativeSuggestion } from "@/lib/calendar/alternative-dates";
import {
  extractEventInquiryGuestNotesLine,
  parseEventSetupEstimateFromMessage,
} from "@/lib/event-inquiry-message";
import { parseRequestedEventServicesFromMessage } from "./helpers";

/**
 * Remediation 2 (B.1) — renderExpandedBookingDetails extracted verbatim from
 * BookingsTable. It renders ONLY for the expanded card (CompactRow passes
 * null while collapsed), so it is deliberately NOT memoized: its inputs span
 * cross-booking data (overlap cards, alternative dates, the bookings list)
 * whose identities change every parent render, and at most one card is open.
 * The parent's closures arrive through the `deps` bag unchanged.
 */
export interface ExpandedDetailsDeps {
  approveAllAddonsAndConfirm: (booking: Booking) => void;
  copyArrivalGuideLink: (booking: Booking) => void;
  updateStatus: (id: string, status: "confirmed" | "cancelled") => Promise<void> | void;
  getMember: (booking: Booking) => Member | null | undefined;
  getBookingDisplayName: (booking: Booking) => string;
  getConfirmedConflicts: (booking: Booking) => Booking[];
  getPendingOverlaps: (booking: Booking) => Booking[];
  getDeadDayUpsells: (booking: Booking) => DeadDayUpsellOpportunity[];
  getBookingOfferSavingsTotal: (booking: Booking) => number | null;
  bookingHasDiscountedAddon: (booking: Booking) => boolean;
  bookingHasOperationalAttention: (booking: Booking) => boolean;
  bookingHasPendingAddonApproval: (booking: Booking) => boolean;
  getAddonSnapshots: (booking: Booking) => NonNullable<Booking["addons_snapshot"]>;
  renderAddonRows: (booking: Booking) => ReactNode;
  renderEventProposalSection: (booking: Booking) => ReactNode;
  renderPaymentSection: (booking: Booking) => ReactNode;
  renderGuestFeedbackSection: (booking: Booking, emphasis?: "completed" | "upcoming") => ReactNode;
  renderExpandedBookingDetails: (
    booking: Booking,
    compactMode: boolean,
    feedbackEmphasis?: "completed" | "upcoming",
  ) => ReactNode;
  setActiveOfferKey: (updater: string | null | ((prev: string | null) => string | null)) => void;
  setCopiedOfferKey: (updater: string | null | ((prev: string | null) => string | null)) => void;
  setBookingCardPanels: React.Dispatch<
    React.SetStateAction<Record<string, Partial<Record<"proposal" | "payment" | "guestDetail" | "operationsContext" | "feedback" | "addons", boolean>>>>
  >;
  updatingId: string | null;
  bulkActionBookingId: string | null;
  activeOfferKey: string | null;
  copiedOfferKey: string | null;
  bookingCardPanels: Record<string, Partial<Record<"proposal" | "payment" | "guestDetail" | "operationsContext" | "feedback" | "addons", boolean>>>;
  isMobile: boolean;
  bookings: Booking[];
  arrivalLinkFetchingId: string | null;
  arrivalLinkCopiedBookingId: string | null;
  conflictSuggestionsMap: Map<string, AlternativeSuggestion[]>;
  emailWarnings: Record<string, string>;
}

export function ExpandedBookingDetails({
  booking,
  compactMode,
  feedbackEmphasis = "upcoming",
  deps,
}: {
  booking: Booking;
  compactMode: boolean;
  feedbackEmphasis?: "completed" | "upcoming";
  deps: ExpandedDetailsDeps;
}) {
    const isGuest = !booking.member_id;
    const memberInfo = deps.getMember(booking);
    const displayName = isGuest ? booking.guest_name ?? "Guest" : memberInfo?.full_name ?? "Member";
    const displayEmail = isGuest ? booking.guest_email ?? "-" : memberInfo?.email ?? "-";
    const displayPhone = isGuest ? booking.guest_phone : memberInfo?.phone ?? null;
    const displayCountry = isGuest ? booking.guest_country : memberInfo?.country ?? null;
    const needsApproval = deps.bookingHasPendingAddonApproval(booking);
    const needsAttention = deps.bookingHasOperationalAttention(booking);
    const readyToConfirm = booking.status === "pending" && !needsApproval && !needsAttention;
    const accent = getCardAccent(booking, needsApproval || needsAttention || booking.status === "pending");
    const isUpdating = deps.updatingId === booking.id;
    const isBulkResolving = deps.bulkActionBookingId === booking.id;
    const eventInquiry = isEventInquiryBooking(booking);
    const eventSetupEstimate = eventInquiry ? parseEventSetupEstimateFromMessage(booking.message) : null;
    const eventGuestNotes = eventInquiry ? extractEventInquiryGuestNotesLine(booking.message) : null;
    const eventNightCount = eventInquiry ? eventInquiryNightCount(booking.check_in, booking.check_out) : 0;
    const eventInquiryParsedServices = eventInquiry ? parseRequestedEventServicesFromMessage(booking.message) : [];
    const stayReferenceSubtotal =
      typeof booking.pricing_snapshot?.adjusted_stay_subtotal === "number"
        ? booking.pricing_snapshot.adjusted_stay_subtotal
        : typeof booking.pricing_snapshot?.subtotal === "number"
          ? booking.pricing_snapshot.subtotal
          : typeof booking.pricing_subtotal === "number"
            ? booking.pricing_subtotal
            : null;
    const stayAddonSnapshots = booking.addons_snapshot ?? [];
    // Phase 14A: a pending booking that overlaps a confirmed booking cannot be confirmed without manual resolution.
    const confirmedConflicts = deps.getConfirmedConflicts(booking);
    const conflictHold = booking.status === "pending" && confirmedConflicts.length > 0;
    const confirmedHasEventBlocker = conflictHold && confirmedConflicts.some((c) => isEventInquiryBooking(c));
    const confirmedHasStayBlocker = conflictHold && confirmedConflicts.some((c) => !isEventInquiryBooking(c));
    const conflictPrimaryReason = !conflictHold
      ? ""
      : eventInquiry
        ? confirmedHasEventBlocker && confirmedHasStayBlocker
          ? "This event date conflicts with the calendar due to venue scheduling (including event setup windows) and overlapping stay dates."
          : confirmedHasEventBlocker
            ? "This event date conflicts with the calendar due to venue scheduling (including another event's setup window)."
            : "This event date conflicts with existing stay dates on the calendar."
        : confirmedHasEventBlocker && confirmedHasStayBlocker
          ? "These stay dates overlap a confirmed stay and an event setup window from venue scheduling."
          : confirmedHasEventBlocker
            ? "These stay dates overlap an event setup window from venue scheduling."
            : "These stay dates overlap a confirmed stay on the calendar.";
    const cancelAdvisoryForConflictHold = conflictHold
      ? cancelFlowLikelySendsEmail(booking, memberInfo?.email)
        ? "Cancelling will notify the guest through the existing cancellation flow."
        : "Cancelling changes the request status only. Contact the guest separately."
      : "";
    const proposalAccepted = booking.proposal_status === "accepted";
    const canConfirm = booking.status === "pending" && !needsApproval && !conflictHold && (!eventInquiry || proposalAccepted);
    const canCancel = booking.status === "pending" || booking.status === "confirmed";
    const overlappingPendingBookings = deps.getPendingOverlaps(booking);
    const hasPendingOverlap = overlappingPendingBookings.length > 0;
    const deadDayUpsells = deps.getDeadDayUpsells(booking);
    const hasDeadDayUpsell = deadDayUpsells.length > 0;
    const offerSavingsTotal = deps.getBookingOfferSavingsTotal(booking);
    const hasTrackedOffer = deps.bookingHasDiscountedAddon(booking);

    // Phase 13N: relative (comparison-based) revenue priority. Only meaningful when overlapping pending requests exist.
    // When overlaps exist, compare event setup estimate vs stay subtotal (not full stay+addons) so mixed requests are legible.
    const currentBookingTotal = hasPendingOverlap ? getOverlapComparisonTotal(booking) : getBookingTotal(booking);
    const overlapTotalsAll = hasPendingOverlap
      ? overlappingPendingBookings.map(getOverlapComparisonTotal)
      : [];
    const overlapTotalsNumeric = overlapTotalsAll.filter((n): n is number => typeof n === "number");
    const allNumericTotals = typeof currentBookingTotal === "number"
      ? [currentBookingTotal, ...overlapTotalsNumeric]
      : overlapTotalsNumeric;
    let revenueTier: "high" | "medium" | "low" | null = null;
    let bestOptionTotal: number | null = null;
    let isCurrentBest = false;
    if (
      booking.status === "pending" &&
      hasPendingOverlap &&
      typeof currentBookingTotal === "number" &&
      overlapTotalsNumeric.length > 0
    ) {
      const max = Math.max(...allNumericTotals);
      const min = Math.min(...allNumericTotals);
      bestOptionTotal = max;
      isCurrentBest = currentBookingTotal === max;
      if (max === min) {
        revenueTier = "medium";
      } else if (currentBookingTotal === max) {
        revenueTier = "high";
      } else if (currentBookingTotal === min) {
        revenueTier = "low";
      } else {
        revenueTier = "medium";
      }
    }
    const dueSoon = isPaymentDueSoon(booking) && !isPaymentOverdue(booking);

    return (
      <div
        style={{
          position: "relative",
          background: compactMode
            ? "linear-gradient(180deg, rgba(29,40,55,0.94) 0%, rgba(24,34,48,0.94) 100%)"
            : "linear-gradient(180deg, rgba(31,43,56,0.98) 0%, rgba(27,38,53,0.98) 100%)",
          border: `0.5px solid ${accent.border}`,
          borderRadius: compactMode ? "0 0 18px 18px" : "18px",
          padding: deps.isMobile ? "1rem" : "1.45rem 1.5rem",
          boxShadow: compactMode ? "none" : `0 18px 44px rgba(0,0,0,0.24), inset 0 0 0 1px ${accent.glow}`,
          display: "grid",
          gap: deps.isMobile ? "14px" : "18px",
        }}
      >
        {!compactMode && (
          <span
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              backgroundColor: accent.color,
              boxShadow: `0 0 0 3px ${accent.glow}`,
            }}
          />
        )}

        {/* Phase 13N: Best option highlight — only when overlapping pending requests exist */}
        {bestOptionTotal !== null && (
          <div
            style={{
              border: `0.5px solid ${isCurrentBest ? "rgba(126,207,207,0.32)" : "rgba(240,189,103,0.32)"}`,
              backgroundColor: isCurrentBest ? "rgba(126,207,207,0.08)" : "rgba(240,189,103,0.08)",
              padding: "10px 14px",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: isCurrentBest ? "#7ecfcf" : "#f0bd67", margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
              Best option: ${bestOptionTotal.toLocaleString("en-US")} booking
              {isCurrentBest ? " — this request" : " — review competing request"}
            </p>
          </div>
        )}

        {/* Phase 13N: payment due soon (within 24h, not overdue) — overdue uses the existing 13L.5 warning */}
        {dueSoon && (
          <div
            style={{
              border: "0.5px solid rgba(240,189,103,0.32)",
              backgroundColor: "rgba(240,189,103,0.08)",
              padding: "8px 12px",
              borderRadius: "6px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f0bd67", margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
              Payment due soon
            </p>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 260px", paddingLeft: compactMode ? 0 : deps.isMobile ? "12px" : "14px" }}>
            <p
              style={{
                fontFamily: PLAYFAIR,
                fontSize: compactMode ? (deps.isMobile ? "1.4rem" : "1.65rem") : deps.isMobile ? "1.7rem" : "2rem",
                color: WHITE,
                margin: "0 0 8px",
                lineHeight: 1.05,
              }}
            >
              {displayName}
            </p>
            <p
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2.6px",
                textTransform: "uppercase",
                color: isGuest ? "rgba(245,241,235,0.72)" : GOLD,
                margin: 0,
              }}
            >
              {isGuest ? "Guest" : "Member"}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
              justifyItems: deps.isMobile ? "start" : "end",
              minWidth: deps.isMobile ? "100%" : "auto",
            }}
          >
            <StatusBadge status={booking.status} />
            {booking.status === "confirmed" && renderPaymentStatusBadge(booking)}
            {eventInquiry && booking.status === "pending" && booking.proposal_status === "sent" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                  color: GOLD,
                  backgroundColor: "rgba(197,164,109,0.12)",
                  border: "0.5px solid rgba(197,164,109,0.28)",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                }}
              >
                Proposal sent
              </span>
            )}
            {eventInquiry && booking.status === "pending" && booking.proposal_status === "accepted" && (
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
                  padding: "6px 10px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                }}
              >
                Ready to confirm
              </span>
            )}
            {/* Phase 13N: relative revenue priority — only when overlapping pending requests exist */}
            {revenueTier && (() => {
              const tierLabel =
                revenueTier === "high" ? "High value"
                : revenueTier === "low" ? "Low value"
                : "Medium value";
              const tierColor =
                revenueTier === "high" ? "#7ecfcf"
                : revenueTier === "low" ? MUTED
                : GOLD;
              const tierBorder =
                revenueTier === "high" ? "rgba(126,207,207,0.32)"
                : revenueTier === "low" ? "rgba(255,255,255,0.18)"
                : "rgba(197,164,109,0.32)";
              const tierBg =
                revenueTier === "high" ? "rgba(126,207,207,0.12)"
                : revenueTier === "low" ? "rgba(255,255,255,0.04)"
                : "rgba(197,164,109,0.12)";
              return (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: LATO,
                    fontSize: "9px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: tierColor,
                    backgroundColor: tierBg,
                    border: `0.5px solid ${tierBorder}`,
                    padding: "6px 10px",
                    borderRadius: "999px",
                  }}
                >
                  {tierLabel}
                </span>
              );
            })()}
            {hasDeadDayUpsell && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "#7ecfcf",
                  backgroundColor: "rgba(126,207,207,0.12)",
                  border: "0.5px solid rgba(126,207,207,0.32)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Upsell opportunity
              </span>
            )}
            {hasPendingOverlap && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "#f0bd67",
                  backgroundColor: "rgba(240,189,103,0.12)",
                  border: "0.5px solid rgba(240,189,103,0.38)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                ⚠️ Overlapping request
              </span>
            )}
            {needsApproval && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: accent.color,
                  backgroundColor: accent.glow,
                  border: `0.5px solid ${accent.border}`,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Approval needed
              </span>
            )}
            {readyToConfirm && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "#6fcf8a",
                  backgroundColor: "rgba(80,180,100,0.12)",
                  border: "0.5px solid rgba(111,207,138,0.34)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Ready to confirm
              </span>
            )}
            {hasTrackedOffer && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "#7ecfcf",
                  backgroundColor: "rgba(126,207,207,0.12)",
                  border: "0.5px solid rgba(126,207,207,0.3)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                Offer used
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: deps.isMobile ? "1fr" : "auto 1fr",
            alignItems: "center",
            gap: "14px",
            border: `0.5px solid ${accent.border}`,
            borderRadius: "14px",
            backgroundColor: "rgba(255,255,255,0.03)",
            padding: deps.isMobile ? "14px 16px" : "18px 20px",
          }}
        >
          <div
            style={{
              width: deps.isMobile ? "44px" : "48px",
              height: deps.isMobile ? "44px" : "48px",
              borderRadius: "12px",
              border: `0.5px solid ${accent.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: accent.color,
              fontFamily: LATO,
              fontSize: deps.isMobile ? "18px" : "20px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            01
          </div>
          <p
            style={{
              fontFamily: LATO,
              fontSize: compactMode ? (deps.isMobile ? "1.25rem" : "1.5rem") : deps.isMobile ? "1.5rem" : "2rem",
              fontWeight: 700,
              color: WHITE,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {eventInquiry && (
              <span
                style={{
                  display: "block",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                  color: "#9db7d9",
                  marginBottom: "6px",
                }}
              >
                Event inquiry · requested event dates
              </span>
            )}
            {eventInquiry
              ? `${fmt(booking.check_in)} → ${fmt(booking.check_out)}`
              : `${fmt(booking.check_in)} to ${fmt(booking.check_out)}`}
          </p>
        </div>

        <div style={{ display: "grid", gap: "12px", color: MUTED }}>
          {eventInquiry ? (
            <>
              <div
                style={{
                  border: "0.5px solid rgba(157,183,217,0.22)",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  backgroundColor: "rgba(157,183,217,0.05)",
                }}
              >
                <p
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "#9db7d9",
                    margin: "0 0 10px",
                    fontWeight: 600,
                  }}
                >
                  Event basics
                </p>
                <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: "0 0 6px", lineHeight: 1.55 }}>{booking.villa}</p>
                <p style={{ fontFamily: LATO, fontSize: "12px", margin: "0 0 4px", lineHeight: 1.55 }}>
                  {fmt(booking.check_in)} → {fmt(booking.check_out)}
                  {eventNightCount > 0 ? ` · ${eventNightCount} night${eventNightCount === 1 ? "" : "s"}` : ""}
                </p>
                {booking.event_type ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", margin: 0, lineHeight: 1.55 }}>
                    Event type · <span style={{ color: GOLD }}>{booking.event_type}</span>
                  </p>
                ) : null}
                <p style={{ fontFamily: LATO, fontSize: "12px", margin: "8px 0 0", lineHeight: 1.55 }}>
                  Attendees · <span style={{ color: WHITE }}>{booking.day_visitors}</span>
                  {" · "}
                  Host overnight stay · <span style={{ color: WHITE }}>{booking.sleeping_guests}</span>
                </p>
              </div>

              <details
                style={{
                  border: "0.5px solid rgba(157,183,217,0.22)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  backgroundColor: "rgba(157,183,217,0.04)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: "#9db7d9",
                  }}
                >
                  Guest inquiry detail
                </summary>
                <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
              {eventSetupEstimate ? (
                <div
                  style={{
                    border: "0.5px solid rgba(197,164,109,0.22)",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    backgroundColor: "rgba(197,164,109,0.06)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: LATO,
                      fontSize: "10px",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: GOLD,
                      margin: "0 0 8px",
                      fontWeight: 600,
                    }}
                  >
                    Estimated event setup
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 10px", lineHeight: 1.55 }}>
                    Starting from · non-binding. Final proposal after Oraya review.
                  </p>
                  {(() => {
                    const pk = eventSetupEstimate.pack_keys ?? [];
                    const rec = eventSetupEstimate.recommended_subtotal;
                    const upg = eventSetupEstimate.upgrades_subtotal;
                    const showBreakdown =
                      pk.length > 0 && typeof rec === "number" && typeof upg === "number";
                    if (!showBreakdown) return null;
                    return (
                      <div style={{ display: "grid", gap: "6px", marginBottom: "10px" }}>
                        <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.88)", margin: 0 }}>
                          Recommended setup · {formatMoney(rec) ?? "—"}
                        </p>
                        {upg > 0 ? (
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.88)", margin: 0 }}>
                            Optional upgrades selected · {formatMoney(upg) ?? "—"}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}
                  <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>
                    Estimated event setup total
                  </p>
                  <p style={{ fontFamily: PLAYFAIR, fontSize: "22px", color: WHITE, margin: 0 }}>
                    {formatMoney(eventSetupEstimate.total) ?? "—"}
                  </p>
                </div>
              ) : null}

              <div
                style={{
                  border: "0.5px solid rgba(197,164,109,0.2)",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
              >
                <p
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: GOLD,
                    margin: "0 0 10px",
                    fontWeight: 600,
                  }}
                >
                  Selected services
                </p>
                {eventSetupEstimate && eventSetupEstimate.lines.length > 0 ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto auto",
                        gap: "10px",
                        alignItems: "baseline",
                        fontFamily: LATO,
                        fontSize: "10px",
                        letterSpacing: "0.6px",
                        textTransform: "uppercase",
                        color: MUTED,
                        paddingBottom: "4px",
                        borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span>Service</span>
                      <span>Qty</span>
                      <span style={{ textAlign: "right" }}>Unit</span>
                      <span style={{ textAlign: "right" }}>Subtotal</span>
                    </div>
                    {eventSetupEstimate.lines.map((row, i) => (
                      <div
                        key={`${row.label}-${i}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto auto",
                          gap: "10px",
                          alignItems: "baseline",
                          fontFamily: LATO,
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.88)",
                        }}
                      >
                        <span>{row.label}</span>
                        <span style={{ color: MUTED }}>×{row.quantity}</span>
                        <span style={{ color: MUTED, textAlign: "right" }}>{formatMoney(row.unit_price) ?? "—"}</span>
                        <span style={{ textAlign: "right", color: WHITE }}>{formatMoney(row.line_total) ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : eventInquiryParsedServices.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "18px", fontFamily: LATO, fontSize: "12px", lineHeight: 1.7 }}>
                    {eventInquiryParsedServices.map((s) => (
                      <li key={s.key}>{formatEventProposalServiceLabel(s)}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontFamily: LATO, fontSize: "12px", margin: 0 }}>—</p>
                )}
              </div>

              {(stayReferenceSubtotal !== null || stayAddonSnapshots.length > 0) && (
                <div
                  style={{
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    backgroundColor: "rgba(255,255,255,0.02)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: LATO,
                      fontSize: "10px",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: MUTED,
                      margin: "0 0 10px",
                      fontWeight: 600,
                    }}
                  >
                    Host overnight stay reference
                  </p>
                  {stayReferenceSubtotal !== null ? (
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: "0 0 10px", lineHeight: 1.55 }}>
                      Villa nights (reference, non-binding) · {formatMoney(stayReferenceSubtotal) ?? "—"}
                    </p>
                  ) : null}
                  {stayAddonSnapshots.length > 0 ? (
                    <>
                      <p
                        style={{
                          fontFamily: LATO,
                          fontSize: "10px",
                          letterSpacing: "1.2px",
                          textTransform: "uppercase",
                          color: MUTED,
                          margin: "0 0 6px",
                        }}
                      >
                        Villa add-ons
                      </p>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontFamily: LATO, fontSize: "12px", lineHeight: 1.65 }}>
                        {stayAddonSnapshots.map((addon) => (
                          <li key={addon.id}>
                            {addon.label}
                            {typeof addon.price === "number" ? ` · ${formatAddonPrice(addon.price)}` : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                      No villa add-ons on this inquiry.
                    </p>
                  )}
                </div>
              )}

              <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "14px 16px" }}>
                <p
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: MUTED,
                    margin: "0 0 8px",
                    fontWeight: 600,
                  }}
                >
                  Guest details
                </p>
                <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6, color: WHITE }}>
                  {displayName}
                </p>
                <p style={{ fontFamily: LATO, fontSize: "12px", margin: "6px 0 0", lineHeight: 1.6 }}>
                  {displayEmail}
                  {displayPhone ? ` · ${displayPhone}` : ""}
                  {displayCountry ? ` · ${displayCountry}` : ""}
                </p>
              </div>

              {eventGuestNotes && eventGuestNotes !== "None" ? (
                <div style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "14px 16px" }}>
                  <p
                    style={{
                      fontFamily: LATO,
                      fontSize: "10px",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: MUTED,
                      margin: "0 0 8px",
                      fontWeight: 600,
                    }}
                  >
                    Notes
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "12px", margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{eventGuestNotes}</p>
                </div>
              ) : null}
                </div>
              </details>
            </>
          ) : (
            <>
              <p style={{ fontFamily: LATO, fontSize: "15px", color: WHITE, margin: 0 }}>{booking.villa}</p>
              <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
                {displayEmail}
                {displayPhone ? ` | ${displayPhone}` : ""}
                {displayCountry ? ` | ${displayCountry}` : ""}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
                {booking.sleeping_guests} sleeping
                {booking.day_visitors > 0 ? ` | ${booking.day_visitors} visitors` : ""}
              </p>
              <details style={{ border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "8px 12px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: MUTED,
                  }}
                >
                  Guest message
                </summary>
                <p
                  style={{
                    fontFamily: LATO,
                    fontSize: "12px",
                    margin: "10px 0 0",
                    lineHeight: 1.65,
                    opacity: booking.message?.trim() ? 1 : 0.8,
                  }}
                >
                  {booking.message?.trim() || "—"}
                </p>
              </details>
            </>
          )}
        </div>

        {needsAttention && (
          <div
            style={{
              border: "0.5px solid rgba(226,171,90,0.24)",
              backgroundColor: "rgba(226,171,90,0.08)",
              padding: "12px 14px",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.5 }}>
              This booking has add-ons requiring attention.
            </p>
          </div>
        )}

        {booking.status === "pending" && hasTrackedOffer && (
          <div
            style={{
              border: "0.5px solid rgba(126,207,207,0.24)",
              backgroundColor: "rgba(126,207,207,0.08)",
              padding: "12px 14px",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#7ecfcf", margin: 0, lineHeight: 1.5 }}>
              Includes special offer.
            </p>
          </div>
        )}

        {readyToConfirm && (
          <div
            style={{
              border: "0.5px solid rgba(111,207,138,0.24)",
              backgroundColor: "rgba(80,180,100,0.08)",
              padding: "12px 14px",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", margin: 0, lineHeight: 1.5 }}>
              All add-ons are resolved. This booking is ready to confirm.
            </p>
          </div>
        )}

        {offerSavingsTotal !== null && (
          <div
            style={{
              border: "0.5px solid rgba(126,207,207,0.22)",
              backgroundColor: "rgba(126,207,207,0.06)",
              padding: "12px 14px",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#7ecfcf", margin: 0, lineHeight: 1.5 }}>
              Total savings: {formatAddonPrice(offerSavingsTotal)}
            </p>
          </div>
        )}

        {/* Phase 14A + 14M: Conflict / On Hold — hierarchy: reason → alternatives → contact → manual cancel */}
        {conflictHold && (
          <div
            style={{
              border: "0.5px solid rgba(224,112,112,0.32)",
              backgroundColor: "rgba(224,112,112,0.08)",
              padding: "12px 14px",
              borderRadius: "8px",
              display: "grid",
              gap: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#e07070", margin: 0, fontWeight: 600 }}>
              Conflict / On Hold
            </p>
            {/* 1. Conflict reason */}
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.82)", margin: 0, lineHeight: 1.6 }}>
              {conflictPrimaryReason}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
              Resolve this request by offering alternate dates or cancelling it manually.
            </p>
            <div style={{ display: "grid", gap: "6px" }}>
              {confirmedConflicts.map((c) => (
                <p key={c.id} style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  {isEventInquiryBooking(c) ? (
                    <>
                      Confirmed event · venue scheduling · {deps.getBookingDisplayName(c)} · setup window{" "}
                      {fmt(addDaysToDateOnly(c.check_in, -1))} → {fmt(c.check_out)}
                    </>
                  ) : (
                    <>
                      Confirmed stay · {deps.getBookingDisplayName(c)} · stay dates {fmt(c.check_in)} to {fmt(c.check_out)}
                    </>
                  )}
                </p>
              ))}
            </div>
            {/* 2. Suggested alternatives (Prepare offer lives here) */}
            {(() => {
              const suggestions = deps.conflictSuggestionsMap.get(booking.id) ?? [];
              return (
                <div
                  style={{
                    borderTop: "0.5px solid rgba(224,112,112,0.18)",
                    paddingTop: "10px",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#e07070", margin: 0, fontWeight: 600 }}>
                    Suggested Alternatives
                  </p>
                  {suggestions.length === 0 ? (
                    <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                      No safe alternative dates found nearby.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {suggestions.map((s) => {
                        const offerKey = `${booking.id}:${s.label}`;
                        const isActive = deps.activeOfferKey === offerKey;
                        const message = buildAlternativeOfferMessage(
                          deps.getBookingDisplayName(booking),
                          booking.check_in,
                          booking.check_out,
                          s,
                          eventInquiry,
                        );
                        const rawPhone = booking.guest_phone?.replace(/[^0-9]/g, "") ?? "";
                        const waUrl = rawPhone
                          ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`
                          : null;
                        const isCopied = deps.copiedOfferKey === offerKey;
                        return (
                          <div key={s.label} style={{ display: "grid", gap: "6px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr auto", gap: "8px", alignItems: "center" }}>
                              <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, letterSpacing: "0.8px" }}>
                                {s.label}
                              </span>
                              <span style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.82)" }}>
                                {fmt(s.check_in)} → {fmt(s.check_out)}
                                <span style={{ color: MUTED, marginLeft: "8px", fontSize: "10px" }}>{s.reason}</span>
                              </span>
                              <button
                                onClick={() => deps.setActiveOfferKey(isActive ? null : offerKey)}
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "10px",
                                  letterSpacing: "1.2px",
                                  textTransform: "uppercase",
                                  color: isActive ? MUTED : GOLD,
                                  background: "none",
                                  border: `0.5px solid ${isActive ? "rgba(138,128,112,0.3)" : "rgba(197,164,109,0.35)"}`,
                                  borderRadius: "4px",
                                  padding: "5px 10px",
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isActive ? "Close" : "Prepare offer"}
                              </button>
                            </div>
                            {isActive && (
                              <div
                                style={{
                                  backgroundColor: "rgba(0,0,0,0.22)",
                                  border: "0.5px solid rgba(197,164,109,0.18)",
                                  borderRadius: "6px",
                                  padding: "12px 14px",
                                  display: "grid",
                                  gap: "10px",
                                }}
                              >
                                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                                  Prepared Message
                                </p>
                                <pre
                                  style={{
                                    fontFamily: LATO,
                                    fontSize: "11px",
                                    color: "rgba(255,255,255,0.82)",
                                    margin: 0,
                                    lineHeight: 1.75,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {message}
                                </pre>
                                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                  {waUrl && (
                                    <a
                                      href={waUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        fontFamily: LATO,
                                        fontSize: "10px",
                                        letterSpacing: "1.2px",
                                        textTransform: "uppercase",
                                        color: "#7ecfcf",
                                        textDecoration: "none",
                                        border: "0.5px solid rgba(126,207,207,0.35)",
                                        borderRadius: "4px",
                                        padding: "5px 10px",
                                      }}
                                    >
                                      Open in WhatsApp →
                                    </a>
                                  )}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(message).catch(() => {});
                                      deps.setCopiedOfferKey(offerKey);
                                      setTimeout(() => deps.setCopiedOfferKey((prev) => prev === offerKey ? null : prev), 2000);
                                    }}
                                    style={{
                                      fontFamily: LATO,
                                      fontSize: "10px",
                                      letterSpacing: "1.2px",
                                      textTransform: "uppercase",
                                      color: isCopied ? "#6fcf8a" : "rgba(255,255,255,0.6)",
                                      background: "none",
                                      border: `0.5px solid ${isCopied ? "rgba(111,207,138,0.3)" : "rgba(255,255,255,0.15)"}`,
                                      borderRadius: "4px",
                                      padding: "5px 10px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {isCopied ? "Copied!" : "Copy message"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
                        Use these dates to offer the guest an alternative manually.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. Contact guest */}
            <div
              style={{
                borderTop: "0.5px solid rgba(224,112,112,0.18)",
                paddingTop: "10px",
                display: "grid",
                gap: "6px",
              }}
            >
              <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#e07070", margin: 0, fontWeight: 600 }}>
                Contact guest
              </p>
              {booking.guest_phone ? (
                <a
                  href={`https://wa.me/${booking.guest_phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "#7ecfcf",
                    textDecoration: "none",
                    borderBottom: "0.5px solid rgba(126,207,207,0.3)",
                    paddingBottom: "2px",
                    justifySelf: "start",
                  }}
                >
                  Open WhatsApp (no prefilled message) →
                </a>
              ) : (
                <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  No phone on file — use email or your usual channel.
                </p>
              )}
            </div>

            {/* 4. Manual cancel */}
            {canCancel && booking.status === "pending" && (
              <div
                style={{
                  borderTop: "0.5px solid rgba(224,112,112,0.18)",
                  paddingTop: "10px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#e07070", margin: 0, fontWeight: 600 }}>
                  Manual cancellation
                </p>
                <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  {cancelAdvisoryForConflictHold}
                </p>
                <button
                  type="button"
                  onClick={() => deps.updateStatus(booking.id, "cancelled")}
                  disabled={isUpdating}
                  style={{
                    fontFamily: LATO,
                    fontSize: "11px",
                    letterSpacing: "1.6px",
                    textTransform: "uppercase",
                    color: WHITE,
                    backgroundColor: "transparent",
                    border: "0.5px solid rgba(224,112,112,0.45)",
                    padding: "12px 18px",
                    cursor: isUpdating ? "not-allowed" : "pointer",
                    justifySelf: "start",
                    opacity: isUpdating ? 0.6 : 1,
                    borderRadius: "6px",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {hasPendingOverlap && (
          <div
            style={{
              border: "0.5px solid rgba(240,189,103,0.26)",
              backgroundColor: "rgba(240,189,103,0.08)",
              padding: "12px 14px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f0bd67", margin: 0, lineHeight: 1.5 }}>
              This request overlaps with {overlappingPendingBookings.length === 1 ? "another pending request" : "other pending requests"} for {booking.villa}.
              {" "}Review the conflicting {overlappingPendingBookings.length === 1 ? "request" : "requests"} in this pending list.
            </p>
            <div style={{ display: "grid", gap: "8px" }}>
              {overlappingPendingBookings.map((conflict) => {
                const conflictNeedsApproval = deps.bookingHasPendingAddonApproval(conflict);
                const conflictNeedsAttention = deps.bookingHasOperationalAttention(conflict);
                const attentionLabel = conflictNeedsApproval
                  ? "Add-on approval needed"
                  : conflictNeedsAttention
                    ? "Add-ons need attention"
                    : null;
                const conflictIsEvent = isEventInquiryBooking(conflict);
                const conflictKind = conflictIsEvent ? "Event inquiry" : "Stay booking";
                const conflictCompare = getOverlapComparisonTotal(conflict);
                const conflictCompareLabel = conflictIsEvent ? "Est. event setup" : "Stay subtotal";
                const conflictCompareDisplay = formatMoney(conflictCompare) ?? "—";

                return (
                  <div
                    key={conflict.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: deps.isMobile ? "1fr" : "minmax(0, 1fr) auto",
                      gap: "8px 12px",
                      alignItems: "center",
                      border: "0.5px solid rgba(240,189,103,0.18)",
                      backgroundColor: "rgba(255,255,255,0.025)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: 0, lineHeight: 1.5, fontWeight: 700 }}>
                        {deps.getBookingDisplayName(conflict)}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                        {conflictKind}
                        {conflictIsEvent && conflict.event_type ? ` · ${conflict.event_type}` : ""} · {conflictCompareLabel}{" "}
                        {conflictCompareDisplay}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                        {conflict.villa} · {fmt(conflict.check_in)} to {fmt(conflict.check_out)}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: deps.isMobile ? "flex-start" : "flex-end", gap: "6px", flexDirection: "column" }}>
                      <StatusBadge status={conflict.status} />
                      {attentionLabel && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: LATO,
                            fontSize: "9px",
                            letterSpacing: "1.3px",
                            textTransform: "uppercase",
                            color: "#f0bd67",
                            backgroundColor: "rgba(240,189,103,0.12)",
                            border: "0.5px solid rgba(240,189,103,0.28)",
                            padding: "5px 8px",
                            borderRadius: "6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {attentionLabel}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(hasDeadDayUpsell || eventInquiry) && (
          <div style={{ display: "grid", gap: "8px" }}>
            <button
              type="button"
              onClick={() =>
                deps.setBookingCardPanels((prev) => {
                  const cur = prev[booking.id]?.operationsContext;
                  const def = false;
                  const isOpen = cur !== undefined ? cur : def;
                  return { ...prev, [booking.id]: { ...prev[booking.id], operationsContext: !isOpen } };
                })
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                cursor: "pointer",
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "8px",
                padding: "10px 12px",
              }}
            >
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.4px", textTransform: "uppercase", color: GOLD }}>
                Calendar & operations context
              </span>
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: MUTED }}>
                {(deps.bookingCardPanels[booking.id]?.operationsContext ?? false) ? "Hide details" : "View details"}
              </span>
            </button>
            {(deps.bookingCardPanels[booking.id]?.operationsContext ?? false) && (
              <>
                {hasDeadDayUpsell && (
                  <div
                    style={{
                      border: "0.5px solid rgba(126,207,207,0.26)",
                      backgroundColor: "rgba(126,207,207,0.08)",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#7ecfcf", margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                      Adjacent-day opportunity
                    </p>
                    {deadDayUpsells.map((opportunity) => {
                      const message =
                        opportunity.kind === "late_checkout"
                          ? `Late checkout: ${opportunity.dateLabel}`
                          : `Early check-in: ${opportunity.dateLabel}`;

                      return (
                        <div key={`${opportunity.kind}-${opportunity.dateISO}-${opportunity.pairedBooking.id}`}>
                          <p style={{ fontFamily: LATO, fontSize: "11px", color: "#7ecfcf", margin: "0 0 4px", lineHeight: 1.5 }}>
                            {message}
                          </p>
                          <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                            Adjacent: {fmt(opportunity.pairedBooking.check_in)} → {fmt(opportunity.pairedBooking.check_out)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isEventInquiryBooking(booking) && (
                  <div
                    style={{
                      border: "0.5px solid rgba(157,183,217,0.28)",
                      backgroundColor: "rgba(157,183,217,0.06)",
                      padding: "10px 14px",
                      borderRadius: "8px",
                    }}
                  >
                    <p style={{ fontFamily: LATO, fontSize: "11px", color: "#9db7d9", margin: 0, lineHeight: 1.5 }}>
                      Event inquiries: calendar dates block the venue; inquiry estimate is non-binding until a proposal is sent.
                    </p>
                  </div>
                )}

                {isEventInquiryBooking(booking) && booking.status === "confirmed" && (
                  <div
                    style={{
                      border: "0.5px solid rgba(197,164,109,0.25)",
                      backgroundColor: "rgba(197,164,109,0.05)",
                      padding: "10px 14px",
                      borderRadius: "8px",
                    }}
                  >
                    <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 5px", fontWeight: 600 }}>
                      Operational block
                    </p>
                    <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                      {fmt(addDaysToDateOnly(booking.check_in, -1))} to {fmt(booking.check_out)} — includes setup day (night before event).
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {eventInquiry && (
          <div style={{ display: "grid", gap: "8px" }}>
            <button
              type="button"
              onClick={() =>
                deps.setBookingCardPanels((prev) => {
                  const cur = prev[booking.id]?.proposal;
                  const def = computeDefaultProposalPanelOpen(booking);
                  const isOpen = cur !== undefined ? cur : def;
                  return { ...prev, [booking.id]: { ...prev[booking.id], proposal: !isOpen } };
                })
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                cursor: "pointer",
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "8px",
                padding: "10px 12px",
              }}
            >
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.4px", textTransform: "uppercase", color: "#9db7d9" }}>
                Event proposal
              </span>
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: MUTED }}>
                {(deps.bookingCardPanels[booking.id]?.proposal !== undefined
                  ? deps.bookingCardPanels[booking.id]!.proposal
                  : computeDefaultProposalPanelOpen(booking))
                  ? "Hide details"
                  : "View details"}
              </span>
            </button>
            {(deps.bookingCardPanels[booking.id]?.proposal !== undefined
              ? deps.bookingCardPanels[booking.id]!.proposal
              : computeDefaultProposalPanelOpen(booking)) && deps.renderEventProposalSection(booking)}
          </div>
        )}

        {/* Phase 13H.2: Decision Signal panel — pending deps.bookings only. Reuses existing revenue/overlap data. */}
        {booking.status === "pending" && (() => {
          const pricingIntelligence = getPricingIntelligenceMeta(booking);
          const addonSubtotalRaw = deps.getAddonSnapshots(booking).reduce((sum, addon) => {
            return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
          }, 0);
          const stayValueRaw =
            getSnapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
            getSnapshotNumber(booking.pricing_snapshot?.subtotal) ??
            pricingIntelligence?.stay_value ??
            getPersistedStayValue(booking);
          const addonsValueRaw =
            pricingIntelligence?.addons_value ??
            (deps.getAddonSnapshots(booking).length > 0 ? addonSubtotalRaw : 0);
          const eventSetupEst = eventInquiry ? parseEventSetupEstimateFromMessage(booking.message) : null;
          const eventSetupEstTotal =
            typeof eventSetupEst?.total === "number" && Number.isFinite(eventSetupEst.total) ? eventSetupEst.total : null;
          const estimatedTotalRaw =
            eventInquiry && eventSetupEstTotal !== null
              ? eventSetupEstTotal
              : getSnapshotNumber(booking.pricing_snapshot?.estimated_total) ??
                pricingIntelligence?.estimated_total ??
                pricingIntelligence?.internal_value ??
                (typeof stayValueRaw === "number" && typeof addonsValueRaw === "number"
                  ? stayValueRaw + addonsValueRaw
                  : null);

          const totalDisplay = formatMoney(estimatedTotalRaw) ?? "Not calculated";
          const addonsDisplay = formatMoney(addonsValueRaw) ?? "—";

          const bedroomsRaw = booking.pricing_snapshot?.bedrooms_to_be_used;
          const bedroomLabel =
            typeof bedroomsRaw === "number" && bedroomsRaw >= 1 && bedroomsRaw <= 3
              ? `${bedroomsRaw}BR`
              : "—";

          const overnightGuests =
            typeof booking.sleeping_guests === "number" ? booking.sleeping_guests : null;
          const dayVisitors =
            typeof booking.day_visitors === "number" ? booking.day_visitors : null;
          const guestLoadLabel = overnightGuests !== null
            ? (dayVisitors && dayVisitors > 0
                ? `${overnightGuests} overnight + ${dayVisitors} day`
                : `${overnightGuests} ${overnightGuests === 1 ? "guest" : "guests"}`)
            : "—";

          const conflictMessage = hasPendingOverlap
            ? "Competing request detected — compare revenue before confirming."
            : "No competing pending request.";
          const conflictColor = hasPendingOverlap ? "#f0bd67" : MUTED;
          const conflictBorder = hasPendingOverlap ? "rgba(240,189,103,0.32)" : "rgba(197,164,109,0.18)";
          const conflictBg = hasPendingOverlap ? "rgba(240,189,103,0.08)" : "rgba(255,255,255,0.025)";

          return (
            <div
              style={{
                border: "0.5px solid rgba(197,164,109,0.3)",
                backgroundColor: "rgba(197,164,109,0.05)",
                padding: "14px 16px",
                borderRadius: "8px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ display: "grid", gap: "4px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  Decision Signal
                </p>
                <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  Compact view for approval decisions on pending requests.
                </p>
              </div>

              {/* Estimated total — prominent */}
              <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                  {eventInquiry ? "Event setup estimate" : "Estimated total"}
                </span>
                <span style={{ fontFamily: PLAYFAIR, fontSize: "22px", color: GOLD, lineHeight: 1.1 }}>
                  {totalDisplay}
                </span>
              </div>

              {/* Secondary metrics */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: deps.isMobile ? "1fr 1fr" : "repeat(3, minmax(0, 1fr))",
                  gap: "10px 16px",
                }}
              >
                <div style={{ display: "grid", gap: "2px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                    Add-ons
                  </span>
                  <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE }}>
                    {addonsDisplay}
                  </span>
                </div>
                <div style={{ display: "grid", gap: "2px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                    Bedroom setup
                  </span>
                  <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE }}>
                    {bedroomLabel}
                  </span>
                </div>
                <div style={{ display: "grid", gap: "2px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                    Guest load
                  </span>
                  <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE }}>
                    {guestLoadLabel}
                  </span>
                </div>
              </div>

              {/* Conflict status */}
              <div
                style={{
                  border: `0.5px solid ${conflictBorder}`,
                  backgroundColor: conflictBg,
                  padding: "8px 12px",
                  borderRadius: "6px",
                }}
              >
                <p style={{ fontFamily: LATO, fontSize: "11px", color: conflictColor, margin: 0, lineHeight: 1.5 }}>
                  {conflictMessage}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Phase 13H.3: Booking Comparison Layer — overlapping pending requests. Reuses existing overlap + revenue data. */}
        {booking.status === "pending" && hasPendingOverlap && (() => {
          function summarizeOverlap(b: Booking) {
            if (isEventInquiryBooking(b)) {
              const est = parseEventSetupEstimateFromMessage(b.message);
              const totalRaw = typeof est?.total === "number" && Number.isFinite(est.total) ? est.total : null;
              const eventLabel = b.event_type?.trim() || "Event";
              return {
                totalRaw,
                totalDisplay: formatMoney(totalRaw) ?? "—",
                kindLine: `Event inquiry · ${eventLabel} · Est. event setup`,
              };
            }
            const intel = getPricingIntelligenceMeta(b);
            const addonSubRaw = deps.getAddonSnapshots(b).reduce((sum, addon) => {
              return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
            }, 0);
            const stayRaw = getStaySubtotalForOverlapComparison(b);
            const addonsRaw =
              intel?.addons_value ??
              (deps.getAddonSnapshots(b).length > 0 ? addonSubRaw : 0);
            const addonsDisplay = formatMoney(typeof addonsRaw === "number" ? addonsRaw : null) ?? "—";
            const hasAddons = typeof addonsRaw === "number" && addonsRaw > 0;
            const bedroomsRaw = b.pricing_snapshot?.bedrooms_to_be_used;
            const bedroomLabel =
              typeof bedroomsRaw === "number" && bedroomsRaw >= 1 && bedroomsRaw <= 3
                ? `${bedroomsRaw}BR`
                : "—";
            const overnight = typeof b.sleeping_guests === "number" ? b.sleeping_guests : null;
            const dayVis = typeof b.day_visitors === "number" ? b.day_visitors : null;
            const guestLabel = overnight !== null
              ? (dayVis && dayVis > 0
                  ? `${overnight} overnight + ${dayVis} day`
                  : `${overnight} ${overnight === 1 ? "guest" : "guests"}`)
              : "—";
            const totalRaw = typeof stayRaw === "number" ? stayRaw : null;
            return {
              totalRaw,
              totalDisplay: formatMoney(totalRaw) ?? "—",
              kindLine: `Stay booking · Stay subtotal — ${bedroomLabel} — ${guestLabel} — ${hasAddons ? `${addonsDisplay} add-ons` : "no add-ons"}`,
            };
          }

          const currentSummary = summarizeOverlap(booking);
          const conflictSummaries = overlappingPendingBookings.map((conflict) => ({
            booking: conflict,
            summary: summarizeOverlap(conflict),
          }));

          // Recommendation hint — advisory, based on numeric totals only (skip nulls).
          const numericTotals: number[] = [];
          if (typeof currentSummary.totalRaw === "number") numericTotals.push(currentSummary.totalRaw);
          for (const c of conflictSummaries) {
            if (typeof c.summary.totalRaw === "number") numericTotals.push(c.summary.totalRaw);
          }
          let recommendation: string | null = null;
          let recommendationTone: "warning" | "neutral" | "positive" = "neutral";
          if (numericTotals.length >= 2 && typeof currentSummary.totalRaw === "number") {
            const maxTotal = Math.max(...numericTotals);
            const allEqual = numericTotals.every((t) => t === currentSummary.totalRaw);
            if (allEqual) {
              recommendation = "Comparable value requests.";
              recommendationTone = "neutral";
            } else if (currentSummary.totalRaw < maxTotal) {
              recommendation = "Higher-value request detected — review before confirming.";
              recommendationTone = "warning";
            } else {
              recommendation = "Highest-value request among overlaps.";
              recommendationTone = "positive";
            }
          }

          const recColor =
            recommendationTone === "warning" ? "#f0bd67"
            : recommendationTone === "positive" ? "#7ecfcf"
            : MUTED;
          const recBorder =
            recommendationTone === "warning" ? "rgba(240,189,103,0.32)"
            : recommendationTone === "positive" ? "rgba(126,207,207,0.32)"
            : "rgba(197,164,109,0.18)";
          const recBg =
            recommendationTone === "warning" ? "rgba(240,189,103,0.08)"
            : recommendationTone === "positive" ? "rgba(126,207,207,0.08)"
            : "rgba(255,255,255,0.025)";

          function renderRow(
            label: "Current request" | "Competing request",
            s: ReturnType<typeof summarizeOverlap>,
            isCurrent: boolean,
          ) {
            return (
              <div
                style={{
                  display: "grid",
                  gap: "4px",
                  padding: "10px 12px",
                  border: `0.5px solid ${isCurrent ? "rgba(197,164,109,0.32)" : "rgba(255,255,255,0.08)"}`,
                  backgroundColor: isCurrent ? "rgba(197,164,109,0.06)" : "rgba(255,255,255,0.02)",
                  borderRadius: "6px",
                }}
              >
                <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED }}>
                  {label}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontFamily: PLAYFAIR, fontSize: "16px", color: GOLD, fontWeight: 600 }}>
                    {s.totalDisplay}
                  </span>
                  <span style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>
                    {s.kindLine}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              style={{
                border: "0.5px solid rgba(240,189,103,0.28)",
                backgroundColor: "rgba(240,189,103,0.05)",
                padding: "14px 16px",
                borderRadius: "8px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "grid", gap: "4px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#f0bd67", margin: 0 }}>
                  Competing Requests
                </p>
                <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  Side-by-side comparison of overlapping pending requests for {booking.villa}.
                </p>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {renderRow("Current request", currentSummary, true)}
                {conflictSummaries.map((c) => (
                  <div key={c.booking.id} style={{ display: "grid", gap: "4px" }}>
                    {renderRow("Competing request", c.summary, false)}
                    <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "0 4px", lineHeight: 1.5 }}>
                      {deps.getBookingDisplayName(c.booking)} · {fmt(c.booking.check_in)} to {fmt(c.booking.check_out)}
                    </p>
                  </div>
                ))}
              </div>

              {recommendation && (
                <div
                  style={{
                    border: `0.5px solid ${recBorder}`,
                    backgroundColor: recBg,
                    padding: "8px 12px",
                    borderRadius: "6px",
                  }}
                >
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: recColor, margin: 0, lineHeight: 1.5 }}>
                    {recommendation}
                  </p>
                </div>
              )}
              {/* Phase 13N: admin decision clarity helper */}
              <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
                Prioritize higher-value confirmed deps.bookings when overlaps exist.
              </p>
            </div>
          );
        })()}

        {deps.renderPaymentSection(booking)}

        {booking.status === "confirmed" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => void deps.copyArrivalGuideLink(booking)}
              disabled={deps.arrivalLinkFetchingId === booking.id}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.4px",
                textTransform: "uppercase",
                color: GOLD,
                backgroundColor: "transparent",
                border: "0.5px solid rgba(197,164,109,0.35)",
                padding: "8px 14px",
                borderRadius: "6px",
                cursor: deps.arrivalLinkFetchingId === booking.id ? "not-allowed" : "pointer",
                opacity: deps.arrivalLinkFetchingId === booking.id ? 0.5 : 1,
              }}
            >
              {deps.arrivalLinkFetchingId === booking.id
                ? "Generating..."
                : deps.arrivalLinkCopiedBookingId === booking.id
                  ? "Arrival Guide link copied"
                  : "Copy Arrival Guide link"}
            </button>
            <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, lineHeight: 1.5 }}>
              Personal guest link — paste it to the guest on WhatsApp. Valid until checkout day.
            </span>
          </div>
        )}

        {booking.status === "confirmed" && (
          <div style={{ display: "grid", gap: "8px" }}>
            <button
              type="button"
              onClick={() =>
                deps.setBookingCardPanels((prev) => {
                  const cur = prev[booking.id]?.feedback;
                  const def = false;
                  const isOpen = cur !== undefined ? cur : def;
                  return { ...prev, [booking.id]: { ...prev[booking.id], feedback: !isOpen } };
                })
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                cursor: "pointer",
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "8px",
                padding: "10px 12px",
              }}
            >
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.4px", textTransform: "uppercase", color: GOLD }}>
                Feedback
              </span>
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: MUTED }}>
                {(deps.bookingCardPanels[booking.id]?.feedback ?? false) ? "Hide details" : "View details"}
              </span>
            </button>
            {(deps.bookingCardPanels[booking.id]?.feedback ?? false) ? deps.renderGuestFeedbackSection(booking, feedbackEmphasis) : null}
          </div>
        )}

        {deps.getAddonSnapshots(booking).length > 0 && (
          <div style={{ display: "grid", gap: "8px" }}>
            <button
              type="button"
              onClick={() =>
                deps.setBookingCardPanels((prev) => {
                  const cur = prev[booking.id]?.addons;
                  const def = false;
                  const isOpen = cur !== undefined ? cur : def;
                  return { ...prev, [booking.id]: { ...prev[booking.id], addons: !isOpen } };
                })
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                cursor: "pointer",
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "8px",
                padding: "10px 12px",
              }}
            >
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.4px", textTransform: "uppercase", color: GOLD }}>
                Add-ons
              </span>
              <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: MUTED }}>
                {(deps.bookingCardPanels[booking.id]?.addons ?? false) ? "Hide details" : "View details"}
              </span>
            </button>
            {(deps.bookingCardPanels[booking.id]?.addons ?? false) ? deps.renderAddonRows(booking) : null}
          </div>
        )}

        {/* Phase 13H.4: Approval advisory — warns if a higher-value competing request exists */}
        {booking.status === "pending" && hasPendingOverlap && (() => {
          const currentTotal = getOverlapComparisonTotal(booking);
          if (typeof currentTotal !== "number") return null;
          const conflictTotals = overlappingPendingBookings
            .map(getOverlapComparisonTotal)
            .filter((n): n is number => typeof n === "number");
          if (conflictTotals.length === 0) return null;
          const maxConflict = Math.max(...conflictTotals);

          if (currentTotal < maxConflict) {
            return (
              <div
                style={{
                  border: "0.5px solid rgba(240,189,103,0.32)",
                  backgroundColor: "rgba(240,189,103,0.08)",
                  padding: "10px 14px",
                  borderRadius: "8px",
                }}
              >
                <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f0bd67", margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                  Higher-value competing request exists. Review before confirming.
                </p>
              </div>
            );
          }
          return (
            <div
              style={{
                border: "0.5px solid rgba(126,207,207,0.28)",
                backgroundColor: "rgba(126,207,207,0.06)",
                padding: "10px 14px",
                borderRadius: "8px",
              }}
            >
              <p style={{ fontFamily: LATO, fontSize: "11px", color: "#7ecfcf", margin: 0, lineHeight: 1.5 }}>
                This is the highest-value request among current overlaps.
              </p>
            </div>
          );
        })()}

        {/* Phase 13H.4: subtle confirmation context — pending deps.bookings only */}
        {booking.status === "pending" && (canConfirm || needsApproval || canCancel) && (
          <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.45, fontStyle: "italic" }}>
            Confirm moves this request to Confirmed — review overlaps and decision signal first.
          </p>
        )}

        {eventInquiry && booking.status === "pending" && !proposalAccepted && (
          <p style={{ fontFamily: LATO, fontSize: "10px", color: "#9db7d9", margin: 0, lineHeight: 1.5 }}>
            {booking.proposal_status === "sent"
              ? "Proposal sent — awaiting guest acceptance before you can confirm."
              : booking.proposal_status === "declined"
                ? "Guest declined the proposal — send a revised proposal or close the request."
                : "Prepare and send a proposal so the guest can review and accept."}
          </p>
        )}

        {eventInquiry && booking.status === "pending" && proposalAccepted && (
          <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
            Confirm the event first, then request payment manually using the payment section.
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: deps.isMobile ? "stretch" : "flex-end",
          }}
        >
          {/* Phase 13H.4 + 14M: Cancel on the left except conflict/on-hold pending (Cancel lives inside conflict panel). */}
          {canCancel && !(booking.status === "pending" && conflictHold) && (
            <button
              type="button"
              onClick={() => deps.updateStatus(booking.id, "cancelled")}
              disabled={isUpdating}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "1.6px",
                textTransform: "uppercase",
                color: WHITE,
                backgroundColor: "transparent",
                border: `0.5px solid ${accent.border}`,
                padding: "12px 18px",
                cursor: isUpdating ? "not-allowed" : "pointer",
                minWidth: deps.isMobile ? "100%" : "140px",
                opacity: isUpdating ? 0.6 : 1,
                borderRadius: "6px",
                marginRight: !deps.isMobile && (needsApproval || canConfirm) ? "auto" : 0,
              }}
            >
              Cancel
            </button>
          )}

          {(needsApproval || canConfirm || (eventInquiry && booking.status === "pending" && proposalAccepted)) && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "center",
                width: deps.isMobile ? "100%" : "auto",
              }}
            >
              {booking.status === "pending" && needsApproval && (
                <button
                  type="button"
                  onClick={() => deps.approveAllAddonsAndConfirm(booking)}
                  disabled={isBulkResolving || isUpdating}
                  style={{
                    fontFamily: LATO,
                    fontSize: "11px",
                    letterSpacing: "1.6px",
                    textTransform: "uppercase",
                    color: MIDNIGHT,
                    background: isBulkResolving
                      ? "linear-gradient(135deg, rgba(197,164,109,0.45) 0%, rgba(245,225,182,0.45) 100%)"
                      : "linear-gradient(135deg, #c5a46d 0%, #f0d39c 100%)",
                    border: "none",
                    padding: "12px 18px",
                    cursor: isBulkResolving || isUpdating ? "not-allowed" : "pointer",
                    minWidth: deps.isMobile ? "100%" : "260px",
                    borderRadius: "6px",
                    opacity: isBulkResolving || isUpdating ? 0.7 : 1,
                  }}
                >
                  {isBulkResolving ? "Resolving add-ons..." : "Approve all add-ons & confirm booking"}
                </button>
              )}

              {canConfirm && (
                <button
                  type="button"
                  onClick={() => deps.updateStatus(booking.id, "confirmed")}
                  disabled={isUpdating}
                  style={{
                    fontFamily: LATO,
                    fontSize: "11px",
                    letterSpacing: "1.6px",
                    textTransform: "uppercase",
                    color: WHITE,
                    background: isUpdating
                      ? "linear-gradient(135deg, rgba(229,115,115,0.55) 0%, rgba(255,145,145,0.55) 100%)"
                      : "linear-gradient(135deg, #e57a7a 0%, #ff9191 100%)",
                    border: "none",
                    padding: "12px 18px",
                    cursor: isUpdating ? "not-allowed" : "pointer",
                    minWidth: deps.isMobile ? "100%" : "188px",
                    borderRadius: "6px",
                  }}
                >
                  {eventInquiry
                    ? proposalAccepted
                      ? "Confirm event (after deposit)"
                      : "Confirm event"
                    : (readyToConfirm ? "Confirm booking" : "Confirm booking")}
                </button>
              )}

              {eventInquiry && booking.status === "pending" && proposalAccepted && (
                <button
                  type="button"
                  disabled
                  style={{
                    fontFamily: LATO,
                    fontSize: "11px",
                    letterSpacing: "1.6px",
                    textTransform: "uppercase",
                    color: MUTED,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: `0.5px solid ${BORDER}`,
                    padding: "12px 18px",
                    cursor: "not-allowed",
                    minWidth: deps.isMobile ? "100%" : "188px",
                    borderRadius: "6px",
                    opacity: 0.6,
                  }}
                >
                  Request payment
                </button>
              )}
            </div>
          )}

          {deps.emailWarnings[booking.id] && (
            <span
              style={{
                display: "block",
                width: "100%",
                fontFamily: LATO,
                fontSize: "10px",
                color: "#e0b070",
                lineHeight: 1.4,
              }}
            >
              {deps.emailWarnings[booking.id]}
            </span>
          )}
        </div>
      </div>
    );
}
