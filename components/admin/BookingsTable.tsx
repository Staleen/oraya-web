"use client";

import { useState } from "react";
import { formatBeirutDateTime } from "@/lib/format-date";
import type { Booking, Member } from "./types";
import { GOLD, WHITE, MIDNIGHT, MUTED, LATO, PLAYFAIR, SURFACE, BORDER, fieldStyle, fmt } from "./theme";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { AddonIcon } from "@/components/addon-icon";

type BookingSectionKey = "pending" | "confirmed" | "cancelled";

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, { text: string; background: string; border: string }> = {
    pending: {
      text: GOLD,
      background: "rgba(197,164,109,0.16)",
      border: "rgba(197,164,109,0.4)",
    },
    confirmed: {
      text: "#6fcf8a",
      background: "rgba(80,180,100,0.16)",
      border: "rgba(111,207,138,0.38)",
    },
    cancelled: {
      text: "#f08b8b",
      background: "rgba(224,112,112,0.14)",
      border: "rgba(224,112,112,0.35)",
    },
  };
  const tone = tones[status] ?? { text: MUTED, background: "transparent", border: BORDER };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: LATO,
        fontSize: "10px",
        letterSpacing: "1.7px",
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

function getAddonStatusTone(status: "confirmed" | "at_risk" | "pending_approval") {
  if (status === "confirmed") {
    return { color: "#6fcf8a", background: "rgba(80,180,100,0.15)", border: "rgba(111,207,138,0.32)" };
  }
  if (status === "at_risk") {
    return { color: "#e2ab5a", background: "rgba(226,171,90,0.16)", border: "rgba(226,171,90,0.3)" };
  }
  return { color: "#9db7d9", background: "rgba(157,183,217,0.14)", border: "rgba(157,183,217,0.28)" };
}

function getOperationalBadgeStyle(kind: "approval" | "soft" | "strict") {
  if (kind === "strict") return { color: "#e78f8f", background: "rgba(224,112,112,0.14)" };
  if (kind === "soft") return { color: "#e2ab5a", background: "rgba(226,171,90,0.15)" };
  return { color: GOLD, background: "rgba(197,164,109,0.14)" };
}

function getAddonRiskWarning(addon: NonNullable<Booking["addons_snapshot"]>[number]) {
  if (addon.same_day_warning === "same_day_checkout") return "Same-day checkout risk";
  if (addon.same_day_warning === "same_day_checkin") return "Same-day check-in risk";
  return null;
}

function formatAddonPrice(price: number | null) {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

function getSectionTone(section: BookingSectionKey) {
  if (section === "confirmed") {
    return {
      accent: "#6fcf8a",
      glow: "rgba(80,180,100,0.08)",
      title: "Confirmed Bookings",
      subtitle: "Confirmed and upcoming stays",
    };
  }
  if (section === "cancelled") {
    return {
      accent: "#e07070",
      glow: "rgba(224,112,112,0.08)",
      title: "Cancelled Bookings",
      subtitle: "Bookings that were cancelled",
    };
  }
  return {
    accent: GOLD,
    glow: "rgba(197,164,109,0.08)",
    title: "Pending Approvals",
    subtitle: "Bookings that require your attention",
  };
}

function getCardAccent(booking: Booking, needsApproval: boolean) {
  if (booking.status === "cancelled") {
    return { color: "#e07070", border: "rgba(224,112,112,0.7)", glow: "rgba(224,112,112,0.08)" };
  }
  if (booking.status === "confirmed") {
    return { color: "#6fcf8a", border: "rgba(111,207,138,0.6)", glow: "rgba(80,180,100,0.08)" };
  }
  if (needsApproval) {
    return { color: GOLD, border: "rgba(197,164,109,0.8)", glow: "rgba(197,164,109,0.08)" };
  }
  return { color: "#78abf6", border: "rgba(120,171,246,0.78)", glow: "rgba(120,171,246,0.08)" };
}

export default function BookingsTable({
  loading,
  filteredBookings,
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
  const { setBookings } = useAdminData();
  const [approvingAddonId, setApprovingAddonId] = useState<string | null>(null);

  async function approveAddon(bookingId: string, addonId: string) {
    const key = `${bookingId}-${addonId}`;
    setApprovingAddonId(key);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/approve-addon`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_id: addonId }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.addons_snapshot)) {
        setBookings((prev) =>
          prev.map((booking) => (booking.id === bookingId ? { ...booking, addons_snapshot: d.addons_snapshot } : booking)),
        );
      } else {
        console.error("[admin] approve-addon failed:", d.error ?? "unknown error");
      }
    } catch (err) {
      console.error("[admin] approve-addon network error:", err);
    } finally {
      setApprovingAddonId(null);
    }
  }

  function getMember(booking: Booking) {
    return booking.member_id ? members.find((member) => member.id === booking.member_id) : null;
  }

  function getAddonSnapshots(booking: Booking) {
    return booking.addons_snapshot ?? [];
  }

  function bookingNeedsAddonAttention(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addon.status === "at_risk" || addon.status === "pending_approval");
  }

  function bookingHasPendingAddonApproval(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addon.requires_approval && addon.admin_approved !== true);
  }

  function bookingRequiresAction(booking: Booking) {
    if (booking.status === "cancelled") return false;
    return booking.status === "pending" || bookingNeedsAddonAttention(booking) || bookingHasPendingAddonApproval(booking);
  }

  function sortByNewest(bookings: Booking[]) {
    return [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const pendingBookings = sortByNewest(filteredBookings.filter((booking) => bookingRequiresAction(booking)));
  const confirmedBookings = sortByNewest(
    filteredBookings.filter((booking) => booking.status === "confirmed" && !bookingRequiresAction(booking)),
  );
  const cancelledBookings = sortByNewest(filteredBookings.filter((booking) => booking.status === "cancelled"));

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

  function renderSectionTeaser(section: BookingSectionKey) {
    const tone = getSectionTone(section);
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
            {section === "confirmed" ? "✓" : "×"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span style={{ fontFamily: LATO, fontSize: isMobile ? "20px" : "22px", color: WHITE, fontWeight: 700 }}>
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
        <span style={{ color: WHITE, fontFamily: LATO, fontSize: "26px", lineHeight: 1, opacity: 0.85 }}>›</span>
      </button>
    );
  }

  function renderBookingCard(booking: Booking) {
    const isGuest = !booking.member_id;
    const memberInfo = getMember(booking);
    const displayName = isGuest ? (booking.guest_name ?? "Guest") : (memberInfo?.full_name ?? "Member");
    const displayEmail = isGuest ? (booking.guest_email ?? "-") : (memberInfo?.email ?? "-");
    const displayPhone = isGuest ? booking.guest_phone : (memberInfo?.phone ?? null);
    const displayCountry = isGuest ? booking.guest_country : (memberInfo?.country ?? null);
    const isUpdating = updatingId === booking.id;
    const addonSnapshots = getAddonSnapshots(booking);
    const needsAddonAttention = bookingNeedsAddonAttention(booking);
    const needsApproval = bookingHasPendingAddonApproval(booking);
    const canConfirm = booking.status === "pending";
    const canCancel = booking.status === "pending" || booking.status === "confirmed";
    const accent = getCardAccent(booking, needsApproval);
    const prominentLabel =
      needsApproval ? "Approval needed" : booking.status === "pending" ? "Pending approval" : booking.status;

    return (
      <div
        key={booking.id}
        style={{
          position: "relative",
          background: "linear-gradient(180deg, rgba(31,43,56,0.98) 0%, rgba(27,38,53,0.98) 100%)",
          border: `0.5px solid ${accent.border}`,
          borderRadius: "18px",
          padding: isMobile ? "1rem" : "1.45rem 1.5rem",
          boxShadow: `0 18px 44px rgba(0,0,0,0.24), inset 0 0 0 1px ${accent.glow}`,
          display: "grid",
          gap: isMobile ? "14px" : "18px",
        }}
      >
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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 260px", paddingLeft: isMobile ? "12px" : "14px" }}>
            <p
              style={{
                fontFamily: PLAYFAIR,
                fontSize: isMobile ? "1.7rem" : "2rem",
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
            {prominentLabel !== booking.status && (
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
                {prominentLabel}
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
            ▣
          </div>
          <p
            style={{
              fontFamily: LATO,
              fontSize: isMobile ? "1.5rem" : "2rem",
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
          <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>
            {booking.villa}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
            {displayEmail}
            {displayPhone ? ` | ${displayPhone}` : ""}
            {displayCountry ? ` | ${displayCountry}` : ""}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
            {booking.sleeping_guests} sleeping
            {booking.day_visitors > 0 ? ` | ${booking.day_visitors} visitors` : ""}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", margin: 0, lineHeight: 1.65, opacity: booking.message?.trim() ? 1 : 0.8 }}>
            {booking.message?.trim() || "-"}
          </p>
        </div>

        {needsAddonAttention && (
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

        {addonSnapshots.length > 0 && (
          <div style={{ display: "grid", gap: "12px" }}>
            <p
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2.4px",
                textTransform: "uppercase",
                color: MUTED,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span>Add-ons</span>
              <span style={{ flex: 1, height: "1px", backgroundColor: "rgba(255,255,255,0.08)" }} />
            </p>

            <div style={{ display: "grid", gap: "10px" }}>
              {addonSnapshots.map((addon) => {
                const statusTone = getAddonStatusTone(addon.status);
                const addonKey = `${booking.id}-${addon.id}`;
                const isApproved = addon.admin_approved === true;
                const isApproving = approvingAddonId === addonKey;
                const sameDayRiskWarning = getAddonRiskWarning(addon);

                return (
                  <div
                    key={addonKey}
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
                      gap: isMobile ? "8px" : "12px",
                      alignItems: "start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <AddonIcon label={addon.label} size={16} color="rgba(197,164,109,0.5)" style={{ flexShrink: 0 }} />
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                          <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0, lineHeight: 1.4 }}>
                            {addon.label}
                          </p>
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: GOLD, margin: 0 }}>
                            {formatAddonPrice(addon.price)}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                        {addon.requires_approval && !isApproved && renderOperationalBadge("Requires approval", "approval")}
                        {isApproved && (
                          <span
                            style={{
                              fontFamily: LATO,
                              fontSize: "9px",
                              letterSpacing: "1.2px",
                              textTransform: "uppercase",
                              color: "#6fcf8a",
                              backgroundColor: "rgba(80,180,100,0.15)",
                              padding: "4px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            Approved
                          </span>
                        )}
                        {addon.enforcement_mode === "soft" && renderOperationalBadge("Soft rule", "soft")}
                        {addon.enforcement_mode === "strict" && renderOperationalBadge("Strict rule", "strict")}
                      </div>

                      {sameDayRiskWarning && (
                        <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: "8px 0 0", lineHeight: 1.5 }}>
                          {sameDayRiskWarning}
                        </p>
                      )}
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
                        {addon.status.replace("_", " ")}
                      </span>
                      {addon.requires_approval && !isApproved && (
                        <button
                          type="button"
                          onClick={() => approveAddon(booking.id, addon.id)}
                          disabled={isApproving}
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
                            cursor: isApproving ? "not-allowed" : "pointer",
                            opacity: isApproving ? 0.5 : 1,
                            minWidth: isMobile ? "100%" : "auto",
                          }}
                        >
                          {isApproving ? "Saving..." : "Mark as approved"}
                        </button>
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
          {canCancel && (
            <button
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
              Confirm booking
            </button>
          )}

          {emailWarnings[booking.id] && (
            <span style={{ display: "block", width: "100%", fontFamily: LATO, fontSize: "10px", color: "#e0b070", lineHeight: 1.4 }}>
              {emailWarnings[booking.id]}
            </span>
          )}
        </div>
      </div>
    );
  }

  const sectionTone = getSectionTone(activeSection);
  const sectionEmptyCopy: Record<BookingSectionKey, string> = {
    pending: "No bookings currently need action.",
    confirmed: "No confirmed bookings match the current filters.",
    cancelled: "No cancelled bookings match the current filters.",
  };

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
                  <span style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: active ? tone.accent : MUTED }}>
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
            <select value={villaFilter} onChange={(e) => setVillaFilter(e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
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
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={fieldStyle} />
          </div>

          <button
            onClick={clearFilters}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: MUTED,
              backgroundColor: "transparent",
              border: `0.5px solid ${BORDER}`,
              padding: isMobile ? "12px 16px" : "12px 18px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              borderRadius: "8px",
            }}
          >
            Clear
          </button>
        </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
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
              <span style={{ color: MUTED }}>⌄</span>
            </div>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                width: "46px",
                height: "46px",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "10px",
                backgroundColor: "transparent",
                color: WHITE,
                cursor: "pointer",
                fontFamily: LATO,
                fontSize: "18px",
                lineHeight: 1,
              }}
              aria-label="Reset booking filters"
            >
              ↻
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
        ) : sectionBookings.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>{sectionEmptyCopy[activeSection]}</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {sectionBookings.map(renderBookingCard)}
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
