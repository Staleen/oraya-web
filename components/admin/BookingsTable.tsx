"use client";

import { useState } from "react";
import { formatBeirutDateTime } from "@/lib/format-date";
import type { Booking, Member } from "./types";
import { GOLD, WHITE, MIDNIGHT, MUTED, LATO, PLAYFAIR, SURFACE, BORDER, fieldStyle, fmt } from "./theme";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { AddonIcon } from "@/components/addon-icon";

type BookingSectionKey = "pending" | "confirmed" | "cancelled";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { text: string; background: string; border: string }> = {
    pending: {
      text: GOLD,
      background: "rgba(197,164,109,0.15)",
      border: "rgba(197,164,109,0.35)",
    },
    confirmed: {
      text: "#6fcf8a",
      background: "rgba(80,180,100,0.15)",
      border: "rgba(111,207,138,0.38)",
    },
    cancelled: {
      text: "#f08b8b",
      background: "rgba(224,112,112,0.14)",
      border: "rgba(224,112,112,0.35)",
    },
  };
  const tone = colors[status] ?? { text: MUTED, background: "transparent", border: BORDER };

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
        padding: "6px 10px",
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
    return { color: "#6fcf8a", backgroundColor: "rgba(80,180,100,0.15)", borderColor: "rgba(111,207,138,0.32)" };
  }
  if (status === "at_risk") {
    return { color: "#e2ab5a", backgroundColor: "rgba(226,171,90,0.16)", borderColor: "rgba(226,171,90,0.3)" };
  }
  return { color: "#9db7d9", backgroundColor: "rgba(157,183,217,0.14)", borderColor: "rgba(157,183,217,0.28)" };
}

function getOperationalBadgeStyle(kind: "approval" | "soft" | "strict") {
  if (kind === "strict") {
    return { color: "#e78f8f", backgroundColor: "rgba(224,112,112,0.14)" };
  }
  if (kind === "soft") {
    return { color: "#e2ab5a", backgroundColor: "rgba(226,171,90,0.15)" };
  }
  return { color: GOLD, backgroundColor: "rgba(197,164,109,0.14)" };
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
      accentSoft: "rgba(80,180,100,0.08)",
      title: "Confirmed",
      subtitle: "Confirmed stays and bookings with no pending actions.",
    };
  }
  if (section === "cancelled") {
    return {
      accent: "#e07070",
      accentSoft: "rgba(224,112,112,0.08)",
      title: "Cancelled",
      subtitle: "Bookings that were cancelled.",
    };
  }
  return {
    accent: GOLD,
    accentSoft: "rgba(197,164,109,0.08)",
    title: "Pending / Action Required",
    subtitle: "Bookings needing confirmation or add-on review.",
  };
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
          prev.map((b) => (b.id === bookingId ? { ...b, addons_snapshot: d.addons_snapshot } : b)),
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

  const pendingBookings = filteredBookings.filter((booking) => bookingRequiresAction(booking));
  const confirmedBookings = filteredBookings.filter((booking) => booking.status === "confirmed" && !bookingRequiresAction(booking));
  const cancelledBookings = filteredBookings.filter((booking) => booking.status === "cancelled");

  const sectionCounts: Record<BookingSectionKey, number> = {
    pending: pendingBookings.length,
    confirmed: confirmedBookings.length,
    cancelled: cancelledBookings.length,
  };

  const activeSection: BookingSectionKey =
    statusFilter === "confirmed" || statusFilter === "cancelled"
      ? statusFilter
      : "pending";

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
          backgroundColor: tone.backgroundColor,
          padding: "3px 7px",
          borderRadius: "999px",
        }}
      >
        {text}
      </span>
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

    return (
      <div
        key={booking.id}
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${BORDER}`,
          boxShadow: "0 16px 36px rgba(0,0,0,0.18)",
          padding: isMobile ? "1rem" : "1.25rem 1.35rem",
          display: "grid",
          gap: isMobile ? "14px" : "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <p
              style={{
                fontFamily: PLAYFAIR,
                fontSize: isMobile ? "1.7rem" : "1.95rem",
                color: isGuest ? WHITE : GOLD,
                margin: "0 0 6px",
                lineHeight: 1.1,
              }}
            >
              {displayName}
            </p>
            <p
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: isGuest ? MUTED : GOLD,
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
                  color: GOLD,
                  backgroundColor: "rgba(197,164,109,0.14)",
                  border: "0.5px solid rgba(197,164,109,0.28)",
                  padding: "5px 9px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                }}
              >
                Approval needed
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            border: `0.5px solid rgba(197,164,109,0.3)`,
            backgroundColor: "rgba(255,255,255,0.025)",
            padding: isMobile ? "14px 16px" : "16px 18px",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: "0 0 8px" }}>
            {booking.villa}
          </p>
          <p
            style={{
              fontFamily: LATO,
              fontSize: isMobile ? "1.35rem" : "1.65rem",
              fontWeight: 700,
              color: WHITE,
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {fmt(booking.check_in)} → {fmt(booking.check_out)}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
            color: MUTED,
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
            {displayEmail}
            {displayPhone ? ` | ${displayPhone}` : ""}
            {displayCountry ? ` | ${displayCountry}` : ""}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
            {booking.sleeping_guests} sleeping
            {booking.day_visitors > 0 ? ` | ${booking.day_visitors} visitors` : ""}
            {booking.event_type ? ` | ${booking.event_type}` : ""}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", margin: 0, lineHeight: 1.6 }}>
            Submitted {formatBeirutDateTime(booking.created_at)}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", margin: 0, lineHeight: 1.65 }}>
            {booking.message?.trim() || "-"}
          </p>
        </div>

        {needsAddonAttention && (
          <div
            style={{
              border: "0.5px solid rgba(226,171,90,0.24)",
              backgroundColor: "rgba(226,171,90,0.08)",
              padding: "10px 12px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.5 }}>
              This booking has add-ons requiring attention.
            </p>
          </div>
        )}

        {addonSnapshots.length > 0 && (
          <div style={{ display: "grid", gap: "10px" }}>
            <p
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: MUTED,
                margin: 0,
              }}
            >
              Add-ons
            </p>
            <div style={{ display: "grid", gap: "10px" }}>
              {addonSnapshots.map((addon) => {
                const tone = getAddonStatusTone(addon.status);
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
                      padding: "10px 0",
                      borderTop: "0.5px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <AddonIcon label={addon.label} size={16} color="rgba(197,164,109,0.5)" style={{ flexShrink: 0 }} />
                        <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0, lineHeight: 1.4 }}>
                          {addon.label}
                        </p>
                      </div>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
                        {formatAddonPrice(addon.price)}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
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
                              padding: "3px 7px",
                              borderRadius: "999px",
                            }}
                          >
                            Approved
                          </span>
                        )}
                        {addon.enforcement_mode === "soft" && renderOperationalBadge("Soft rule", "soft")}
                        {addon.enforcement_mode === "strict" && renderOperationalBadge("Strict rule", "strict")}
                      </div>
                      {sameDayRiskWarning && (
                        <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: "7px 0 0", lineHeight: 1.5 }}>
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
                          color: tone.color,
                          backgroundColor: tone.backgroundColor,
                          border: `0.5px solid ${tone.borderColor}`,
                          padding: "6px 9px",
                          borderRadius: "999px",
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
                            padding: "8px 10px",
                            borderRadius: "2px",
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
          {canConfirm && (
            <button
              onClick={() => updateStatus(booking.id, "confirmed")}
              disabled={isUpdating}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "1.4px",
                textTransform: "uppercase",
                color: "#2E2E2E",
                backgroundColor: isUpdating ? "rgba(80,180,100,0.5)" : "#6fcf8a",
                border: "none",
                padding: "12px 18px",
                cursor: isUpdating ? "not-allowed" : "pointer",
                minWidth: isMobile ? "100%" : "140px",
              }}
            >
              Confirm booking
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => updateStatus(booking.id, "cancelled")}
              disabled={isUpdating}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "1.4px",
                textTransform: "uppercase",
                color: WHITE,
                backgroundColor: isUpdating ? "rgba(224,112,112,0.5)" : "#e07070",
                border: "none",
                padding: "12px 18px",
                cursor: isUpdating ? "not-allowed" : "pointer",
                minWidth: isMobile ? "100%" : "140px",
              }}
            >
              Cancel booking
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
      <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "0.9rem" : "1rem" }}>
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
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "0.9rem" : "1rem" }}>
        <div style={{ display: "grid", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              alignItems: "stretch",
            }}
          >
            {([
              ["pending", "Pending"] as const,
              ["confirmed", "Confirmed"] as const,
              ["cancelled", "Cancelled"] as const,
            ]).map(([section, label]) => {
              const active = activeSection === section;
              const count = sectionCounts[section];
              const tone = getSectionTone(section);
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setStatusFilter(section)}
                  style={{
                    flex: isMobile ? "1 1 100%" : "0 0 auto",
                    minWidth: isMobile ? "100%" : "180px",
                    fontFamily: LATO,
                    backgroundColor: active ? tone.accentSoft : "rgba(255,255,255,0.015)",
                    border: `0.5px solid ${active ? tone.accent : BORDER}`,
                    color: active ? WHITE : MUTED,
                    padding: isMobile ? "14px 16px" : "13px 16px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
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
                        backgroundColor: active ? tone.accent : "rgba(255,255,255,0.08)",
                        color: active ? MIDNIGHT : WHITE,
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              border: `0.5px solid ${BORDER}`,
              backgroundColor: "rgba(255,255,255,0.015)",
              padding: isMobile ? "1rem" : "1.2rem",
            }}
          >
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "1.5rem" : "1.7rem", color: WHITE, margin: "0 0 6px" }}>
                {sectionTone.title}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>
                {sectionTone.subtitle}
              </p>
            </div>

            {loading ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
            ) : sectionBookings.length === 0 ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>{sectionEmptyCopy[activeSection]}</p>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {sectionBookings.map(renderBookingCard)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
