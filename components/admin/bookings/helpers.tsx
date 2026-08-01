/**
 * Remediation 5.1 — pure helpers extracted verbatim from BookingsTable.tsx
 * (module-level types, constants, and functions that take booking data and
 * return values/JSX). No behavior change; BookingsTable and
 * DashboardOperationsView import from here instead of keeping local copies.
 */

import type { Booking, BookingAddonSnapshot, BookingProposalIncludedService, Member } from "../types";
import { AddonIcon } from "@/components/addon-icon";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { BORDER, fieldStyle, fmt, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "../theme";
import { addDaysToDateOnly, getOperationalRange, rangesOverlap } from "@/lib/calendar/event-block";
import { findAlternativeDateSuggestions, type AlternativeSuggestion } from "@/lib/calendar/alternative-dates";
import { adminApiFetchInit } from "@/lib/admin-auth";
import {
  buildEventFeedbackRequestMessage,
  buildMailtoFeedbackUrl,
  buildStayFeedbackRequestMessage,
  buildWhatsAppFeedbackUrl,
} from "@/lib/feedback-request-message";
import { isFeedbackEmailCooldownActive } from "@/lib/booking-feedback-eligibility";
import {
  extractEventInquiryGuestNotesLine,
  EVENT_SETUP_ESTIMATE_PREFIX,
  isEventInquiryPayload,
  parseEventSetupEstimateFromMessage,
  stripEventSetupEstimateFromMessage,
} from "@/lib/event-inquiry-message";
import { computeDefaultProposalValidUntilInputValue, computeProposalDepositFromTotal } from "@/lib/event-proposal-defaults";
import { roundMoney, sumMoney } from "@/lib/money";
import {
  computeFoundationAmountDue,
  derivePaymentFoundationStage,
  getFoundationAmountTotal,
  getFoundationDepositDisplay,
} from "@/lib/payment-foundation";
import { formatPaymentMethodLabel as formatPaymentMethodLabelShared } from "@/lib/payment-method-labels";

export type BookingSectionKey = "pending" | "confirmed" | "cancelled";
export type ConfirmedSortKey = "created_desc" | "created_asc" | "check_in_asc" | "check_in_desc";
export type DeadDayUpsellOpportunity = {
  kind: "late_checkout" | "early_checkin";
  dateISO: string;
  dateLabel: string;
  pairedBooking: Booking;
};
export type PaymentDraft = {
  depositAmount: string;
  dueAt: string;
  requestNote: string;
  paymentAmount: string;
  paymentMethod: string;
  paymentReference: string;
  paymentNotes: string;
  refundAmount: string;
  refundNote: string;
  /** Plan 4 Phase 1: NetCommerce Business Center refund/transaction reference (required). */
  refundReference: string;
};
export type EventProposalServiceOption = {
  key: string;
  id?: string | null;
  label: string;
  quantity: number | null;
  unit_label: string | null;
};
/**
 * Phase 15H — admin line-item quote row. Working state (strings) for inputs;
 * normalized to BookingProposalIncludedService at save/send time.
 */
export type ProposalLineItemDraft = {
  /** Stable client key (independent of label edits). */
  key: string;
  /** Catalog id when sourced from a guest-requested service; null for custom rows. */
  id?: string | null;
  label: string;
  quantity: string;
  unitLabel: string;
  unitPrice: string;
  /** Admin-only note shown under the line in admin view (currently not surfaced in guest table). */
  notes: string;
  /** "requested" = pulled from guest inquiry; "custom" = added by admin. */
  source: "requested" | "custom";
  /** false = excluded from billable total + guest line table. */
  included: boolean;
};
export type ProposalDraft = {
  /** Phase 15H — admin line items drive the proposal total. */
  lineItems: ProposalLineItemDraft[];
  depositAmount: string;
  validUntil: string;
  excludedServices: string;
  optionalServices: string;
  proposalNotes: string;
  paymentMethods: string[];
  /** When true, do not replace payment deadline with the check-in −7 default (admin chose a date). */
  deadlineManuallyEdited?: boolean;
};

export const EVENT_PROPOSAL_PAYMENT_METHODS = [
  { value: "whish", label: "Wish Money / Western Union / BOB Finance / OMT" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card_manual", label: "Debit / Credit Card" },
  { value: "other", label: "Other" },
] as const;

export function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, { text: string; background: string; border: string }> = {
    pending: {
      text: GOLD,
      background: "rgba(197,164,109,0.14)",
      border: "rgba(197,164,109,0.35)",
    },
    confirmed: {
      text: "#6fcf8a",
      background: "rgba(80,180,100,0.15)",
      border: "rgba(111,207,138,0.34)",
    },
    cancelled: {
      text: "#f08b8b",
      background: "rgba(224,112,112,0.14)",
      border: "rgba(224,112,112,0.32)",
    },
  };
  const tone = tones[status] ?? {
    text: MUTED,
    background: "rgba(255,255,255,0.04)",
    border: BORDER,
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: LATO,
        fontSize: "10px",
        letterSpacing: "1.6px",
        textTransform: "uppercase",
        color: tone.text,
        backgroundColor: tone.background,
        border: `0.5px solid ${tone.border}`,
        padding: "7px 11px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

/**
 * Audit G1.1 — the guest-facing 8-char booking reference as a scannable badge
 * for collapsed booking rows. Slightly larger than StatusBadge on purpose:
 * it is the anchor an operator matches against a guest-quoted reference.
 */
export function BookingRefBadge({ bookingRef }: { bookingRef: string | null }) {
  if (!bookingRef) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: LATO,
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "1.8px",
        color: GOLD,
        backgroundColor: "rgba(197,164,109,0.10)",
        border: `0.5px solid ${GOLD}`,
        padding: "7px 12px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      {bookingRef}
    </span>
  );
}

export function getSectionTone(section: BookingSectionKey) {
  if (section === "confirmed") {
    return {
      accent: "#6fcf8a",
      glow: "rgba(80,180,100,0.08)",
      title: "Confirmed",
      subtitle: "Confirmed / Upcoming (active) and Completed / Checked-out (history — visual only, no DB status change)",
    };
  }

  if (section === "cancelled") {
    return {
      accent: "#e07070",
      glow: "rgba(224,112,112,0.08)",
      title: "Cancelled",
      subtitle: "Cancelled bookings",
    };
  }

  return {
    accent: GOLD,
    glow: "rgba(197,164,109,0.08)",
    title: "Pending / Action Required",
    subtitle: "Bookings that still need an operational decision",
  };
}

export function getCardAccent(booking: Booking, needsAttention: boolean) {
  if (booking.status === "cancelled") {
    return {
      color: "#e07070",
      border: "rgba(224,112,112,0.68)",
      glow: "rgba(224,112,112,0.08)",
    };
  }

  if (booking.status === "confirmed" && !needsAttention) {
    return {
      color: "#6fcf8a",
      border: "rgba(111,207,138,0.52)",
      glow: "rgba(80,180,100,0.07)",
    };
  }

  if (needsAttention) {
    return {
      color: GOLD,
      border: "rgba(197,164,109,0.82)",
      glow: "rgba(197,164,109,0.08)",
    };
  }

  return {
    color: "#8eb8ff",
    border: "rgba(142,184,255,0.62)",
    glow: "rgba(142,184,255,0.08)",
  };
}

export function getAddonStatusTone(status: BookingAddonSnapshot["status"]) {
  if (status === "confirmed") {
    return {
      color: "#6fcf8a",
      background: "rgba(80,180,100,0.15)",
      border: "rgba(111,207,138,0.32)",
    };
  }

  if (status === "approved") {
    return {
      color: "#6fcf8a",
      background: "rgba(80,180,100,0.18)",
      border: "rgba(111,207,138,0.36)",
    };
  }

  if (status === "declined") {
    return {
      color: "#f08b8b",
      background: "rgba(224,112,112,0.14)",
      border: "rgba(224,112,112,0.34)",
    };
  }

  if (status === "at_risk") {
    return {
      color: "#e2ab5a",
      background: "rgba(226,171,90,0.15)",
      border: "rgba(226,171,90,0.3)",
    };
  }

  return {
    color: "#9db7d9",
    background: "rgba(157,183,217,0.14)",
    border: "rgba(157,183,217,0.28)",
  };
}

export function getOperationalBadgeStyle(kind: "approval" | "soft" | "strict") {
  if (kind === "strict") {
    return { color: "#e78f8f", background: "rgba(224,112,112,0.14)" };
  }
  if (kind === "soft") {
    return { color: "#e2ab5a", background: "rgba(226,171,90,0.15)" };
  }
  return { color: GOLD, background: "rgba(197,164,109,0.14)" };
}

export function formatAddonPrice(price: number | null) {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

export function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString("en-US")}`;
}

export function parseAmountInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatDateTimeValue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Beirut",
  }).format(date);
}

export function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatAdvisoryLabel(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function createEventServiceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Phase 15H — generate a stable client key for a brand-new custom line item. */
export function createCustomLineItemKey() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Phase 15H — parse a number string for line-item math. Empty / invalid → 0.
 * Phase 15H.1 — every parsed value is run through roundMoney so user input drives
 * the same precision as the rest of the totals pipeline.
 */
export function parseLineItemNumber(value: string): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

/** Phase 15H.1 — line total = unit_price × quantity, 2-decimal safe. */
export function computeProposalLineTotal(unitPrice: number, quantity: number): number {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(quantity)) return 0;
  return roundMoney(unitPrice * quantity);
}

interface ProposalLineDraftLike {
  unitPrice: string;
  quantity: string;
  included: boolean;
}

/** Phase 15H.1 — proposal grand total = sumMoney of line totals where `included === true`. */
export function sumProposalLineItemDrafts(lines: ProposalLineDraftLike[]): number {
  return sumMoney(
    lines
      .filter((line) => line.included)
      .map((line) => computeProposalLineTotal(parseLineItemNumber(line.unitPrice), parseLineItemNumber(line.quantity))),
  );
}

export function formatPaymentMethodLabel(value: string) {
  return formatPaymentMethodLabelShared(value);
}

export function formatEventProposalServiceLabel(service: EventProposalServiceOption | BookingProposalIncludedService) {
  if (typeof service.quantity === "number" && Number.isFinite(service.quantity) && service.quantity > 0) {
    return `${service.label} - ${service.quantity}${service.unit_label ? ` ${service.unit_label}` : ""}`;
  }
  return `${service.label} - requested`;
}

export function isProposalExpired(status: string | null | undefined, validUntil: string | null | undefined) {
  if (status !== "sent" || !validUntil) return false;
  const parsed = new Date(validUntil);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

export function getPricingIntelligenceMeta(booking: Booking) {
  return booking.pricing_snapshot?.internal_intelligence ?? null;
}

export function getSnapshotNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getPersistedStayValue(booking: Booking) {
  const adjustedStaySubtotal =
    getSnapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
    getSnapshotNumber(booking.pricing_snapshot?.subtotal);
  if (adjustedStaySubtotal !== null) {
    return adjustedStaySubtotal;
  }

  if (typeof booking.pricing_subtotal === "number" && Number.isFinite(booking.pricing_subtotal)) {
    return booking.pricing_subtotal;
  }

  return null;
}

export function getBookingRevenueData(booking: Booking) {
  const pricingIntelligence = getPricingIntelligenceMeta(booking);
  const addonSubtotalRaw = getAddonSnapshotsFromBooking(booking).reduce((sum, addon) => {
    return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
  }, 0);
  const stayValueRaw =
    getSnapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
    getSnapshotNumber(booking.pricing_snapshot?.subtotal) ??
    pricingIntelligence?.stay_value ??
    getPersistedStayValue(booking);
  const addonsValueRaw =
    pricingIntelligence?.addons_value ??
    (getAddonSnapshotsFromBooking(booking).length > 0 ? addonSubtotalRaw : 0);
  const estimatedTotalRaw =
    getSnapshotNumber(booking.pricing_snapshot?.estimated_total) ??
    pricingIntelligence?.estimated_total ??
    pricingIntelligence?.internal_value ??
    (typeof stayValueRaw === "number" && typeof addonsValueRaw === "number"
      ? stayValueRaw + addonsValueRaw
      : null);

  return {
    pricingIntelligence,
    stayValueRaw,
    addonsValueRaw,
    estimatedTotalRaw,
  };
}

/**
 * Bug 8: payment basis for confirmed bookings.
 * Event inquiries with a proposal total → use proposal total / proposal deposit (event setup is the contract,
 * not the host stay nights). Stay bookings → fall back to stay subtotal + add-ons via getBookingRevenueData.
 */
export function getBookingPaymentBasis(booking: Booking) {
  if (isEventInquiryPayload(booking.event_type, booking.message)) {
    const proposalTotal =
      typeof booking.proposal_total_amount === "number" && Number.isFinite(booking.proposal_total_amount)
        ? booking.proposal_total_amount
        : null;
    const proposalDeposit =
      typeof booking.proposal_deposit_amount === "number" && Number.isFinite(booking.proposal_deposit_amount)
        ? booking.proposal_deposit_amount
        : null;
    if (proposalTotal !== null) {
      return {
        totalRaw: proposalTotal,
        depositRaw: proposalDeposit,
        source: "event_proposal" as const,
      };
    }
  }
  const { estimatedTotalRaw } = getBookingRevenueData(booking);
  return {
    totalRaw: estimatedTotalRaw,
    depositRaw: null as number | null,
    source: "stay_estimate" as const,
  };
}

export function getAddonSnapshotsFromBooking(booking: Booking) {
  return booking.addons_snapshot ?? [];
}

export function getPaymentStatus(booking: Booking) {
  return booking.payment_status?.trim() || "unpaid";
}

export function isPaymentOverdue(booking: Booking) {
  if (getPaymentStatus(booking) !== "payment_requested" || !booking.payment_due_at) return false;
  const dueDate = new Date(booking.payment_due_at);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < Date.now();
}

// Phase 13N: due within next 24h, not yet overdue. Reuses existing overdue helper to avoid duplicate warnings.
export function isPaymentDueSoon(booking: Booking) {
  if (getPaymentStatus(booking) !== "payment_requested" || !booking.payment_due_at) return false;
  const dueDate = new Date(booking.payment_due_at);
  if (Number.isNaN(dueDate.getTime())) return false;
  const ms = dueDate.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

// Phase 13N: comparison-based revenue total. Uses the same fallback chain as 13H.2/13H.3/13H.4 inline copies.
// Returns null when no value is available — callers must skip rendering rather than guess.
export function getBookingTotal(b: Booking): number | null {
  if (isEventInquiryPayload(b.event_type, b.message)) {
    const est = parseEventSetupEstimateFromMessage(b.message);
    if (typeof est?.total === "number" && Number.isFinite(est.total)) return est.total;
  }
  const intel = getPricingIntelligenceMeta(b);
  const addonSubRaw = getAddonSnapshotsFromBooking(b).reduce((sum: number, addon) => {
    return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
  }, 0);
  const stayRaw =
    getSnapshotNumber(b.pricing_snapshot?.adjusted_stay_subtotal) ??
    getSnapshotNumber(b.pricing_snapshot?.subtotal) ??
    intel?.stay_value ??
    getPersistedStayValue(b);
  const addonsRaw =
    intel?.addons_value ??
    (getAddonSnapshotsFromBooking(b).length > 0 ? addonSubRaw : 0);
  return (
    getSnapshotNumber(b.pricing_snapshot?.estimated_total) ??
    intel?.estimated_total ??
    intel?.internal_value ??
    (typeof stayRaw === "number" && typeof addonsRaw === "number" ? stayRaw + addonsRaw : null)
  );
}

/** Stay-only subtotal for overlap cards (compare stay vs event setup without add-ons). */
export function getStaySubtotalForOverlapComparison(b: Booking): number | null {
  const intel = getPricingIntelligenceMeta(b);
  return (
    getSnapshotNumber(b.pricing_snapshot?.adjusted_stay_subtotal) ??
    getSnapshotNumber(b.pricing_snapshot?.subtotal) ??
    intel?.stay_value ??
    getPersistedStayValue(b)
  );
}

/** Single comparable figure: event setup estimate total, or stay subtotal. */
export function getOverlapComparisonTotal(b: Booking): number | null {
  if (isEventInquiryBooking(b)) {
    const est = parseEventSetupEstimateFromMessage(b.message);
    return typeof est?.total === "number" && Number.isFinite(est.total) ? est.total : null;
  }
  return getStaySubtotalForOverlapComparison(b);
}

export function getPaymentStatusStyle(status: string, overdue: boolean) {
  if (overdue) {
    return {
      label: "Payment overdue",
      color: "#f2a7a7",
      background: "rgba(224,112,112,0.16)",
      border: "rgba(224,112,112,0.36)",
    };
  }

  if (status === "paid_in_full") {
    return {
      label: "Paid in full",
      color: "#6fcf8a",
      background: "rgba(80,180,100,0.16)",
      border: "rgba(111,207,138,0.34)",
    };
  }

  if (status === "deposit_paid") {
    return {
      label: "Deposit paid",
      color: "#7ed39b",
      background: "rgba(80,180,100,0.14)",
      border: "rgba(111,207,138,0.3)",
    };
  }

  if (status === "payment_requested") {
    return {
      label: "Payment requested",
      color: GOLD,
      background: "rgba(197,164,109,0.14)",
      border: "rgba(197,164,109,0.3)",
    };
  }

  return {
    label: "Unpaid",
    color: MUTED,
    background: "rgba(255,255,255,0.04)",
    border: BORDER,
  };
}

export function renderPaymentStatusBadge(booking: Booking) {
  const tone = getPaymentStatusStyle(getPaymentStatus(booking), isPaymentOverdue(booking));
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
        color: tone.color,
        backgroundColor: tone.background,
        border: `0.5px solid ${tone.border}`,
        padding: "6px 10px",
        borderRadius: "6px",
        whiteSpace: "nowrap",
      }}
    >
      {tone.label}
    </span>
  );
}

/** Phase 15I.1 — guest-facing workflow still uses `payment_status`; this badge reflects ledger balance (Paid / Partially Paid / Unpaid). */
export function resolveFoundationLedgerBadgeStyle(booking: Booking) {
  const paid =
    typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
      ? roundMoney(Math.max(0, booking.amount_paid))
      : 0;
  const storedTotal =
    typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total) ? roundMoney(booking.amount_total) : null;
  const computedTotal = getFoundationAmountTotal(booking);
  const total = storedTotal !== null ? storedTotal : computedTotal;
  const flow = getPaymentStatus(booking);
  const stage = booking.payment_stage?.trim() ?? "";

  if (stage === "fully_paid" || flow === "paid_in_full" || (total !== null && total > 0 && paid >= total)) {
    return {
      label: "Paid",
      color: "#6fcf8a",
      background: "rgba(80,180,100,0.16)",
      border: "rgba(111,207,138,0.34)",
    };
  }
  if (
    stage === "partially_paid" ||
    flow === "deposit_paid" ||
    (paid > 0 && (total === null || (total > 0 && paid < total)))
  ) {
    return {
      label: "Partially Paid",
      color: "#e8c98a",
      background: "rgba(232,201,138,0.12)",
      border: "rgba(232,201,138,0.28)",
    };
  }
  return {
    label: "Unpaid",
    color: MUTED,
    background: "rgba(255,255,255,0.04)",
    border: BORDER,
  };
}

export function renderFoundationLedgerBadge(booking: Booking) {
  const tone = resolveFoundationLedgerBadgeStyle(booking);
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
        color: tone.color,
        backgroundColor: tone.background,
        border: `0.5px solid ${tone.border}`,
        padding: "6px 10px",
        borderRadius: "6px",
        whiteSpace: "nowrap",
      }}
    >
      {tone.label}
    </span>
  );
}

export function renderRevenueEstimateRow(label: string, value: string) {
  return (
    <div
      style={{
        display: "grid",
        gap: "4px",
        minWidth: 0,
      }}
    >
      <p
        style={{
          fontFamily: LATO,
          fontSize: "9px",
          letterSpacing: "1.4px",
          textTransform: "uppercase",
          color: MUTED,
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: LATO,
          fontSize: "13px",
          color: WHITE,
          margin: 0,
          lineHeight: 1.45,
          fontWeight: 700,
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function getAddonRiskWarning(addon: BookingAddonSnapshot) {
  if (addon.same_day_warning === "same_day_checkout") return "Same-day checkout risk";
  if (addon.same_day_warning === "same_day_checkin") return "Same-day check-in risk";
  return null;
}

export function hasResolvedAddonStatus(addon: BookingAddonSnapshot) {
  return addon.status === "approved" || addon.status === "declined";
}

export function addonHasTrackedOffer(addon: BookingAddonSnapshot) {
  return addon.offer_applied === true;
}

export function isAddonDiscounted(addon: BookingAddonSnapshot) {
  return (
    addonHasTrackedOffer(addon) ||
    addon.pricing_type === "percentage" ||
    (typeof addon.original_price === "number" && typeof addon.price === "number" && addon.original_price > addon.price)
  );
}

export function hasDiscountPriceMetadata(addon: BookingAddonSnapshot) {
  return (
    addonHasTrackedOffer(addon) &&
    typeof addon.original_price === "number" &&
    typeof addon.price === "number" &&
    typeof addon.savings === "number"
  );
}

export function addonNeedsAttention(addon: BookingAddonSnapshot) {
  if (hasResolvedAddonStatus(addon)) return false;
  return (
    addon.status === "pending_approval" ||
    addon.status === "at_risk" ||
    addon.same_day_warning === "same_day_checkout" ||
    addon.same_day_warning === "same_day_checkin"
  );
}

export function sortByNewest(items: Booking[]) {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function sortConfirmedBookings(items: Booking[], sortKey: ConfirmedSortKey) {
  const sorted = [...items];

  if (sortKey === "created_asc") {
    sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return sorted;
  }

  if (sortKey === "check_in_asc") {
    sorted.sort((a, b) => a.check_in.localeCompare(b.check_in) || b.created_at.localeCompare(a.created_at));
    return sorted;
  }

  if (sortKey === "check_in_desc") {
    sorted.sort((a, b) => b.check_in.localeCompare(a.check_in) || b.created_at.localeCompare(a.created_at));
    return sorted;
  }

  sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted;
}

export function bookingDateRangesOverlap(a: Booking, b: Booking) {
  return a.check_in < b.check_out && b.check_in < a.check_out;
}

// Phase 14B: classify a booking as an event inquiry — both event_type set AND structured marker in notes.
export function isEventInquiryBooking(booking: Pick<Booking, "event_type" | "message">) {
  return isEventInquiryPayload(booking.event_type, booking.message);
}

/** Phase 15I.2 — default expanded proposal panel when event proposal work is likely. */
export function computeDefaultProposalPanelOpen(b: Booking): boolean {
  if (!isEventInquiryBooking(b)) return false;
  if (isProposalExpired(b.proposal_status, b.proposal_valid_until)) return false;
  const s = b.proposal_status ?? "draft";
  return s === "draft" || s === "sent";
}

/** Phase 15I.2 — default expanded payment panel when follow-up is likely. */
export function computeDefaultPaymentPanelOpen(b: Booking): boolean {
  if (b.status !== "confirmed") return false;
  if (isPaymentOverdue(b)) return true;
  const ps = getPaymentStatus(b);
  if (ps === "payment_requested") return true;
  if (ps === "unpaid") return true;
  if (ps === "deposit_paid") {
    const paid = typeof b.amount_paid === "number" && Number.isFinite(b.amount_paid) ? b.amount_paid : 0;
    const t = getFoundationAmountTotal(b);
    return typeof t === "number" && paid < t;
  }
  return false;
}

/** Advisory only: matches typical admin cancel email path when an address exists (auth email not available client-side for members). */
export function cancelFlowLikelySendsEmail(booking: Pick<Booking, "member_id" | "guest_email">, memberListEmail: string | null | undefined): boolean {
  if (!booking.member_id) return Boolean(booking.guest_email?.trim());
  return Boolean(memberListEmail?.trim());
}

// Phase 14L: build a copy-ready alternative-offer message for admin use.
export function buildAlternativeOfferMessage(
  guestName: string,
  originalCheckIn: string,
  originalCheckOut: string,
  suggestion: AlternativeSuggestion,
  isEvent: boolean,
): string {
  const conflictLine = isEvent
    ? "Your requested event date is not available due to venue scheduling."
    : "Your requested stay dates are not available due to an existing confirmed booking.";
  return [
    `Hi ${guestName},`,
    "",
    conflictLine,
    "",
    "We would like to suggest the following alternative:",
    `${fmt(suggestion.check_in)} → ${fmt(suggestion.check_out)}`,
    "",
    "Would you like us to continue with these alternative dates?",
    "",
    "Best regards,",
    "Oraya",
  ].join("\n");
}

export function parseRequestedEventServicesFromMessage(message: string | null | undefined): EventProposalServiceOption[] {
  if (typeof message !== "string" || !message.includes("Requested Event Services:")) return [];

  const lines = message.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === "Requested Event Services:");
  if (startIndex < 0) return [];

  const services: EventProposalServiceOption[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith(EVENT_SETUP_ESTIMATE_PREFIX)) break;
    if (!line.startsWith("- ")) {
      if (/^[A-Za-z][A-Za-z\s()/-]*:/.test(line)) break;
      continue;
    }

    const content = line.slice(2).trim();
    const parts = content.split(/\s+[—-]\s+/);
    const label = parts[0]?.trim();
    if (!label) continue;

    let quantity: number | null = null;
    let unitLabel: string | null = null;
    const detail = parts.slice(1).join(" - ").trim();
    if (detail && detail.toLowerCase() !== "requested") {
      const quantityMatch = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(detail);
      if (quantityMatch) {
        quantity = Number(quantityMatch[1]);
        unitLabel = quantityMatch[2].trim();
      }
    }

    services.push({
      key: createEventServiceKey(label),
      label,
      quantity,
      unit_label: unitLabel,
    });
  }

  return services;
}

export function eventInquiryNightCount(checkIn: string, checkOut: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkIn);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkOut);
  if (!a || !b) return 0;
  const s = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const e = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export function parseDateOnlyParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function dateOnlySerial(value: string) {
  const parts = parseDateOnlyParts(value);
  if (!parts) return null;

  let year = parts.year;
  const { month, day } = parts;
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * 146097 + dayOfEra;
}

export function dateOnlyGapDays(startExclusive: string, endInclusiveStart: string) {
  const startSerial = dateOnlySerial(startExclusive);
  const endSerial = dateOnlySerial(endInclusiveStart);
  if (startSerial === null || endSerial === null) return null;
  return endSerial - startSerial;
}

/** Phase 15F.6: today (UTC date) strictly after check_out → checked out for admin display only (no DB change). */
export function todayIsoDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isBookingCheckedOutAfter(booking: Pick<Booking, "check_out">): boolean {
  const co = booking.check_out?.trim();
  if (!co) return false;
  return todayIsoDateOnly() > co;
}

export function formatEventOrStayDateLine(booking: Booking): string {
  if (isEventInquiryBooking(booking)) {
    return `Event dates · ${fmt(booking.check_in)} → ${fmt(booking.check_out)}`;
  }
  return `${fmt(booking.check_in)} → ${fmt(booking.check_out)}`;
}

export function getCompletedHistoryTotalDisplay(booking: Booking): string {
  if (isEventInquiryBooking(booking)) {
    const p = booking.proposal_total_amount;
    if (typeof p === "number" && Number.isFinite(p)) {
      const s = formatMoney(p);
      if (s) return s;
    }
  }
  const { estimatedTotalRaw } = getBookingRevenueData(booking);
  return formatMoney(estimatedTotalRaw) ?? "—";
}

export function getBookingGuestEmailForFeedback(booking: Booking, members: Member[]): string | null {
  const g = booking.guest_email?.trim();
  if (g) return g;
  if (booking.member_id) {
    const m = members.find((x) => x.id === booking.member_id);
    return m?.email?.trim() || null;
  }
  return null;
}

export function getBookingGuestPhoneForFeedback(booking: Booking, members: Member[]): string | null {
  const g = booking.guest_phone?.trim();
  if (g) return g;
  if (booking.member_id) {
    const m = members.find((x) => x.id === booking.member_id);
    return m?.phone?.trim() || null;
  }
  return null;
}

export function getBookingGuestDisplayName(booking: Booking, members: Member[]): string {
  const g = booking.guest_name?.trim();
  if (g) return g;
  if (booking.member_id) {
    const m = members.find((x) => x.id === booking.member_id);
    if (m?.full_name?.trim()) return m.full_name.trim();
  }
  return "Guest";
}

/** Phase 15F.7 — compact completed-row line for feedback email audit. */
export function completedHistoryFeedbackLine(booking: Booking): string {
  const when = formatDateTimeValue(booking.feedback_requested_at);
  if (!when) return "Feedback · Not sent via system yet";
  return `Feedback · Requested on ${when}`;
}

export function renderOperationalBadge(text: string, kind: "approval" | "soft" | "strict") {
  const tone = getOperationalBadgeStyle(kind);
  return (
    <span
      style={{
        fontFamily: LATO,
        fontSize: "9px",
        letterSpacing: "1.2px",
        textTransform: "uppercase",
        color: tone.color,
        backgroundColor: tone.background,
        padding: "4px 8px",
        borderRadius: "4px",
      }}
    >
      {text}
    </span>
  );
}
