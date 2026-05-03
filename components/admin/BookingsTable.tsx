"use client";

import { useMemo, useState } from "react";
import type { Booking, BookingAddonSnapshot, BookingProposalIncludedService, Member } from "./types";
import { AddonIcon } from "@/components/addon-icon";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { BORDER, fieldStyle, fmt, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "./theme";
import { addDaysToDateOnly, getOperationalRange, rangesOverlap } from "@/lib/calendar/event-block";
import { findAlternativeDateSuggestions, type AlternativeSuggestion } from "@/lib/calendar/alternative-dates";

type BookingSectionKey = "pending" | "confirmed" | "cancelled";
type ConfirmedSortKey = "created_desc" | "created_asc" | "check_in_asc" | "check_in_desc";
type DeadDayUpsellOpportunity = {
  kind: "late_checkout" | "early_checkin";
  dateISO: string;
  dateLabel: string;
  pairedBooking: Booking;
};
type PaymentDraft = {
  depositAmount: string;
  dueAt: string;
  requestNote: string;
  paymentAmount: string;
  paymentMethod: string;
  paymentReference: string;
  paymentNotes: string;
  refundAmount: string;
  refundNote: string;
};
type EventProposalServiceOption = {
  key: string;
  id?: string | null;
  label: string;
  quantity: number | null;
  unit_label: string | null;
};
type ProposalDraft = {
  totalAmount: string;
  depositAmount: string;
  validUntil: string;
  includedServiceKeys: string[];
  excludedServices: string;
  optionalServices: string;
  proposalNotes: string;
  paymentMethods: string[];
};

const EVENT_PROPOSAL_PAYMENT_METHODS = [
  { value: "whish", label: "Whish" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card_manual", label: "Card manual" },
  { value: "other", label: "Other" },
] as const;

function StatusBadge({ status }: { status: string }) {
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

function getSectionTone(section: BookingSectionKey) {
  if (section === "confirmed") {
    return {
      accent: "#6fcf8a",
      glow: "rgba(80,180,100,0.08)",
      title: "Confirmed",
      subtitle: "Confirmed and upcoming stays",
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

function getCardAccent(booking: Booking, needsAttention: boolean) {
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

function getAddonStatusTone(status: BookingAddonSnapshot["status"]) {
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

function getOperationalBadgeStyle(kind: "approval" | "soft" | "strict") {
  if (kind === "strict") {
    return { color: "#e78f8f", background: "rgba(224,112,112,0.14)" };
  }
  if (kind === "soft") {
    return { color: "#e2ab5a", background: "rgba(226,171,90,0.15)" };
  }
  return { color: GOLD, background: "rgba(197,164,109,0.14)" };
}

function formatAddonPrice(price: number | null) {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString("en-US")}`;
}

function parseAmountInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatDateTimeValue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Beirut",
  }).format(date);
}

function toDateTimeLocalInput(value: string | null | undefined) {
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

function formatAdvisoryLabel(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function createEventServiceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatPaymentMethodLabel(value: string) {
  if (value === "bank_transfer") return "Bank transfer";
  if (value === "card_manual") return "Card manual";
  return formatAdvisoryLabel(value.replaceAll("_", " "));
}

function formatEventProposalServiceLabel(service: EventProposalServiceOption | BookingProposalIncludedService) {
  if (typeof service.quantity === "number" && Number.isFinite(service.quantity) && service.quantity > 0) {
    return `${service.label} - ${service.quantity}${service.unit_label ? ` ${service.unit_label}` : ""}`;
  }
  return `${service.label} - requested`;
}

function isProposalExpired(status: string | null | undefined, validUntil: string | null | undefined) {
  if (status !== "sent" || !validUntil) return false;
  const parsed = new Date(validUntil);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

function getPricingIntelligenceMeta(booking: Booking) {
  return booking.pricing_snapshot?.internal_intelligence ?? null;
}

function getSnapshotNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPersistedStayValue(booking: Booking) {
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

function getBookingRevenueData(booking: Booking) {
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

function getAddonSnapshotsFromBooking(booking: Booking) {
  return booking.addons_snapshot ?? [];
}

function getPaymentStatus(booking: Booking) {
  return booking.payment_status?.trim() || "unpaid";
}

function isPaymentOverdue(booking: Booking) {
  if (getPaymentStatus(booking) !== "payment_requested" || !booking.payment_due_at) return false;
  const dueDate = new Date(booking.payment_due_at);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < Date.now();
}

// Phase 13N: due within next 24h, not yet overdue. Reuses existing overdue helper to avoid duplicate warnings.
function isPaymentDueSoon(booking: Booking) {
  if (getPaymentStatus(booking) !== "payment_requested" || !booking.payment_due_at) return false;
  const dueDate = new Date(booking.payment_due_at);
  if (Number.isNaN(dueDate.getTime())) return false;
  const ms = dueDate.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

// Phase 13N: comparison-based revenue total. Uses the same fallback chain as 13H.2/13H.3/13H.4 inline copies.
// Returns null when no value is available — callers must skip rendering rather than guess.
function getBookingTotal(b: Booking): number | null {
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

function getPaymentStatusStyle(status: string, overdue: boolean) {
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

function renderPaymentStatusBadge(booking: Booking) {
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

function renderPricingIntelligenceBadge(label: string, value: string, tone: "tier" | "confidence") {
  const styles =
    tone === "tier"
      ? {
          color: GOLD,
          backgroundColor: "rgba(197,164,109,0.14)",
          border: "rgba(197,164,109,0.3)",
        }
      : {
          color: "#9db7d9",
          backgroundColor: "rgba(157,183,217,0.14)",
          border: "rgba(157,183,217,0.26)",
        };

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
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "fit-content",
          fontFamily: LATO,
          fontSize: "10px",
          letterSpacing: "1.4px",
          textTransform: "uppercase",
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          border: `0.5px solid ${styles.border}`,
          borderRadius: "999px",
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        {formatAdvisoryLabel(value)}
      </span>
    </div>
  );
}

function renderRevenueEstimateRow(label: string, value: string) {
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

function getAddonRiskWarning(addon: BookingAddonSnapshot) {
  if (addon.same_day_warning === "same_day_checkout") return "Same-day checkout risk";
  if (addon.same_day_warning === "same_day_checkin") return "Same-day check-in risk";
  return null;
}

function hasResolvedAddonStatus(addon: BookingAddonSnapshot) {
  return addon.status === "approved" || addon.status === "declined";
}

function addonHasTrackedOffer(addon: BookingAddonSnapshot) {
  return addon.offer_applied === true;
}

function isAddonDiscounted(addon: BookingAddonSnapshot) {
  return (
    addonHasTrackedOffer(addon) ||
    addon.pricing_type === "percentage" ||
    (typeof addon.original_price === "number" && typeof addon.price === "number" && addon.original_price > addon.price)
  );
}

function hasDiscountPriceMetadata(addon: BookingAddonSnapshot) {
  return (
    addonHasTrackedOffer(addon) &&
    typeof addon.original_price === "number" &&
    typeof addon.price === "number" &&
    typeof addon.savings === "number"
  );
}

function addonNeedsAttention(addon: BookingAddonSnapshot) {
  if (hasResolvedAddonStatus(addon)) return false;
  return (
    addon.status === "pending_approval" ||
    addon.status === "at_risk" ||
    addon.same_day_warning === "same_day_checkout" ||
    addon.same_day_warning === "same_day_checkin"
  );
}

function sortByNewest(items: Booking[]) {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function sortConfirmedBookings(items: Booking[], sortKey: ConfirmedSortKey) {
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

function bookingDateRangesOverlap(a: Booking, b: Booking) {
  return a.check_in < b.check_out && b.check_in < a.check_out;
}

// Phase 14B: classify a booking as an event inquiry — both event_type set AND structured marker in notes.
function isEventInquiryBooking(booking: Pick<Booking, "event_type" | "message">) {
  return Boolean(booking.event_type) && typeof booking.message === "string" && booking.message.includes("[Event Inquiry]");
}

/** Advisory only: matches typical admin cancel email path when an address exists (auth email not available client-side for members). */
function cancelFlowLikelySendsEmail(booking: Pick<Booking, "member_id" | "guest_email">, memberListEmail: string | null | undefined): boolean {
  if (!booking.member_id) return Boolean(booking.guest_email?.trim());
  return Boolean(memberListEmail?.trim());
}

// Phase 14L: build a copy-ready alternative-offer message for admin use.
function buildAlternativeOfferMessage(
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

function parseRequestedEventServicesFromMessage(message: string | null | undefined): EventProposalServiceOption[] {
  if (typeof message !== "string" || !message.includes("Requested Event Services:")) return [];

  const lines = message.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === "Requested Event Services:");
  if (startIndex < 0) return [];

  const services: EventProposalServiceOption[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
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

function parseDateOnlyParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function dateOnlySerial(value: string) {
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

function dateOnlyGapDays(startExclusive: string, endInclusiveStart: string) {
  const startSerial = dateOnlySerial(startExclusive);
  const endSerial = dateOnlySerial(endInclusiveStart);
  if (startSerial === null || endSerial === null) return null;
  return endSerial - startSerial;
}

export default function BookingsTable({
  loading,
  filteredBookings: _filteredBookings,
  members,
  isMobile,
  statusFilter,
  setStatusFilter,
  villaFilter,
  setVillaFilter,
  dateFilter,
  setDateFilter,
  clearFilters,
  villaOptions,
  updatingId,
  updateStatus,
  emailWarnings,
}: {
  loading: boolean;
  filteredBookings: Booking[];
  members: Member[];
  isMobile: boolean;
  statusFilter: "all" | "pending" | "confirmed" | "cancelled";
  setStatusFilter: (value: "all" | "pending" | "confirmed" | "cancelled") => void;
  villaFilter: string;
  setVillaFilter: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  clearFilters: () => void;
  villaOptions: string[];
  updatingId: string | null;
  updateStatus: (id: string, status: "confirmed" | "cancelled") => void;
  emailWarnings: Record<string, string>;
}) {
  const { bookings, setBookings, setError } = useAdminData();
  const [approvingAddonId, setApprovingAddonId] = useState<string | null>(null);
  const [expandedCompactId, setExpandedCompactId] = useState<string | null>(null);
  const [bulkActionBookingId, setBulkActionBookingId] = useState<string | null>(null);
  const [confirmedSort, setConfirmedSort] = useState<ConfirmedSortKey>("created_desc");
  const [hiddenCancelledIds, setHiddenCancelledIds] = useState<string[]>([]);
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<string | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({});
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, ProposalDraft>>({});
  // Phase 14L: offer-prep panel state. Key = `${bookingId}:${suggestion.label}`.
  const [activeOfferKey, setActiveOfferKey] = useState<string | null>(null);
  const [copiedOfferKey, setCopiedOfferKey] = useState<string | null>(null);

  async function patchAddonResolution(bookingId: string, addonId: string, decision: "approve" | "decline") {
    const res = await fetch(`/api/admin/bookings/${bookingId}/approve-addon`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addon_id: addonId, decision }),
    });
    const data = await res.json();

    if (res.ok && Array.isArray(data.addons_snapshot)) {
      setBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId ? { ...booking, addons_snapshot: data.addons_snapshot } : booking,
        ),
      );
      return data.addons_snapshot as BookingAddonSnapshot[];
    }

    throw new Error(data.error ?? "Failed to update add-on state.");
  }

  async function resolveAddon(bookingId: string, addonId: string, decision: "approve" | "decline") {
    const key = `${bookingId}-${addonId}-${decision}`;
    setApprovingAddonId(key);

    try {
      await patchAddonResolution(bookingId, addonId, decision);
    } catch (error) {
      console.error("[admin] resolve-addon network error:", error);
    } finally {
      setApprovingAddonId(null);
    }
  }

  async function approveAllAddonsAndConfirm(booking: Booking) {
    const unresolvedApprovalAddons = getAddonSnapshots(booking).filter(
      (addon) => addon.requires_approval && addon.status === "pending_approval",
    );

    if (unresolvedApprovalAddons.length === 0) {
      await updateStatus(booking.id, "confirmed");
      return;
    }

    setBulkActionBookingId(booking.id);

    try {
      for (const addon of unresolvedApprovalAddons) {
        await patchAddonResolution(booking.id, addon.id, "approve");
      }
      await updateStatus(booking.id, "confirmed");
    } catch (error) {
      console.error("[admin] approve-all-and-confirm failed:", error);
    } finally {
      setBulkActionBookingId(null);
    }
  }

  function getPaymentDraft(booking: Booking): PaymentDraft {
    return paymentDrafts[booking.id] ?? {
      depositAmount: booking.deposit_amount != null ? String(booking.deposit_amount) : "",
      dueAt: toDateTimeLocalInput(booking.payment_due_at),
      requestNote: "",
      paymentAmount: "",
      paymentMethod: booking.payment_method ?? "whish",
      paymentReference: booking.payment_reference ?? "",
      paymentNotes: "",
      refundAmount: booking.refund_amount != null ? String(booking.refund_amount) : "",
      refundNote: "",
    };
  }

  function getProposalDraft(booking: Booking): ProposalDraft {
    const requestedServices = parseRequestedEventServicesFromMessage(booking.message);
    const persistedIncludedServices = Array.isArray(booking.proposal_included_services)
      ? booking.proposal_included_services
      : [];
    const includedServiceKeys =
      persistedIncludedServices.length > 0
        ? persistedIncludedServices.map((service) => createEventServiceKey(service.id?.trim() || service.label))
        : requestedServices.map((service) => service.key);

    return proposalDrafts[booking.id] ?? {
      totalAmount: booking.proposal_total_amount != null ? String(booking.proposal_total_amount) : "",
      depositAmount: booking.proposal_deposit_amount != null ? String(booking.proposal_deposit_amount) : "",
      validUntil: toDateTimeLocalInput(booking.proposal_valid_until),
      includedServiceKeys,
      excludedServices: booking.proposal_excluded_services ?? "",
      optionalServices: booking.proposal_optional_services ?? "",
      proposalNotes: booking.proposal_notes ?? "",
      paymentMethods:
        Array.isArray(booking.proposal_payment_methods) && booking.proposal_payment_methods.length > 0
          ? booking.proposal_payment_methods
          : ["whish", "bank_transfer", "cash"],
    };
  }

  function updatePaymentDraft(bookingId: string, updates: Partial<PaymentDraft>) {
    setPaymentDrafts((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] ?? {
          depositAmount: "",
          dueAt: "",
          requestNote: "",
          paymentAmount: "",
          paymentMethod: "whish",
          paymentReference: "",
          paymentNotes: "",
          refundAmount: "",
          refundNote: "",
        }),
        ...updates,
      },
    }));
  }

  function updateProposalDraft(bookingId: string, updates: Partial<ProposalDraft>) {
    setProposalDrafts((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] ?? {
          totalAmount: "",
          depositAmount: "",
          validUntil: "",
          includedServiceKeys: [],
          excludedServices: "",
          optionalServices: "",
          proposalNotes: "",
          paymentMethods: ["whish", "bank_transfer", "cash"],
        }),
        ...updates,
      },
    }));
  }

  async function patchBookingRecord(bookingId: string, updates: Record<string, unknown>, actionKey: string) {
    setError("");
    setPaymentUpdatingId(`${bookingId}:${actionKey}`);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to update booking details.");
        return null;
      }

      if (data.booking) {
        setBookings((prev) => prev.map((booking) => (booking.id === bookingId ? { ...booking, ...data.booking } : booking)));
      }

      return data.booking as Booking | null;
    } catch (error) {
      console.error("[admin] booking update error:", error);
      setError("Failed to update booking details.");
      return null;
    } finally {
      setPaymentUpdatingId(null);
    }
  }

  function getSelectedProposalServices(booking: Booking, draft: ProposalDraft): BookingProposalIncludedService[] {
    const selectedKeys = new Set(draft.includedServiceKeys);
    return parseRequestedEventServicesFromMessage(booking.message)
      .filter((service) => selectedKeys.has(service.key))
      .map((service) => ({
        id: service.id ?? null,
        label: service.label,
        quantity: service.quantity,
        unit_label: service.unit_label,
      }));
  }

  async function requestDeposit(booking: Booking) {
    const draft = getPaymentDraft(booking);
    const depositAmount = parseAmountInput(draft.depositAmount);
    if (depositAmount === null) {
      setError("Enter a valid deposit amount before requesting payment.");
      return;
    }

    const dueAtIso = draft.dueAt ? new Date(draft.dueAt).toISOString() : null;
    const nextNotes = draft.requestNote.trim() || booking.payment_notes || null;
    const updated = await patchBookingRecord(
      booking.id,
      {
        deposit_amount: depositAmount,
        payment_method: draft.paymentMethod || null,
        payment_due_at: dueAtIso,
        payment_notes: nextNotes,
        payment_status: "payment_requested",
        payment_requested_at: new Date().toISOString(),
      },
      "request-deposit",
    );

    if (updated) {
      updatePaymentDraft(booking.id, { requestNote: "" });
    }
  }

  async function recordPayment(booking: Booking) {
    const draft = getPaymentDraft(booking);
    const receivedAmount = parseAmountInput(draft.paymentAmount);
    if (receivedAmount === null) {
      setError("Enter a valid payment amount before recording payment.");
      return;
    }
    if (!draft.paymentMethod) {
      setError("Select a payment method before recording payment.");
      return;
    }

    const currentPaid = typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
      ? booking.amount_paid
      : 0;
    const { estimatedTotalRaw } = getBookingRevenueData(booking);
    const nextAmountPaid = currentPaid + receivedAmount;
    const nextPaymentStatus =
      typeof estimatedTotalRaw === "number" && nextAmountPaid >= estimatedTotalRaw
        ? "paid_in_full"
        : "deposit_paid";
    const nextNotes = draft.paymentNotes.trim() || booking.payment_notes || null;

    const updated = await patchBookingRecord(
      booking.id,
      {
        payment_method: draft.paymentMethod,
        amount_paid: nextAmountPaid,
        payment_reference: draft.paymentReference.trim() || null,
        payment_notes: nextNotes,
        payment_received_at: new Date().toISOString(),
        payment_status: nextPaymentStatus,
      },
      "record-payment",
    );

    if (updated) {
      updatePaymentDraft(booking.id, {
        paymentAmount: "",
        paymentNotes: "",
        paymentReference: updated.payment_reference ?? draft.paymentReference,
      });
    }
  }

  async function issueRefund(booking: Booking) {
    const draft = getPaymentDraft(booking);
    const refundAmount = parseAmountInput(draft.refundAmount);
    if (refundAmount === null) {
      setError("Enter a valid refund amount before recording a refund.");
      return;
    }

    const combinedNotes = [booking.payment_notes?.trim(), draft.refundNote.trim() ? `Refund: ${draft.refundNote.trim()}` : ""]
      .filter(Boolean)
      .join("\n");

    const updated = await patchBookingRecord(
      booking.id,
      {
        refund_status: "refunded",
        refund_amount: refundAmount,
        refunded_at: new Date().toISOString(),
        payment_notes: combinedNotes || null,
      },
      "issue-refund",
    );

    if (updated) {
      updatePaymentDraft(booking.id, { refundAmount: "", refundNote: "" });
    }
  }

  async function sendPaymentReminder(booking: Booking) {
    if (getPaymentStatus(booking) !== "payment_requested") {
      setError("Payment reminders are only available after requesting payment.");
      return;
    }

    await patchBookingRecord(
      booking.id,
      { send_payment_reminder: true },
      "send-reminder",
    );
  }

  async function saveEventProposalDraft(booking: Booking) {
    const draft = getProposalDraft(booking);
    const proposalTotalAmount = parseAmountInput(draft.totalAmount);
    const proposalDepositAmount = parseAmountInput(draft.depositAmount);
    const proposalValidUntil = draft.validUntil ? new Date(draft.validUntil).toISOString() : null;
    const proposalIncludedServices = getSelectedProposalServices(booking, draft);

    await patchBookingRecord(
      booking.id,
      {
        proposal_status: "draft",
        proposal_total_amount: proposalTotalAmount,
        proposal_deposit_amount: proposalDepositAmount,
        proposal_included_services: proposalIncludedServices,
        proposal_excluded_services: draft.excludedServices.trim() || null,
        proposal_optional_services: draft.optionalServices.trim() || null,
        proposal_notes: draft.proposalNotes.trim() || null,
        proposal_valid_until: proposalValidUntil,
        proposal_payment_methods: draft.paymentMethods,
      },
      "save-proposal",
    );
  }

  async function sendEventProposal(booking: Booking) {
    const draft = getProposalDraft(booking);
    const proposalTotalAmount = parseAmountInput(draft.totalAmount);
    const proposalDepositAmount = parseAmountInput(draft.depositAmount);
    const proposalValidUntil = draft.validUntil ? new Date(draft.validUntil).toISOString() : null;
    const proposalIncludedServices = getSelectedProposalServices(booking, draft);

    await patchBookingRecord(
      booking.id,
      {
        proposal_total_amount: proposalTotalAmount,
        proposal_deposit_amount: proposalDepositAmount,
        proposal_included_services: proposalIncludedServices,
        proposal_excluded_services: draft.excludedServices.trim() || null,
        proposal_optional_services: draft.optionalServices.trim() || null,
        proposal_notes: draft.proposalNotes.trim() || null,
        proposal_valid_until: proposalValidUntil,
        proposal_payment_methods: draft.paymentMethods,
        send_event_proposal: true,
      },
      "send-proposal",
    );
  }

  function getMember(booking: Booking) {
    return booking.member_id ? members.find((member) => member.id === booking.member_id) : null;
  }

  function getBookingDisplayName(booking: Booking) {
    if (!booking.member_id) return booking.guest_name ?? "Guest";
    return getMember(booking)?.full_name ?? "Member";
  }

  function getAddonSnapshots(booking: Booking) {
    return booking.addons_snapshot ?? [];
  }

  function bookingHasPendingAddonApproval(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addon.requires_approval && addon.status === "pending_approval");
  }

  function bookingHasOperationalAttention(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addonNeedsAttention(addon));
  }

  function bookingHasDiscountedAddon(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addonHasTrackedOffer(addon));
  }

  function getBookingOfferSavingsTotal(booking: Booking) {
    const total = getAddonSnapshots(booking).reduce((sum, addon) => {
      if (!addonHasTrackedOffer(addon) || typeof addon.savings !== "number") return sum;
      return sum + addon.savings;
    }, 0);

    return total > 0 ? total : null;
  }

  function bookingRequiresAction(booking: Booking) {
    if (booking.status === "cancelled") return false;
    return booking.status === "pending" || bookingHasPendingAddonApproval(booking) || bookingHasOperationalAttention(booking);
  }

  const filterActive = villaFilter !== "all" || dateFilter !== "";
  const sortActive = confirmedSort !== "created_desc";

  const visibleBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (villaFilter !== "all" && booking.villa !== villaFilter) return false;
      if (dateFilter && booking.check_in !== dateFilter) return false;
      return true;
    });
  }, [bookings, villaFilter, dateFilter]);

  const pendingOverlapMap = useMemo(() => {
    const pendingOnly = bookings.filter((booking) => booking.status === "pending");
    const overlaps = new Map<string, Booking[]>();

    for (let i = 0; i < pendingOnly.length; i += 1) {
      for (let j = i + 1; j < pendingOnly.length; j += 1) {
        const current = pendingOnly[i];
        const other = pendingOnly[j];

        if (current.villa !== other.villa) continue;
        if (!bookingDateRangesOverlap(current, other)) continue;

        overlaps.set(current.id, [...(overlaps.get(current.id) ?? []), other]);
        overlaps.set(other.id, [...(overlaps.get(other.id) ?? []), current]);
      }
    }

    return overlaps;
  }, [bookings]);

  function getPendingOverlaps(booking: Booking) {
    return pendingOverlapMap.get(booking.id) ?? [];
  }

  // Phase 14A: pending-vs-confirmed conflict detection. Frontend/admin-only — no backend changes.
  const confirmedConflictMap = useMemo(() => {
    const map = new Map<string, Booking[]>();
    const pendingOnly = bookings.filter((b) => b.status === "pending");
    const confirmedOnly = bookings.filter((b) => b.status === "confirmed");
    for (const p of pendingOnly) {
      const pRange = getOperationalRange(p);
      const conflicts = confirmedOnly.filter((c) => c.villa === p.villa && rangesOverlap(pRange, getOperationalRange(c)));
      if (conflicts.length > 0) map.set(p.id, conflicts);
    }
    return map;
  }, [bookings]);

  function getConfirmedConflicts(booking: Booking) {
    return confirmedConflictMap.get(booking.id) ?? [];
  }

  function hasConfirmedOverlap(booking: Booking) {
    return (confirmedConflictMap.get(booking.id) ?? []).length > 0;
  }

  // Phase 14K: alternative date suggestions for conflict/on-hold pending bookings.
  const conflictSuggestionsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAlternativeDateSuggestions>>();
    const confirmedOnly = bookings.filter((b) => b.status === "confirmed");
    const pendingOnly = bookings.filter((b) => b.status === "pending");
    for (const p of pendingOnly) {
      if (!confirmedConflictMap.has(p.id)) continue;
      map.set(
        p.id,
        findAlternativeDateSuggestions({
          villa: p.villa,
          check_in: p.check_in,
          check_out: p.check_out,
          isEvent: isEventInquiryBooking(p),
          confirmedBookings: confirmedOnly,
          excludeBookingId: p.id,
        }),
      );
    }
    return map;
  }, [bookings, confirmedConflictMap]);

  const deadDayUpsellMap = useMemo(() => {
    const byVilla = new Map<string, Booking[]>();
    const opportunities = new Map<string, DeadDayUpsellOpportunity[]>();

    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;
      byVilla.set(booking.villa, [...(byVilla.get(booking.villa) ?? []), booking]);
    }

    for (const villaBookings of Array.from(byVilla.values())) {
      const sortedVillaBookings = [...villaBookings].sort(
        (a, b) => a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out) || a.created_at.localeCompare(b.created_at),
      );

      for (let index = 0; index < sortedVillaBookings.length - 1; index += 1) {
        const current = sortedVillaBookings[index];
        const next = sortedVillaBookings[index + 1];
        const gapDays = dateOnlyGapDays(current.check_out, next.check_in);
        if (gapDays !== 1) continue;

        const opportunityDate = current.check_out;
        const dateLabel = fmt(opportunityDate);
        opportunities.set(current.id, [
          ...(opportunities.get(current.id) ?? []),
          { kind: "late_checkout", dateISO: opportunityDate, dateLabel, pairedBooking: next },
        ]);
        opportunities.set(next.id, [
          ...(opportunities.get(next.id) ?? []),
          { kind: "early_checkin", dateISO: opportunityDate, dateLabel, pairedBooking: current },
        ]);
      }
    }

    return opportunities;
  }, [bookings]);

  function getDeadDayUpsells(booking: Booking) {
    return deadDayUpsellMap.get(booking.id) ?? [];
  }

  const pendingBookings = sortByNewest(visibleBookings.filter((booking) => bookingRequiresAction(booking)));
  // Phase 14A: split pending into Action Required vs Conflict / On Hold for visual grouping. No DB status change.
  const actionRequiredBookings = pendingBookings.filter((b) => !hasConfirmedOverlap(b));
  const conflictHoldBookings = pendingBookings.filter((b) => hasConfirmedOverlap(b));
  // Phase 14B: further split action-required into stay requests vs event inquiries (admin-only frontend classification).
  const stayRequestBookings = actionRequiredBookings.filter((b) => !isEventInquiryBooking(b));
  const eventInquiryBookings = actionRequiredBookings.filter((b) => isEventInquiryBooking(b));

  const confirmedBookings = sortConfirmedBookings(
    visibleBookings.filter((booking) => booking.status === "confirmed" && !bookingRequiresAction(booking)),
    confirmedSort,
  );

  const cancelledBookings = sortByNewest(
    visibleBookings.filter((booking) => booking.status === "cancelled" && !hiddenCancelledIds.includes(booking.id)),
  );
  const hiddenCancelledCount = visibleBookings.filter(
    (booking) => booking.status === "cancelled" && hiddenCancelledIds.includes(booking.id),
  ).length;

  const sectionCounts: Record<BookingSectionKey, number> = {
    pending: pendingBookings.length,
    confirmed: confirmedBookings.length,
    cancelled: cancelledBookings.length,
  };

  const activeSection: BookingSectionKey =
    statusFilter === "confirmed" || statusFilter === "cancelled" ? statusFilter : "pending";

  const sectionBookings =
    activeSection === "pending"
      ? pendingBookings
      : activeSection === "confirmed"
        ? confirmedBookings
        : cancelledBookings;

  function renderOperationalBadge(text: string, kind: "approval" | "soft" | "strict") {
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

  function renderFilterChip(label: string, value: string, onClear: () => void) {
    return (
      <button
        type="button"
        onClick={onClear}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontFamily: LATO,
          fontSize: "10px",
          letterSpacing: "1.6px",
          textTransform: "uppercase",
          color: GOLD,
          backgroundColor: "rgba(197,164,109,0.12)",
          border: "0.5px solid rgba(197,164,109,0.32)",
          borderRadius: "999px",
          padding: "7px 10px",
          cursor: "pointer",
        }}
      >
        <span>
          {label}: {value}
        </span>
        <span style={{ color: WHITE, fontSize: "12px", lineHeight: 1 }}>x</span>
      </button>
    );
  }

  function handleResetView() {
    clearFilters();
    setConfirmedSort("created_desc");
    setHiddenCancelledIds([]);
    setExpandedCompactId(null);
  }

  function hideVisibleCancelledBookings() {
    setHiddenCancelledIds((prev) => {
      const next = new Set(prev);
      for (const booking of visibleBookings) {
        if (booking.status === "cancelled") next.add(booking.id);
      }
      return Array.from(next);
    });
    setExpandedCompactId(null);
  }

  function renderSectionTeaser(section: BookingSectionKey) {
    const tone = getSectionTone(section);
    const symbol = section === "confirmed" ? "C" : "X";

    return (
      <button
        key={section}
        type="button"
        onClick={() => setStatusFilter(section)}
        style={{
          width: "100%",
          background: `linear-gradient(90deg, ${tone.glow} 0%, rgba(255,255,255,0.02) 100%)`,
          border: `0.5px solid ${tone.accent}55`,
          borderRadius: "16px",
          padding: isMobile ? "16px 18px" : "18px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tone.glow,
              color: tone.accent,
              fontFamily: LATO,
              fontSize: "20px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {symbol}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "4px",
              }}
            >
              <span
                style={{
                  fontFamily: LATO,
                  fontSize: isMobile ? "20px" : "22px",
                  color: WHITE,
                  fontWeight: 700,
                }}
              >
                {tone.title}
              </span>
              <span
                style={{
                  minWidth: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: tone.accent,
                  color: MIDNIGHT,
                  fontFamily: LATO,
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {sectionCounts[section]}
              </span>
            </div>
            <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
              {tone.subtitle}
            </p>
          </div>
        </div>
        <span style={{ color: WHITE, fontFamily: LATO, fontSize: "22px", lineHeight: 1, opacity: 0.85 }}>
          {">"}
        </span>
      </button>
    );
  }

  function renderAddonRows(booking: Booking) {
    const addonSnapshots = getAddonSnapshots(booking);
    if (addonSnapshots.length === 0) return null;

    return (
      <div style={{ display: "grid", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: MUTED,
          }}
        >
          <span
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2.4px",
              textTransform: "uppercase",
            }}
          >
            Add-ons
          </span>
          <span style={{ flex: 1, height: "1px", backgroundColor: "rgba(255,255,255,0.08)" }} />
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          {addonSnapshots.map((addon) => {
            const statusTone = getAddonStatusTone(addon.status);
            const isResolved = hasResolvedAddonStatus(addon);
            const isPendingApproval = addon.requires_approval && addon.status === "pending_approval";
            const isApproving = approvingAddonId === `${booking.id}-${addon.id}-approve`;
            const isDeclining = approvingAddonId === `${booking.id}-${addon.id}-decline`;
            const sameDayRiskWarning = getAddonRiskWarning(addon);
            const hasDiscountMetadata = hasDiscountPriceMetadata(addon);
            const originalDiscountPrice = hasDiscountMetadata ? addon.original_price! : null;
            const finalDiscountPrice = hasDiscountMetadata ? addon.price! : null;
            const savingsAmount = hasDiscountMetadata ? addon.savings! : null;
            const hasTrackedOffer = addonHasTrackedOffer(addon);

            return (
              <div
                key={`${booking.id}-${addon.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
                  gap: "10px 14px",
                  alignItems: "start",
                  paddingBottom: "12px",
                  borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                    }}
                  >
                    <AddonIcon
                      label={addon.label}
                      size={16}
                      color="rgba(197,164,109,0.5)"
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <p
                          style={{
                            fontFamily: LATO,
                            fontSize: "15px",
                            color: WHITE,
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {addon.label}
                          {addon.pricing_type === "percentage" && (
                            <span
                              style={{
                                fontFamily: LATO,
                                fontSize: "9px",
                                letterSpacing: "1.2px",
                                textTransform: "uppercase",
                                color: "#7ecfcf",
                                backgroundColor: "rgba(126,207,207,0.12)",
                                border: "0.5px solid rgba(126,207,207,0.28)",
                                padding: "3px 7px",
                                borderRadius: "4px",
                                marginLeft: "8px",
                                verticalAlign: "middle",
                              }}
                            >
                              % of stay
                            </span>
                          )}
                        </p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                          {hasDiscountMetadata ? (
                            <>
                              <p
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "12px",
                                  color: MUTED,
                                  margin: 0,
                                  lineHeight: 1.4,
                                  textDecoration: "line-through",
                                }}
                              >
                                {formatAddonPrice(originalDiscountPrice)}
                              </p>
                              <p
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "13px",
                                  color: "#7ecfcf",
                                  margin: 0,
                                  lineHeight: 1.4,
                                }}
                              >
                                {formatAddonPrice(finalDiscountPrice)}
                              </p>
                              <p
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "11px",
                                  color: MUTED,
                                  margin: 0,
                                  lineHeight: 1.4,
                                }}
                              >
                                (Save ${savingsAmount?.toLocaleString("en-US")})
                              </p>
                            </>
                          ) : (
                            <p
                              style={{
                                fontFamily: LATO,
                                fontSize: "13px",
                                color: GOLD,
                                margin: 0,
                                lineHeight: 1.4,
                              }}
                            >
                              {formatAddonPrice(addon.price)}
                            </p>
                          )}
                        </div>

                        {hasDiscountMetadata && (
                          <p
                            style={{
                              fontFamily: LATO,
                              fontSize: "11px",
                              color: MUTED,
                              margin: "6px 0 0",
                              lineHeight: 1.5,
                            }}
                          >
                            Dead-day offer - Original {formatAddonPrice(originalDiscountPrice)} - Final {formatAddonPrice(finalDiscountPrice)} - Savings {formatAddonPrice(savingsAmount)}
                          </p>
                        )}
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                        {!isResolved && isPendingApproval && renderOperationalBadge("Requires approval", "approval")}
                        {addon.enforcement_mode === "soft" && renderOperationalBadge("Soft rule", "soft")}
                        {addon.enforcement_mode === "strict" && renderOperationalBadge("Strict rule", "strict")}
                        {hasTrackedOffer && (
                          <span
                            style={{
                              fontFamily: LATO,
                              fontSize: "9px",
                              letterSpacing: "1.2px",
                              textTransform: "uppercase",
                              color: "#7ecfcf",
                              backgroundColor: "rgba(126,207,207,0.12)",
                              padding: "4px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            Dead-day offer
                          </span>
                        )}
                      </div>

                      {sameDayRiskWarning && (
                        <p
                          style={{
                            fontFamily: LATO,
                            fontSize: "11px",
                            color: "#e2ab5a",
                            margin: "8px 0 0",
                            lineHeight: 1.5,
                          }}
                        >
                          {sameDayRiskWarning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    justifyItems: isMobile ? "start" : "end",
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      fontFamily: LATO,
                      fontSize: "9px",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: statusTone.color,
                      backgroundColor: statusTone.background,
                      border: `0.5px solid ${statusTone.border}`,
                      padding: "7px 10px",
                      borderRadius: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {addon.status.replaceAll("_", " ")}
                  </span>

                  {!isResolved && isPendingApproval && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: isMobile ? "column" : "row",
                        gap: "8px",
                        width: isMobile ? "100%" : "auto",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => resolveAddon(booking.id, addon.id, "approve")}
                        disabled={isApproving || isDeclining}
                        style={{
                          fontFamily: LATO,
                          fontSize: "10px",
                          letterSpacing: "1.2px",
                          textTransform: "uppercase",
                          color: "#6fcf8a",
                          backgroundColor: "transparent",
                          border: "0.5px solid rgba(111,207,138,0.45)",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          cursor: isApproving || isDeclining ? "not-allowed" : "pointer",
                          opacity: isApproving || isDeclining ? 0.5 : 1,
                          minWidth: isMobile ? "100%" : "auto",
                        }}
                      >
                        {isApproving ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveAddon(booking.id, addon.id, "decline")}
                        disabled={isApproving || isDeclining}
                        style={{
                          fontFamily: LATO,
                          fontSize: "10px",
                          letterSpacing: "1.2px",
                          textTransform: "uppercase",
                          color: "#f08b8b",
                          backgroundColor: "transparent",
                          border: "0.5px solid rgba(224,112,112,0.4)",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          cursor: isApproving || isDeclining ? "not-allowed" : "pointer",
                          opacity: isApproving || isDeclining ? 0.5 : 1,
                          minWidth: isMobile ? "100%" : "auto",
                        }}
                      >
                        {isDeclining ? "Saving..." : "Decline"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
          Approvals are saved to the booking record.
        </p>
      </div>
    );
  }

  function renderPaymentSection(booking: Booking) {
    if (booking.status !== "confirmed") return null;

    const draft = getPaymentDraft(booking);
    const paymentStatus = getPaymentStatus(booking);
    const overdue = isPaymentOverdue(booking);
    const paymentTone = getPaymentStatusStyle(paymentStatus, overdue);
    const depositAmount = formatMoney(booking.deposit_amount);
    const amountPaid = formatMoney(booking.amount_paid);
    const { stayValueRaw, addonsValueRaw, estimatedTotalRaw } = getBookingRevenueData(booking);
    const stayValue = formatMoney(stayValueRaw);
    const addonsValue = formatMoney(addonsValueRaw);
    const estimatedTotal = formatMoney(estimatedTotalRaw);
    const amountPaidRaw =
      typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid) ? booking.amount_paid : 0;
    const remainingBalanceRaw =
      typeof estimatedTotalRaw === "number" && Number.isFinite(estimatedTotalRaw)
        ? Math.max(0, estimatedTotalRaw - amountPaidRaw)
        : null;
    const remainingBalance = formatMoney(remainingBalanceRaw);
    const requestSentAt = formatDateTimeValue(booking.payment_requested_at);
    const receivedAt = formatDateTimeValue(booking.payment_received_at);
    const dueAt = formatDateTimeValue(booking.payment_due_at);
    const refundedAt = formatDateTimeValue(booking.refunded_at);
    const isRequesting = paymentUpdatingId === `${booking.id}:request-deposit`;
    const isRecording = paymentUpdatingId === `${booking.id}:record-payment`;
    const isRefunding = paymentUpdatingId === `${booking.id}:issue-refund`;
    const isReminderSending = paymentUpdatingId === `${booking.id}:send-reminder`;

    return (
      <div
        style={{
          border: `0.5px solid ${paymentTone.border}`,
          backgroundColor: paymentTone.background,
          padding: "14px 16px",
          borderRadius: "8px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: "4px" }}>
              <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: paymentTone.color, margin: 0 }}>
                Payment
              </p>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                {isEventInquiryBooking(booking)
                  ? "Events are confirmed manually and secured after payment."
                  : "Manual payment tracking for confirmed bookings only."}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {renderPaymentStatusBadge(booking)}
              {booking.refund_status === "refunded" && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: LATO,
                    fontSize: "9px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "#f08b8b",
                    backgroundColor: "rgba(224,112,112,0.14)",
                    border: "0.5px solid rgba(224,112,112,0.32)",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Refunded
                </span>
              )}
            </div>
          </div>

          {overdue && (
            <div
              style={{
                border: "0.5px solid rgba(224,112,112,0.3)",
                backgroundColor: "rgba(224,112,112,0.12)",
                padding: "10px 12px",
                borderRadius: "6px",
                display: "grid",
                gap: "4px",
              }}
            >
              <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f4b3b3", margin: 0, lineHeight: 1.5 }}>
                Overdue — payment not received.
              </p>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                Consider cancelling or following up.
              </p>
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              border: `0.5px solid ${paymentTone.border}`,
              backgroundColor: "rgba(255,255,255,0.03)",
              padding: "12px 14px",
              borderRadius: "8px",
              display: "grid",
              gap: "6px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
              Status
            </p>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "1.05rem", color: paymentTone.color, lineHeight: 1.2, margin: 0 }}>
              {paymentTone.label}
            </p>
          </div>
          <div
            style={{
              border: "0.5px solid rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
              padding: "12px 14px",
              borderRadius: "8px",
              display: "grid",
              gap: "6px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
              Amount paid
            </p>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "1.05rem", color: paymentStatus === "paid_in_full" || paymentStatus === "deposit_paid" ? "#6fcf8a" : WHITE, lineHeight: 1.2, margin: 0 }}>
              {amountPaid ?? "$0"}
            </p>
          </div>
          <div
            style={{
              border: "0.5px solid rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
              padding: "12px 14px",
              borderRadius: "8px",
              display: "grid",
              gap: "6px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.4px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
              Remaining balance
            </p>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "1.05rem", color: remainingBalanceRaw === 0 ? "#6fcf8a" : GOLD, lineHeight: 1.2, margin: 0 }}>
              {remainingBalance ?? "Unavailable"}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "12px 16px",
          }}
        >
          {renderRevenueEstimateRow("Stay value", stayValue ?? "Unavailable")}
          {renderRevenueEstimateRow("Add-ons value", addonsValue ?? "Unavailable")}
          {renderRevenueEstimateRow("Estimated total", estimatedTotal ?? "Unavailable")}
          {renderRevenueEstimateRow("Payment status", formatAdvisoryLabel(paymentStatus.replaceAll("_", " ")))}
          {renderRevenueEstimateRow("Deposit amount", depositAmount ?? "Not set")}
          {renderRevenueEstimateRow("Amount paid", amountPaid ?? "$0")}
          {renderRevenueEstimateRow("Remaining balance", remainingBalance ?? "Unavailable")}
          {renderRevenueEstimateRow("Method", booking.payment_method ? formatAdvisoryLabel(booking.payment_method.replaceAll("_", " ")) : "Not set")}
          {renderRevenueEstimateRow("Reference", booking.payment_reference?.trim() || "Not set")}
          {renderRevenueEstimateRow("Due date", dueAt ?? "Not set")}
        </div>

        {(requestSentAt || receivedAt || refundedAt || booking.payment_notes?.trim()) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: "10px 16px",
            }}
          >
            {requestSentAt ? renderRevenueEstimateRow("Requested", requestSentAt) : null}
            {receivedAt ? renderRevenueEstimateRow("Received", receivedAt) : null}
            {refundedAt ? renderRevenueEstimateRow("Refunded", refundedAt) : null}
            {booking.payment_notes?.trim()
              ? renderRevenueEstimateRow("Notes", booking.payment_notes.trim())
              : null}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              border: `0.5px solid ${BORDER}`,
              backgroundColor: "rgba(255,255,255,0.02)",
              padding: "12px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
              Request deposit
            </p>
            <input
              value={draft.depositAmount}
              onChange={(event) => updatePaymentDraft(booking.id, { depositAmount: event.target.value })}
              placeholder="Deposit amount"
              inputMode="decimal"
              style={fieldStyle}
            />
            <select
              value={draft.paymentMethod}
              onChange={(event) => updatePaymentDraft(booking.id, { paymentMethod: event.target.value })}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="whish" style={{ backgroundColor: MIDNIGHT }}>Whish</option>
              <option value="cash" style={{ backgroundColor: MIDNIGHT }}>Cash</option>
              <option value="bank_transfer" style={{ backgroundColor: MIDNIGHT }}>Bank transfer</option>
              <option value="card_manual" style={{ backgroundColor: MIDNIGHT }}>Card manual</option>
              <option value="other" style={{ backgroundColor: MIDNIGHT }}>Other</option>
            </select>
            <input
              type="datetime-local"
              value={draft.dueAt}
              onChange={(event) => updatePaymentDraft(booking.id, { dueAt: event.target.value })}
              style={fieldStyle}
            />
            <textarea
              value={draft.requestNote}
              onChange={(event) => updatePaymentDraft(booking.id, { requestNote: event.target.value })}
              placeholder="Optional note"
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
            <button
              type="button"
              onClick={() => requestDeposit(booking)}
              disabled={isRequesting}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: MIDNIGHT,
                backgroundColor: GOLD,
                border: "none",
                padding: "12px 14px",
                borderRadius: "6px",
                cursor: isRequesting ? "not-allowed" : "pointer",
                opacity: isRequesting ? 0.7 : 1,
              }}
            >
              {isRequesting ? "Saving..." : "Request deposit"}
            </button>
          </div>

          <div
            style={{
              border: `0.5px solid ${BORDER}`,
              backgroundColor: "rgba(255,255,255,0.02)",
              padding: "12px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
              Record payment
            </p>
            <select
              value={draft.paymentMethod}
              onChange={(event) => updatePaymentDraft(booking.id, { paymentMethod: event.target.value })}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="whish" style={{ backgroundColor: MIDNIGHT }}>Whish</option>
              <option value="cash" style={{ backgroundColor: MIDNIGHT }}>Cash</option>
              <option value="bank_transfer" style={{ backgroundColor: MIDNIGHT }}>Bank transfer</option>
              <option value="card_manual" style={{ backgroundColor: MIDNIGHT }}>Card manual</option>
              <option value="other" style={{ backgroundColor: MIDNIGHT }}>Other</option>
            </select>
            <input
              value={draft.paymentAmount}
              onChange={(event) => updatePaymentDraft(booking.id, { paymentAmount: event.target.value })}
              placeholder="Amount received"
              inputMode="decimal"
              style={fieldStyle}
            />
            <input
              value={draft.paymentReference}
              onChange={(event) => updatePaymentDraft(booking.id, { paymentReference: event.target.value })}
              placeholder="Reference"
              style={fieldStyle}
            />
            <textarea
              value={draft.paymentNotes}
              onChange={(event) => updatePaymentDraft(booking.id, { paymentNotes: event.target.value })}
              placeholder="Payment note"
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
            <button
              type="button"
              onClick={() => recordPayment(booking)}
              disabled={isRecording}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: WHITE,
                backgroundColor: "rgba(111,207,138,0.18)",
                border: "0.5px solid rgba(111,207,138,0.34)",
                padding: "12px 14px",
                borderRadius: "6px",
                cursor: isRecording ? "not-allowed" : "pointer",
                opacity: isRecording ? 0.7 : 1,
              }}
            >
              {isRecording ? "Saving..." : "Record payment"}
            </button>
          </div>

          <div
            style={{
              border: `0.5px solid ${BORDER}`,
              backgroundColor: "rgba(255,255,255,0.02)",
              padding: "12px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
              Issue refund
            </p>
            <input
              value={draft.refundAmount}
              onChange={(event) => updatePaymentDraft(booking.id, { refundAmount: event.target.value })}
              placeholder="Refund amount"
              inputMode="decimal"
              style={fieldStyle}
            />
            <textarea
              value={draft.refundNote}
              onChange={(event) => updatePaymentDraft(booking.id, { refundNote: event.target.value })}
              placeholder="Refund note"
              rows={5}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
            <button
              type="button"
              onClick={() => issueRefund(booking)}
              disabled={isRefunding}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: WHITE,
                backgroundColor: "rgba(224,112,112,0.14)",
                border: "0.5px solid rgba(224,112,112,0.32)",
                padding: "12px 14px",
                borderRadius: "6px",
                cursor: isRefunding ? "not-allowed" : "pointer",
                opacity: isRefunding ? 0.7 : 1,
              }}
            >
              {isRefunding ? "Saving..." : "Issue refund"}
            </button>
          </div>

          <div
            style={{
              border: `0.5px solid ${paymentStatus === "payment_requested" ? "rgba(197,164,109,0.24)" : BORDER}`,
              backgroundColor: paymentStatus === "payment_requested" ? "rgba(197,164,109,0.04)" : "rgba(255,255,255,0.02)",
              padding: "12px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
              Send reminder
            </p>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
              Resend the payment reminder email and append a reminder timestamp to payment notes.
            </p>
            <button
              type="button"
              onClick={() => sendPaymentReminder(booking)}
              disabled={paymentStatus !== "payment_requested" || isReminderSending}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: paymentStatus === "payment_requested" ? MIDNIGHT : MUTED,
                backgroundColor: paymentStatus === "payment_requested" ? GOLD : "rgba(255,255,255,0.05)",
                border: paymentStatus === "payment_requested" ? "none" : `0.5px solid ${BORDER}`,
                padding: "12px 14px",
                borderRadius: "6px",
                cursor: paymentStatus === "payment_requested" && !isReminderSending ? "pointer" : "not-allowed",
                opacity: paymentStatus === "payment_requested" ? (isReminderSending ? 0.7 : 1) : 0.55,
              }}
            >
              {isReminderSending ? "Sending..." : "Send payment reminder"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderEventProposalSection(booking: Booking) {
    if (!isEventInquiryBooking(booking)) return null;

    const draft = getProposalDraft(booking);
    const requestedServices = parseRequestedEventServicesFromMessage(booking.message);
    const selectedIncludedKeys = new Set(draft.includedServiceKeys);
    const proposalExpired = isProposalExpired(booking.proposal_status, booking.proposal_valid_until);
    const proposalStatus = proposalExpired ? "expired" : booking.proposal_status ?? "draft";
    const statusLabel =
      proposalStatus === "sent"
        ? "Proposal sent"
      : proposalStatus === "draft"
          ? "Draft proposal"
          : proposalStatus === "accepted"
            ? "Accepted"
            : proposalStatus === "declined"
              ? "Declined"
              : proposalStatus === "expired"
                ? "Proposal expired"
                : formatAdvisoryLabel(proposalStatus);
    const validUntil = formatDateTimeValue(booking.proposal_valid_until);
    const sentAt = formatDateTimeValue(booking.proposal_sent_at);
    const isSavingDraft = paymentUpdatingId === `${booking.id}:save-proposal`;
    const isSendingProposal = paymentUpdatingId === `${booking.id}:send-proposal`;
    const proposalTotal = formatMoney(booking.proposal_total_amount);
    const proposalDeposit = formatMoney(booking.proposal_deposit_amount);
    const proposalPaymentMethods =
      Array.isArray(booking.proposal_payment_methods) && booking.proposal_payment_methods.length > 0
        ? booking.proposal_payment_methods
        : draft.paymentMethods;
    const includedServicesDisplay =
      Array.isArray(booking.proposal_included_services) && booking.proposal_included_services.length > 0
        ? booking.proposal_included_services
        : getSelectedProposalServices(booking, draft);

    return (
      <div
        style={{
          border: "0.5px solid rgba(157,183,217,0.26)",
          backgroundColor: "rgba(157,183,217,0.05)",
          padding: "14px 16px",
          borderRadius: "8px",
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#9db7d9", margin: 0 }}>
              Event Proposal
            </p>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
              Draft and send a custom proposal without confirming the inquiry or triggering payment automatically.
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: LATO,
              fontSize: "9px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color:
                proposalStatus === "accepted"
                  ? "#6fcf8a"
                  : proposalStatus === "declined" || proposalStatus === "expired"
                    ? "#f2a7a7"
                    : proposalStatus === "sent"
                      ? GOLD
                      : "#9db7d9",
              backgroundColor:
                proposalStatus === "accepted"
                  ? "rgba(111,207,138,0.15)"
                  : proposalStatus === "declined" || proposalStatus === "expired"
                    ? "rgba(224,112,112,0.12)"
                    : proposalStatus === "sent"
                      ? "rgba(197,164,109,0.14)"
                      : "rgba(157,183,217,0.14)",
              border: `0.5px solid ${
                proposalStatus === "accepted"
                  ? "rgba(111,207,138,0.3)"
                  : proposalStatus === "declined" || proposalStatus === "expired"
                    ? "rgba(224,112,112,0.3)"
                    : proposalStatus === "sent"
                      ? "rgba(197,164,109,0.28)"
                      : "rgba(157,183,217,0.26)"
              }`,
              padding: "6px 10px",
              borderRadius: "6px",
              whiteSpace: "nowrap",
            }}
          >
            {statusLabel}
          </span>
        </div>

        <p style={{ fontFamily: LATO, fontSize: "11px", color: "#9db7d9", margin: 0, lineHeight: 1.55 }}>
          Event pricing remains custom and manual. Guests only see this proposal after it is sent.
        </p>

        <div
          style={{
            border: "0.5px solid rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.02)",
            padding: "10px 12px",
            borderRadius: "6px",
            display: "grid",
            gap: "6px",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
            Event flow
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
            Proposal sent {"->"} Accepted {"->"} Confirmed {"->"} Payment requested {"->"} Paid
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "#9db7d9", margin: 0, lineHeight: 1.55 }}>
            Events are confirmed manually and secured after payment.
          </p>
        </div>

        {(proposalStatus === "accepted" || proposalStatus === "declined" || proposalStatus === "expired") && (
          <div
            style={{
              border:
                proposalStatus === "accepted"
                  ? "0.5px solid rgba(111,207,138,0.26)"
                  : "0.5px solid rgba(224,112,112,0.26)",
              backgroundColor:
                proposalStatus === "accepted"
                  ? "rgba(111,207,138,0.08)"
                  : "rgba(224,112,112,0.08)",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            <p
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                color:
                  proposalStatus === "accepted"
                    ? "#6fcf8a"
                    : proposalStatus === "declined"
                      ? "#f2a7a7"
                      : "#f0bd67",
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              {proposalStatus === "accepted"
                ? "Guest accepted proposal — proceed with confirmation and payment manually."
                : proposalStatus === "declined"
                  ? "Guest declined proposal — revise or close request."
                  : "Proposal expired."}
            </p>
          </div>
        )}

        {proposalStatus === "accepted" && booking.status === "confirmed" && (
          <div
            style={{
              border:
                getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                  ? "0.5px solid rgba(111,207,138,0.26)"
                  : "0.5px solid rgba(197,164,109,0.26)",
              backgroundColor:
                getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                  ? "rgba(111,207,138,0.08)"
                  : "rgba(197,164,109,0.08)",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            <p
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                color:
                  getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                    ? "#6fcf8a"
                    : GOLD,
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              {getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                ? "Event confirmed and payment is in progress."
                : "Event confirmed. Request payment to secure the booking."}
            </p>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <input
            value={draft.totalAmount}
            onChange={(event) => updateProposalDraft(booking.id, { totalAmount: event.target.value })}
            placeholder="Proposal total"
            inputMode="decimal"
            style={fieldStyle}
          />
          <input
            value={draft.depositAmount}
            onChange={(event) => updateProposalDraft(booking.id, { depositAmount: event.target.value })}
            placeholder="Deposit amount"
            inputMode="decimal"
            style={fieldStyle}
          />
          <input
            type="datetime-local"
            value={draft.validUntil}
            onChange={(event) => updateProposalDraft(booking.id, { validUntil: event.target.value })}
            style={fieldStyle}
          />
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
            Included requested services
          </p>
          {requestedServices.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
              {requestedServices.map((service) => {
                const checked = selectedIncludedKeys.has(service.key);
                return (
                  <label
                    key={service.key}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      backgroundColor: checked ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextKeys = event.target.checked
                          ? [...draft.includedServiceKeys, service.key]
                          : draft.includedServiceKeys.filter((key) => key !== service.key);
                        updateProposalDraft(booking.id, { includedServiceKeys: Array.from(new Set(nextKeys)) });
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: "0 0 4px", lineHeight: 1.45 }}>
                        {service.label}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                        {formatEventProposalServiceLabel(service)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
              No structured requested services were found in this inquiry. You can still add exclusions, options, and proposal notes below.
            </p>
          )}
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
            Payment methods
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {EVENT_PROPOSAL_PAYMENT_METHODS.map((method) => {
              const selected = draft.paymentMethods.includes(method.value);
              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() =>
                    updateProposalDraft(booking.id, {
                      paymentMethods: selected
                        ? draft.paymentMethods.filter((value) => value !== method.value)
                        : [...draft.paymentMethods, method.value],
                    })
                  }
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: selected ? MIDNIGHT : WHITE,
                    backgroundColor: selected ? GOLD : "rgba(255,255,255,0.04)",
                    border: selected ? "none" : `0.5px solid ${BORDER}`,
                    padding: "10px 12px",
                    borderRadius: "999px",
                    cursor: "pointer",
                  }}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <textarea
            value={draft.excludedServices}
            onChange={(event) => updateProposalDraft(booking.id, { excludedServices: event.target.value })}
            placeholder="Excluded services"
            rows={4}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
          <textarea
            value={draft.optionalServices}
            onChange={(event) => updateProposalDraft(booking.id, { optionalServices: event.target.value })}
            placeholder="Optional services"
            rows={4}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </div>

        <textarea
          value={draft.proposalNotes}
          onChange={(event) => updateProposalDraft(booking.id, { proposalNotes: event.target.value })}
          placeholder="Proposal notes"
          rows={4}
          style={{ ...fieldStyle, resize: "vertical" }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "10px 16px",
          }}
        >
          {renderRevenueEstimateRow("Proposal total", proposalTotal ?? "Not set")}
          {renderRevenueEstimateRow("Deposit amount", proposalDeposit ?? "Not set")}
          {renderRevenueEstimateRow("Valid until", validUntil ?? "Not set")}
          {renderRevenueEstimateRow("Payment methods", proposalPaymentMethods.map((method) => formatPaymentMethodLabel(method)).join(", ") || "Not set")}
          {sentAt ? renderRevenueEstimateRow("Sent at", sentAt) : null}
        </div>

        {includedServicesDisplay.length > 0 && (
          <div style={{ display: "grid", gap: "8px" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
              Current included services
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {includedServicesDisplay.map((service, index) => (
                <span
                  key={`${service.label}-${index}`}
                  style={{
                    fontFamily: LATO,
                    fontSize: "11px",
                    color: WHITE,
                    border: "0.5px solid rgba(157,183,217,0.22)",
                    backgroundColor: "rgba(157,183,217,0.05)",
                    padding: "7px 10px",
                  }}
                >
                  {formatEventProposalServiceLabel(service)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => saveEventProposalDraft(booking)}
            disabled={isSavingDraft}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: WHITE,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: `0.5px solid ${BORDER}`,
              padding: "12px 14px",
              borderRadius: "6px",
              cursor: isSavingDraft ? "not-allowed" : "pointer",
              opacity: isSavingDraft ? 0.7 : 1,
            }}
          >
            {isSavingDraft ? "Saving..." : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => sendEventProposal(booking)}
            disabled={isSendingProposal}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: MIDNIGHT,
              backgroundColor: GOLD,
              border: "none",
              padding: "12px 14px",
              borderRadius: "6px",
              cursor: isSendingProposal ? "not-allowed" : "pointer",
              opacity: isSendingProposal ? 0.7 : 1,
            }}
          >
            {isSendingProposal ? "Sending..." : "Send proposal"}
          </button>
        </div>
      </div>
    );
  }

  function renderExpandedBookingDetails(booking: Booking, compactMode: boolean) {
    const isGuest = !booking.member_id;
    const memberInfo = getMember(booking);
    const displayName = isGuest ? booking.guest_name ?? "Guest" : memberInfo?.full_name ?? "Member";
    const displayEmail = isGuest ? booking.guest_email ?? "-" : memberInfo?.email ?? "-";
    const displayPhone = isGuest ? booking.guest_phone : memberInfo?.phone ?? null;
    const displayCountry = isGuest ? booking.guest_country : memberInfo?.country ?? null;
    const needsApproval = bookingHasPendingAddonApproval(booking);
    const needsAttention = bookingHasOperationalAttention(booking);
    const readyToConfirm = booking.status === "pending" && !needsApproval && !needsAttention;
    const accent = getCardAccent(booking, needsApproval || needsAttention || booking.status === "pending");
    const isUpdating = updatingId === booking.id;
    const isBulkResolving = bulkActionBookingId === booking.id;
    const eventInquiry = isEventInquiryBooking(booking);
    // Phase 14A: a pending booking that overlaps a confirmed booking cannot be confirmed without manual resolution.
    const confirmedConflicts = getConfirmedConflicts(booking);
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
    const overlappingPendingBookings = getPendingOverlaps(booking);
    const hasPendingOverlap = overlappingPendingBookings.length > 0;
    const deadDayUpsells = getDeadDayUpsells(booking);
    const hasDeadDayUpsell = deadDayUpsells.length > 0;
    const offerSavingsTotal = getBookingOfferSavingsTotal(booking);
    const hasTrackedOffer = bookingHasDiscountedAddon(booking);

    // Phase 13N: relative (comparison-based) revenue priority. Only meaningful when overlapping pending requests exist.
    const currentBookingTotal = getBookingTotal(booking);
    const overlapTotalsAll = hasPendingOverlap
      ? overlappingPendingBookings.map(getBookingTotal)
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
          padding: isMobile ? "1rem" : "1.45rem 1.5rem",
          boxShadow: compactMode ? "none" : `0 18px 44px rgba(0,0,0,0.24), inset 0 0 0 1px ${accent.glow}`,
          display: "grid",
          gap: isMobile ? "14px" : "18px",
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
          <div style={{ minWidth: 0, flex: "1 1 260px", paddingLeft: compactMode ? 0 : isMobile ? "12px" : "14px" }}>
            <p
              style={{
                fontFamily: PLAYFAIR,
                fontSize: compactMode ? (isMobile ? "1.4rem" : "1.65rem") : isMobile ? "1.7rem" : "2rem",
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
              justifyItems: isMobile ? "start" : "end",
              minWidth: isMobile ? "100%" : "auto",
            }}
          >
            <StatusBadge status={booking.status} />
            {booking.status === "confirmed" && renderPaymentStatusBadge(booking)}
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
            gridTemplateColumns: isMobile ? "1fr" : "auto 1fr",
            alignItems: "center",
            gap: "14px",
            border: `0.5px solid ${accent.border}`,
            borderRadius: "14px",
            backgroundColor: "rgba(255,255,255,0.03)",
            padding: isMobile ? "14px 16px" : "18px 20px",
          }}
        >
          <div
            style={{
              width: isMobile ? "44px" : "48px",
              height: isMobile ? "44px" : "48px",
              borderRadius: "12px",
              border: `0.5px solid ${accent.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: accent.color,
              fontFamily: LATO,
              fontSize: isMobile ? "18px" : "20px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            01
          </div>
          <p
            style={{
              fontFamily: LATO,
              fontSize: compactMode ? (isMobile ? "1.25rem" : "1.5rem") : isMobile ? "1.5rem" : "2rem",
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

        <div style={{ display: "grid", gap: "10px", color: MUTED }}>
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
          <p
            style={{
              fontFamily: LATO,
              fontSize: "12px",
              margin: 0,
              lineHeight: 1.65,
              opacity: booking.message?.trim() ? 1 : 0.8,
            }}
          >
            {booking.message?.trim() || "-"}
          </p>
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
                      Confirmed event · venue scheduling · {getBookingDisplayName(c)} · setup window{" "}
                      {fmt(addDaysToDateOnly(c.check_in, -1))} → {fmt(c.check_out)}
                    </>
                  ) : (
                    <>
                      Confirmed stay · {getBookingDisplayName(c)} · stay dates {fmt(c.check_in)} to {fmt(c.check_out)}
                    </>
                  )}
                </p>
              ))}
            </div>
            {/* 2. Suggested alternatives (Prepare offer lives here) */}
            {(() => {
              const suggestions = conflictSuggestionsMap.get(booking.id) ?? [];
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
                        const isActive = activeOfferKey === offerKey;
                        const message = buildAlternativeOfferMessage(
                          getBookingDisplayName(booking),
                          booking.check_in,
                          booking.check_out,
                          s,
                          eventInquiry,
                        );
                        const rawPhone = booking.guest_phone?.replace(/[^0-9]/g, "") ?? "";
                        const waUrl = rawPhone
                          ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`
                          : null;
                        const isCopied = copiedOfferKey === offerKey;
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
                                onClick={() => setActiveOfferKey(isActive ? null : offerKey)}
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
                                      setCopiedOfferKey(offerKey);
                                      setTimeout(() => setCopiedOfferKey((prev) => prev === offerKey ? null : prev), 2000);
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
                  onClick={() => updateStatus(booking.id, "cancelled")}
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
                const conflictNeedsApproval = bookingHasPendingAddonApproval(conflict);
                const conflictNeedsAttention = bookingHasOperationalAttention(conflict);
                const attentionLabel = conflictNeedsApproval
                  ? "Add-on approval needed"
                  : conflictNeedsAttention
                    ? "Add-ons need attention"
                    : null;

                return (
                  <div
                    key={conflict.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
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
                        {getBookingDisplayName(conflict)}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                        {conflict.villa} · {fmt(conflict.check_in)} to {fmt(conflict.check_out)}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "flex-end", gap: "6px", flexDirection: "column" }}>
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
            {/* Phase 13N: subtle dead-day heading */}
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#7ecfcf", margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
              Opportunity: sell adjacent day (early check-in / late checkout)
            </p>
            {deadDayUpsells.map((opportunity) => {
              const message =
                opportunity.kind === "late_checkout"
                  ? `Late checkout opportunity: ${opportunity.dateLabel}`
                  : `Early check-in opportunity: ${opportunity.dateLabel}`;

              return (
                <div key={`${opportunity.kind}-${opportunity.dateISO}-${opportunity.pairedBooking.id}`}>
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: "#7ecfcf", margin: "0 0 4px", lineHeight: 1.5 }}>
                    {message}
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                    Adjacent booking: {fmt(opportunity.pairedBooking.check_in)} to {fmt(opportunity.pairedBooking.check_out)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Phase 14B: event-inquiry pricing disclaimer — replaces stay-style totals in the admin context */}
        {isEventInquiryBooking(booking) && (
          <div
            style={{
              border: "0.5px solid rgba(157,183,217,0.28)",
              backgroundColor: "rgba(157,183,217,0.06)",
              padding: "10px 14px",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#9db7d9", margin: 0, lineHeight: 1.55 }}>
              Event pricing is customized after review. Stay totals shown elsewhere are for reference only and do not represent the event package price.
            </p>
          </div>
        )}

        {/* Phase 14J: confirmed event — show operational block range (setup day included) */}
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

        {renderEventProposalSection(booking)}

        {/* Phase 13H.2: Decision Signal panel — pending bookings only. Reuses existing revenue/overlap data. */}
        {booking.status === "pending" && (() => {
          const pricingIntelligence = getPricingIntelligenceMeta(booking);
          const addonSubtotalRaw = getAddonSnapshots(booking).reduce((sum, addon) => {
            return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
          }, 0);
          const stayValueRaw =
            getSnapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
            getSnapshotNumber(booking.pricing_snapshot?.subtotal) ??
            pricingIntelligence?.stay_value ??
            getPersistedStayValue(booking);
          const addonsValueRaw =
            pricingIntelligence?.addons_value ??
            (getAddonSnapshots(booking).length > 0 ? addonSubtotalRaw : 0);
          const estimatedTotalRaw =
            getSnapshotNumber(booking.pricing_snapshot?.estimated_total) ??
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
                  Estimated total
                </span>
                <span style={{ fontFamily: PLAYFAIR, fontSize: "22px", color: GOLD, lineHeight: 1.1 }}>
                  {totalDisplay}
                </span>
              </div>

              {/* Secondary metrics */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, minmax(0, 1fr))",
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
          // Same fallback chain as Decision Signal — computed per booking, no recomputation of pricing.
          function summarize(b: Booking) {
            const intel = getPricingIntelligenceMeta(b);
            const addonSubRaw = getAddonSnapshots(b).reduce((sum, addon) => {
              return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
            }, 0);
            const stayRaw =
              getSnapshotNumber(b.pricing_snapshot?.adjusted_stay_subtotal) ??
              getSnapshotNumber(b.pricing_snapshot?.subtotal) ??
              intel?.stay_value ??
              getPersistedStayValue(b);
            const addonsRaw =
              intel?.addons_value ??
              (getAddonSnapshots(b).length > 0 ? addonSubRaw : 0);
            const totalRaw =
              getSnapshotNumber(b.pricing_snapshot?.estimated_total) ??
              intel?.estimated_total ??
              intel?.internal_value ??
              (typeof stayRaw === "number" && typeof addonsRaw === "number"
                ? stayRaw + addonsRaw
                : null);
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
            return {
              totalRaw,
              totalDisplay: formatMoney(totalRaw) ?? "—",
              addonsRaw,
              addonsDisplay: formatMoney(addonsRaw),
              hasAddons: typeof addonsRaw === "number" && addonsRaw > 0,
              bedroomLabel,
              guestLabel,
            };
          }

          const currentSummary = summarize(booking);
          const conflictSummaries = overlappingPendingBookings.map((conflict) => ({
            booking: conflict,
            summary: summarize(conflict),
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
            s: ReturnType<typeof summarize>,
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
                    — {s.bedroomLabel} — {s.guestLabel} —{" "}
                    {s.hasAddons ? `${s.addonsDisplay} add-ons` : "no add-ons"}
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
                      {getBookingDisplayName(c.booking)} · {fmt(c.booking.check_in)} to {fmt(c.booking.check_out)}
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
                Prioritize higher-value confirmed bookings when overlaps exist.
              </p>
            </div>
          );
        })()}

        {(() => {
          const pricingIntelligence = getPricingIntelligenceMeta(booking);
          const addonSubtotalRaw = getAddonSnapshots(booking).reduce((sum, addon) => {
            return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
          }, 0);
          const stayValueRaw =
            getSnapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
            getSnapshotNumber(booking.pricing_snapshot?.subtotal) ??
            pricingIntelligence?.stay_value ??
            getPersistedStayValue(booking);
          const addonsValueRaw =
            pricingIntelligence?.addons_value ??
            (getAddonSnapshots(booking).length > 0 ? addonSubtotalRaw : 0);
          const estimatedTotalRaw =
            getSnapshotNumber(booking.pricing_snapshot?.estimated_total) ??
            pricingIntelligence?.estimated_total ??
            pricingIntelligence?.internal_value ??
            (typeof stayValueRaw === "number" && typeof addonsValueRaw === "number"
              ? stayValueRaw + addonsValueRaw
              : null);
          const stayValue = formatMoney(stayValueRaw);
          const addonsValue = formatMoney(addonsValueRaw);
          const estimatedTotal = formatMoney(estimatedTotalRaw);
          const hasAnyRevenueData = stayValue !== null || addonsValue !== null || estimatedTotal !== null;
          const tierLabel =
            pricingIntelligence?.tier && pricingIntelligence.tier !== "unknown"
              ? formatAdvisoryLabel(pricingIntelligence.tier)
              : "Not calculated";
          const confidenceLabel =
            pricingIntelligence?.tier && pricingIntelligence.tier !== "unknown"
              ? formatAdvisoryLabel(pricingIntelligence.confidence)
              : "Not calculated";
          const isUnavailableFallback =
            pricingIntelligence?.basis.reason === "intelligence_unavailable" && !hasAnyRevenueData;

          return (
          <div
            style={{
              border: "0.5px solid rgba(197,164,109,0.24)",
              backgroundColor: "rgba(197,164,109,0.06)",
              padding: "12px 14px 13px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ display: "grid", gap: "4px" }}>
              <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                Revenue Estimate
              </p>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                Advisory signal based on stay value, guest load, add-ons, and service intent.
              </p>
            </div>

            {hasAnyRevenueData ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    gap: "12px 16px",
                  }}
                >
                  {stayValue
                    ? renderRevenueEstimateRow("Stay value", stayValue)
                    : renderRevenueEstimateRow("Stay value", "Unavailable")}
                  {addonsValue
                    ? renderRevenueEstimateRow("Add-ons value", addonsValue)
                    : renderRevenueEstimateRow("Add-ons value", "Unavailable")}
                  {estimatedTotal
                    ? renderRevenueEstimateRow("Estimated total", estimatedTotal)
                    : renderRevenueEstimateRow("Estimated total", "Unavailable")}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px 16px",
                    alignItems: "center",
                  }}
                >
                  {renderPricingIntelligenceBadge("Revenue signal", tierLabel, "tier")}
                  {renderPricingIntelligenceBadge("Signal confidence", confidenceLabel, "confidence")}
                </div>
              </>
            ) : pricingIntelligence && isUnavailableFallback ? (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                Revenue estimate currently unavailable for this booking.
              </p>
            ) : (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                Revenue estimate unavailable for older booking.
              </p>
            )}
          </div>
          );
        })()}

        {renderPaymentSection(booking)}

        {renderAddonRows(booking)}

        {/* Phase 13H.4: Approval advisory — warns if a higher-value competing request exists */}
        {booking.status === "pending" && hasPendingOverlap && (() => {
          function getTotal(b: Booking): number | null {
            const intel = getPricingIntelligenceMeta(b);
            const addonSubRaw = getAddonSnapshots(b).reduce((sum, addon) => {
              return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
            }, 0);
            const stayRaw =
              getSnapshotNumber(b.pricing_snapshot?.adjusted_stay_subtotal) ??
              getSnapshotNumber(b.pricing_snapshot?.subtotal) ??
              intel?.stay_value ??
              getPersistedStayValue(b);
            const addonsRaw =
              intel?.addons_value ??
              (getAddonSnapshots(b).length > 0 ? addonSubRaw : 0);
            return (
              getSnapshotNumber(b.pricing_snapshot?.estimated_total) ??
              intel?.estimated_total ??
              intel?.internal_value ??
              (typeof stayRaw === "number" && typeof addonsRaw === "number" ? stayRaw + addonsRaw : null)
            );
          }
          const currentTotal = getTotal(booking);
          if (typeof currentTotal !== "number") return null;
          const conflictTotals = overlappingPendingBookings
            .map(getTotal)
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

        {/* Phase 13H.4: subtle confirmation context — pending bookings only */}
        {booking.status === "pending" && (canConfirm || needsApproval || canCancel) && (
          <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
            Confirming this request will move it to Confirmed bookings. Review conflicts and revenue before confirming.
          </p>
        )}

        {eventInquiry && booking.status === "pending" && !proposalAccepted && (
          <p style={{ fontFamily: LATO, fontSize: "10px", color: "#9db7d9", margin: 0, lineHeight: 1.5 }}>
            Wait for guest acceptance before confirming.
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
            justifyContent: isMobile ? "stretch" : "flex-end",
          }}
        >
          {/* Phase 13H.4 + 14M: Cancel on the left except conflict/on-hold pending (Cancel lives inside conflict panel). */}
          {canCancel && !(booking.status === "pending" && conflictHold) && (
            <button
              type="button"
              onClick={() => updateStatus(booking.id, "cancelled")}
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
                minWidth: isMobile ? "100%" : "140px",
                opacity: isUpdating ? 0.6 : 1,
                borderRadius: "6px",
                marginRight: !isMobile && (needsApproval || canConfirm) ? "auto" : 0,
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
                width: isMobile ? "100%" : "auto",
              }}
            >
              {booking.status === "pending" && needsApproval && (
                <button
                  type="button"
                  onClick={() => approveAllAddonsAndConfirm(booking)}
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
                    minWidth: isMobile ? "100%" : "260px",
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
                  onClick={() => updateStatus(booking.id, "confirmed")}
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
                    minWidth: isMobile ? "100%" : "188px",
                    borderRadius: "6px",
                  }}
                >
                  {eventInquiry ? "Confirm event" : (readyToConfirm ? "Confirm booking" : "Confirm booking")}
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
                    minWidth: isMobile ? "100%" : "188px",
                    borderRadius: "6px",
                    opacity: 0.6,
                  }}
                >
                  Request payment
                </button>
              )}
            </div>
          )}

          {emailWarnings[booking.id] && (
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
              {emailWarnings[booking.id]}
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderCompactRow(booking: Booking, section: "confirmed" | "cancelled" | "pending") {
    const expanded = expandedCompactId === booking.id;
    const conflictHoldRow = section === "pending" && hasConfirmedOverlap(booking);
    const conflictHoldReason = conflictHoldRow
      ? getConfirmedConflicts(booking).some((c) => isEventInquiryBooking(c))
        ? "Blocked by event setup window"
        : "Blocked by confirmed stay"
      : null;
    const accent = section === "confirmed" ? "#6fcf8a" : section === "cancelled" ? "#e07070" : conflictHoldRow ? "#e07070" : GOLD;
    const isGuest = !booking.member_id;
    const memberInfo = getMember(booking);
    const displayName = isGuest ? booking.guest_name ?? "Guest" : memberInfo?.full_name ?? "Member";
    const hasDeadDayUpsell = getDeadDayUpsells(booking).length > 0;

    return (
      <div
        key={booking.id}
        style={{
          border: `0.5px solid ${BORDER}`,
          borderRadius: "16px",
          backgroundColor: "rgba(255,255,255,0.02)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setExpandedCompactId((prev) => (prev === booking.id ? null : booking.id))}
          style={{
            width: "100%",
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
          </div>

          {!isMobile && (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: 0, lineHeight: 1.5 }}>
              {fmt(booking.check_in)} to {fmt(booking.check_out)}
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
                {fmt(booking.check_in)} to {fmt(booking.check_out)}
              </p>
            )}
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
            {bookingHasDiscountedAddon(booking) && (
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

        {expanded && <div style={{ padding: "0 12px 12px" }}>{renderExpandedBookingDetails(booking, true)}</div>}
      </div>
    );
  }

  const sectionTone = getSectionTone(activeSection);
  const sectionEmptyCopy: Record<BookingSectionKey, string> = {
    pending: "No bookings currently need action.",
    confirmed: "No confirmed bookings match the current filters.",
    cancelled: "No cancelled bookings match the current filters.",
  };
  const confirmedSortLabel =
    confirmedSort === "created_asc"
      ? "Oldest confirmed first"
      : confirmedSort === "check_in_asc"
        ? "Earliest check-in first"
        : confirmedSort === "check_in_desc"
          ? "Latest check-in first"
          : "Newly confirmed first";

  function renderBookingSkeletons() {
    if (activeSection === "pending") {
      return (
        <div style={{ display: "grid", gap: "16px" }} aria-hidden="true">
          {[0, 1].map((item) => (
            <div
              key={item}
              style={{
                border: "0.5px solid rgba(197,164,109,0.26)",
                borderRadius: "18px",
                padding: isMobile ? "1rem" : "1.45rem 1.5rem",
                minHeight: isMobile ? "360px" : "330px",
                background: "linear-gradient(135deg, rgba(24,36,52,0.98), rgba(18,29,43,0.98))",
                display: "grid",
                gap: "16px",
              }}
            >
              <SkeletonText width={isMobile ? "60%" : "34%"} height="24px" />
              <SkeletonBlock height={isMobile ? "58px" : "62px"} radius="10px" />
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <SkeletonText width="170px" />
                <SkeletonText width="130px" />
                <SkeletonText width="100px" />
              </div>
              <SkeletonBlock height="44px" radius="8px" />
              <div style={{ display: "grid", gap: "10px" }}>
                <SkeletonText width="100%" />
                <SkeletonText width="86%" />
                <SkeletonText width="72%" />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row" }}>
                <SkeletonBlock height="42px" width={isMobile ? "100%" : "132px"} radius="8px" />
                <SkeletonBlock height="42px" width={isMobile ? "100%" : "190px"} radius="8px" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: "12px" }} aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            style={{
              border: `0.5px solid ${BORDER}`,
              borderRadius: "16px",
              padding: isMobile ? "14px 16px" : "14px 18px",
              minHeight: isMobile ? "92px" : "74px",
              backgroundColor: "rgba(255,255,255,0.025)",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr auto" : "minmax(0, 1.15fr) minmax(0, 0.9fr) auto auto",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <SkeletonText width={isMobile ? "68%" : "180px"} height="18px" />
            {!isMobile && <SkeletonText width="220px" />}
            <SkeletonText width="86px" />
            <SkeletonText width="42px" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          background: "linear-gradient(180deg, rgba(26,37,53,0.98) 0%, rgba(23,33,47,0.98) 100%)",
          border: `0.5px solid ${BORDER}`,
          borderRadius: "22px",
          padding: isMobile ? "1rem" : "1.2rem",
          boxShadow: "0 20px 56px rgba(0,0,0,0.22)",
          display: "grid",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            flexDirection: isMobile ? "column" : "row",
            gap: "16px",
          }}
        >
          <div>
            <p style={{ fontFamily: LATO, fontSize: isMobile ? "14px" : "16px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
              Manage booking requests and approvals
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0",
              flexWrap: "wrap",
              border: `0.5px solid ${BORDER}`,
              borderRadius: "16px",
              padding: "4px",
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            {([
              ["pending", "Pending"] as const,
              ["confirmed", "Confirmed"] as const,
              ["cancelled", "Cancelled"] as const,
            ]).map(([section, label]) => {
              const active = activeSection === section;
              const tone = getSectionTone(section);
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setStatusFilter(section)}
                  style={{
                    minWidth: isMobile ? "calc(50% - 4px)" : "190px",
                    flex: isMobile ? "1 1 calc(50% - 4px)" : "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    padding: "16px 18px",
                    backgroundColor: active ? "rgba(255,255,255,0.03)" : "transparent",
                    border: `0.5px solid ${active ? tone.accent : "transparent"}`,
                    borderRadius: "12px",
                    color: active ? WHITE : MUTED,
                    fontFamily: LATO,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: active ? tone.accent : MUTED,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      minWidth: "28px",
                      height: "28px",
                      borderRadius: "999px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? tone.accent : "rgba(255,255,255,0.12)",
                      color: active ? MIDNIGHT : WHITE,
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {sectionCounts[section]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: isMobile ? "100%" : "220px", flex: "1 1 220px" }}>
            <label
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: MUTED,
                display: "block",
                marginBottom: "6px",
              }}
            >
              Villa
            </label>
            <select
              value={villaFilter}
              onChange={(event) => setVillaFilter(event.target.value)}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="all" style={{ backgroundColor: MIDNIGHT }}>
                All villas
              </option>
              {villaOptions.map((villa) => (
                <option key={villa} value={villa} style={{ backgroundColor: MIDNIGHT }}>
                  {villa}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: isMobile ? "100%" : "180px", flex: "1 1 180px" }}>
            <label
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: MUTED,
                display: "block",
                marginBottom: "6px",
              }}
            >
              Check-in
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              style={fieldStyle}
            />
          </div>

          <button
            type="button"
            onClick={handleResetView}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: filterActive ? WHITE : MUTED,
              backgroundColor: filterActive ? "rgba(197,164,109,0.12)" : "transparent",
              border: `0.5px solid ${filterActive ? "rgba(197,164,109,0.28)" : BORDER}`,
              padding: isMobile ? "12px 16px" : "12px 18px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              borderRadius: "8px",
            }}
          >
            Clear
          </button>
        </div>

        {(filterActive || (activeSection === "confirmed" && sortActive)) && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {villaFilter !== "all" && renderFilterChip("Villa", villaFilter, () => setVillaFilter("all"))}
            {dateFilter && renderFilterChip("Check-in", fmt(dateFilter), () => setDateFilter(""))}
            {activeSection === "confirmed" &&
              sortActive &&
              renderFilterChip("Sort", confirmedSortLabel, () => setConfirmedSort("created_desc"))}
          </div>
        )}
      </div>

      <div
        style={{
          background: "linear-gradient(180deg, rgba(26,37,53,0.98) 0%, rgba(23,33,47,0.98) 100%)",
          border: `0.5px solid ${BORDER}`,
          borderRadius: "22px",
          padding: isMobile ? "1rem" : "1.2rem",
          boxShadow: "0 20px 56px rgba(0,0,0,0.22)",
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: "16px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "6px",
              }}
            >
              <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "1.7rem" : "1.9rem", color: WHITE, margin: 0 }}>
                {sectionTone.title}
              </p>
              <span
                style={{
                  minWidth: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: sectionTone.accent,
                  color: MIDNIGHT,
                  fontFamily: LATO,
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {sectionCounts[activeSection]}
              </span>
            </div>
            <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
              {sectionTone.subtitle}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {activeSection === "confirmed" ? (
              <div style={{ minWidth: isMobile ? "100%" : "240px" }}>
                <select
                  value={confirmedSort}
                  onChange={(event) => setConfirmedSort(event.target.value as ConfirmedSortKey)}
                  style={{ ...fieldStyle, cursor: "pointer" }}
                >
                  <option value="created_desc" style={{ backgroundColor: MIDNIGHT }}>
                    Newly confirmed first
                  </option>
                  <option value="created_asc" style={{ backgroundColor: MIDNIGHT }}>
                    Oldest confirmed first
                  </option>
                  <option value="check_in_asc" style={{ backgroundColor: MIDNIGHT }}>
                    Earliest check-in first
                  </option>
                  <option value="check_in_desc" style={{ backgroundColor: MIDNIGHT }}>
                    Latest check-in first
                  </option>
                </select>
              </div>
            ) : (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 16px",
                  border: `0.5px solid ${BORDER}`,
                  borderRadius: "10px",
                  color: WHITE,
                  fontFamily: LATO,
                  fontSize: "12px",
                }}
              >
                <span>Sort by: Newest</span>
                <span style={{ color: MUTED }}>v</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleResetView}
              style={{
                width: "46px",
                height: "46px",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "10px",
                backgroundColor: "transparent",
                color: WHITE,
                cursor: "pointer",
                fontFamily: LATO,
                fontSize: "16px",
                lineHeight: 1,
              }}
              aria-label="Reset booking filters"
            >
              R
            </button>
            {activeSection === "cancelled" && sectionBookings.length > 0 && (
              <button
                type="button"
                onClick={hideVisibleCancelledBookings}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: MUTED,
                  backgroundColor: "transparent",
                  border: `0.5px solid ${BORDER}`,
                  padding: "12px 16px",
                  borderRadius: "10px",
                  cursor: "pointer",
                }}
              >
                Hide cancelled from view
              </button>
            )}
            {activeSection === "cancelled" && hiddenCancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setHiddenCancelledIds([])}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: GOLD,
                  backgroundColor: "rgba(197,164,109,0.08)",
                  border: "0.5px solid rgba(197,164,109,0.28)",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  cursor: "pointer",
                }}
              >
                Show hidden ({hiddenCancelledCount})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          renderBookingSkeletons()
        ) : sectionBookings.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>{sectionEmptyCopy[activeSection]}</p>
        ) : activeSection === "pending" ? (
          // Phase 14A + 14B: pending section split into Stay Requests / Event Inquiries / Conflict / On Hold.
          <div style={{ display: "grid", gap: "20px" }}>
            {stayRequestBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  Stay Requests ({stayRequestBookings.length})
                </p>
                {stayRequestBookings.map((booking) => renderCompactRow(booking, "pending"))}
              </div>
            )}
            {eventInquiryBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#9db7d9", margin: 0 }}>
                  Event Inquiries ({eventInquiryBookings.length})
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  Event inquiries are reviewed separately. Pricing is customized after review — stay totals do not apply.
                </p>
                {eventInquiryBookings.map((booking) => renderCompactRow(booking, "pending"))}
              </div>
            )}
            {conflictHoldBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e07070", margin: 0 }}>
                  Conflict / On Hold ({conflictHoldBookings.length})
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  These requests conflict with the calendar (confirmed stays or event setup windows). Resolve manually — no automatic action will be taken.
                </p>
                {conflictHoldBookings.map((booking) => renderCompactRow(booking, "pending"))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {sectionBookings.map((booking) => renderCompactRow(booking, activeSection))}
          </div>
        )}
      </div>

      {activeSection === "pending" && (
        <div style={{ display: "grid", gap: "14px" }}>
          {renderSectionTeaser("confirmed")}
          {renderSectionTeaser("cancelled")}
        </div>
      )}
    </div>
  );
}
