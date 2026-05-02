"use client";

import { useMemo, useState } from "react";
import type { Booking, BookingAddonSnapshot, Member } from "./types";
import { AddonIcon } from "@/components/addon-icon";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { BORDER, fieldStyle, fmt, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "./theme";

type BookingSectionKey = "pending" | "confirmed" | "cancelled";
type ConfirmedSortKey = "created_desc" | "created_asc" | "check_in_asc" | "check_in_desc";
type DeadDayUpsellOpportunity = {
  kind: "late_checkout" | "early_checkin";
  dateISO: string;
  dateLabel: string;
  pairedBooking: Booking;
};

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

function formatAdvisoryLabel(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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
  const { bookings, setBookings } = useAdminData();
  const [approvingAddonId, setApprovingAddonId] = useState<string | null>(null);
  const [expandedCompactId, setExpandedCompactId] = useState<string | null>(null);
  const [bulkActionBookingId, setBulkActionBookingId] = useState<string | null>(null);
  const [confirmedSort, setConfirmedSort] = useState<ConfirmedSortKey>("created_desc");
  const [hiddenCancelledIds, setHiddenCancelledIds] = useState<string[]>([]);

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
    const canConfirm = booking.status === "pending" && !needsApproval;
    const canCancel = booking.status === "pending" || booking.status === "confirmed";
    const overlappingPendingBookings = getPendingOverlaps(booking);
    const hasPendingOverlap = overlappingPendingBookings.length > 0;
    const deadDayUpsells = getDeadDayUpsells(booking);
    const hasDeadDayUpsell = deadDayUpsells.length > 0;
    const offerSavingsTotal = getBookingOfferSavingsTotal(booking);
    const hasTrackedOffer = bookingHasDiscountedAddon(booking);

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
            {fmt(booking.check_in)} to {fmt(booking.check_out)}
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

        {renderAddonRows(booking)}

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: isMobile ? "stretch" : "flex-end",
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

          {canCancel && (
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
              }}
            >
              Cancel
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
              {readyToConfirm ? "Confirm booking" : "Confirm booking"}
            </button>
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

  function renderCompactRow(booking: Booking, section: "confirmed" | "cancelled") {
    const expanded = expandedCompactId === booking.id;
    const accent = section === "confirmed" ? "#6fcf8a" : "#e07070";
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
          <div style={{ display: "grid", gap: "16px" }}>
            {sectionBookings.map((booking) => (
              <div key={booking.id}>{renderExpandedBookingDetails(booking, false)}</div>
            ))}
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
