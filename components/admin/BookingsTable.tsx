"use client";
import { useState } from "react";
import { formatBeirutDateTime } from "@/lib/format-date";
import type { Booking, Member } from "./types";
import { GOLD, WHITE, MIDNIGHT, MUTED, LATO, PLAYFAIR, SURFACE, BORDER, thStyle, tdStyle, fieldStyle, fmt } from "./theme";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { AddonIcon } from "@/components/addon-icon";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "rgba(197,164,109,0.15)",
    confirmed: "rgba(80,180,100,0.15)",
    cancelled: "rgba(200,80,80,0.15)",
  };
  const text: Record<string, string> = {
    pending: GOLD,
    confirmed: "#6fcf8a",
    cancelled: "#e07070",
  };
  return (
    <span style={{
      fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px",
      textTransform: "uppercase", color: text[status] ?? MUTED,
      backgroundColor: colors[status] ?? "transparent",
      padding: "3px 10px", borderRadius: "2px",
    }}>
      {status}
    </span>
  );
}

function getAddonStatusTone(status: "confirmed" | "at_risk" | "pending_approval") {
  if (status === "confirmed") {
    return { color: "#6fcf8a", backgroundColor: "rgba(80,180,100,0.15)" };
  }
  if (status === "at_risk") {
    return { color: "#e2ab5a", backgroundColor: "rgba(226,171,90,0.16)" };
  }
  return { color: "#9db7d9", backgroundColor: "rgba(157,183,217,0.14)" };
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
          prev.map((b) => b.id === bookingId ? { ...b, addons_snapshot: d.addons_snapshot } : b)
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
    return booking.member_id ? members.find((m) => m.id === booking.member_id) : null;
  }

  function getAddonSnapshots(booking: Booking) {
    return booking.addons_snapshot ?? [];
  }

  function bookingNeedsAddonAttention(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addon.status === "at_risk" || addon.status === "pending_approval");
  }

  function bookingHasAddonApproval(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addon.requires_approval);
  }

  function getAddonAttentionBadge(booking: Booking) {
    if (!bookingNeedsAddonAttention(booking)) return null;
    return (
      <span style={{
        display: "inline-block",
        fontFamily: LATO,
        fontSize: "9px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: "#e2ab5a",
        backgroundColor: "rgba(226,171,90,0.14)",
        padding: "3px 8px",
        borderRadius: "2px",
      }}>
        Add-on attention
      </span>
    );
  }

  function getAddonApprovalBadge(booking: Booking) {
    if (!bookingHasAddonApproval(booking)) return null;
    return (
      <span style={{
        display: "inline-block",
        fontFamily: LATO,
        fontSize: "9px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: GOLD,
        backgroundColor: "rgba(197,164,109,0.14)",
        padding: "3px 8px",
        borderRadius: "2px",
      }}>
        Approval needed
      </span>
    );
  }

  function renderAddonOperationalBadges(booking: Booking, addon: NonNullable<Booking["addons_snapshot"]>[number]) {
    const badges: JSX.Element[] = [];
    if (addon.requires_approval) {
      const tone = getOperationalBadgeStyle("approval");
      badges.push(
        <span
          key={`${booking.id}-${addon.id}-approval`}
          style={{
            fontFamily: LATO,
            fontSize: "9px",
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: tone.color,
            backgroundColor: tone.backgroundColor,
            padding: "3px 7px",
            borderRadius: "2px",
          }}
        >
          Requires approval
        </span>,
      );
    }
    if (addon.enforcement_mode === "soft") {
      const tone = getOperationalBadgeStyle("soft");
      badges.push(
        <span
          key={`${booking.id}-${addon.id}-soft`}
          style={{
            fontFamily: LATO,
            fontSize: "9px",
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: tone.color,
            backgroundColor: tone.backgroundColor,
            padding: "3px 7px",
            borderRadius: "2px",
          }}
        >
          Soft rule
        </span>,
      );
    }
    if (addon.enforcement_mode === "strict") {
      const tone = getOperationalBadgeStyle("strict");
      badges.push(
        <span
          key={`${booking.id}-${addon.id}-strict`}
          style={{
            fontFamily: LATO,
            fontSize: "9px",
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: tone.color,
            backgroundColor: tone.backgroundColor,
            padding: "3px 7px",
            borderRadius: "2px",
          }}
        >
          Strict rule
        </span>,
      );
    }
    return badges;
  }

  function formatAddonPrice(price: number | null) {
    if (typeof price !== "number") return "Price on request";
    return `$${price.toLocaleString("en-US")}`;
  }

  return (
    <div>
      <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "0.85rem" : "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: isMobile ? "100%" : "180px", flex: "1 1 180px" }}>
            <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "pending" | "confirmed" | "cancelled")}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="all" style={{ backgroundColor: MIDNIGHT }}>All</option>
              <option value="pending" style={{ backgroundColor: MIDNIGHT }}>Pending</option>
              <option value="confirmed" style={{ backgroundColor: MIDNIGHT }}>Confirmed</option>
              <option value="cancelled" style={{ backgroundColor: MIDNIGHT }}>Cancelled</option>
            </select>
          </div>
          <div style={{ minWidth: isMobile ? "100%" : "220px", flex: "1 1 220px" }}>
            <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
              Villa
            </label>
            <select
              value={villaFilter}
              onChange={(e) => setVillaFilter(e.target.value)}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="all" style={{ backgroundColor: MIDNIGHT }}>All villas</option>
              {villaOptions.map((villa) => (
                <option key={villa} value={villa} style={{ backgroundColor: MIDNIGHT }}>{villa}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: isMobile ? "100%" : "180px", flex: "1 1 180px" }}>
            <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
              Check-in
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={fieldStyle}
            />
          </div>
          <button
            onClick={clearFilters}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", color: MUTED, backgroundColor: "transparent",
              border: `0.5px solid ${BORDER}`, padding: isMobile ? "12px 16px" : "12px 18px", cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading...</p>
        ) : filteredBookings.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No bookings match the current filters.</p>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredBookings.map((b) => {
              const isGuest = !b.member_id;
              const isCancelled = b.status === "cancelled";
              const isConfirmed = b.status === "confirmed";
              const isPending = b.status === "pending";
              const isUpdating = updatingId === b.id;
              const memberInfo = getMember(b);
              const displayName = isGuest ? (b.guest_name ?? "Guest") : (memberInfo?.full_name ?? "Member");
              const displayEmail = isGuest ? (b.guest_email ?? "-") : (memberInfo?.email ?? "-");
              const displayPhone = isGuest ? b.guest_phone : (memberInfo?.phone ?? null);
              const displayCountry = isGuest ? b.guest_country : (memberInfo?.country ?? null);

              return (
                <div key={b.id} style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1rem", opacity: isCancelled ? 0.72 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: "1.15rem", color: isGuest ? WHITE : GOLD, margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {displayName}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: isGuest ? MUTED : GOLD, margin: 0 }}>
                        {isGuest ? "Guest" : "Member"}
                      </p>
                    </div>
                    <div style={{ display: "grid", gap: "6px", justifyItems: "end" }}>
                      <StatusBadge status={b.status} />
                      {getAddonAttentionBadge(b)}
                      {getAddonApprovalBadge(b)}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: 0 }}>
                      {b.villa}
                    </p>
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
                      {fmt(b.check_in)} to {fmt(b.check_out)}
                    </p>
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                      {displayEmail}
                      {displayPhone ? ` | ${displayPhone}` : ""}
                      {displayCountry ? ` | ${displayCountry}` : ""}
                    </p>
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
                      {b.sleeping_guests} sleeping
                      {b.day_visitors > 0 ? ` | ${b.day_visitors} visitors` : ""}
                    </p>
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                      {b.message?.trim() || "-"}
                    </p>
                  </div>

                  {bookingNeedsAddonAttention(b) && (
                    <div style={{ border: "0.5px solid rgba(226,171,90,0.24)", backgroundColor: "rgba(226,171,90,0.08)", padding: "10px 12px", marginBottom: "12px" }}>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.5 }}>
                        This booking has add-ons requiring attention.
                      </p>
                    </div>
                  )}

                  {getAddonSnapshots(b).length > 0 && (
                    <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                      <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
                        Add-ons
                      </p>
                      {getAddonSnapshots(b).map((addon) => {
                        const tone = getAddonStatusTone(addon.status);
                        const addonKey = `${b.id}-${addon.id}`;
                        const isApproved = addon.admin_approved === true;
                        const isApproving = approvingAddonId === addonKey;
                        return (
                          <div key={addonKey} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
                                <AddonIcon label={addon.label} size={16} color="rgba(197,164,109,0.5)" style={{ flexShrink: 0 }} />
                                <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: 0 }}>
                                  {addon.label}
                                </p>
                              </div>
                              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                                {formatAddonPrice(addon.price)}
                              </p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                                {/* Approval badge — green when approved, gold when pending */}
                                {addon.requires_approval && (
                                  isApproved ? (
                                    <span style={{
                                      fontFamily: LATO,
                                      fontSize: "9px",
                                      letterSpacing: "1.2px",
                                      textTransform: "uppercase",
                                      color: "#6fcf8a",
                                      backgroundColor: "rgba(80,180,100,0.15)",
                                      padding: "3px 7px",
                                      borderRadius: "2px",
                                    }}>
                                      Approved
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontFamily: LATO,
                                      fontSize: "9px",
                                      letterSpacing: "1.2px",
                                      textTransform: "uppercase",
                                      color: GOLD,
                                      backgroundColor: "rgba(197,164,109,0.14)",
                                      padding: "3px 7px",
                                      borderRadius: "2px",
                                    }}>
                                      Requires approval
                                    </span>
                                  )
                                )}
                                {/* Enforcement badges — unchanged */}
                                {addon.enforcement_mode === "soft" && (
                                  <span style={{
                                    fontFamily: LATO,
                                    fontSize: "9px",
                                    letterSpacing: "1.2px",
                                    textTransform: "uppercase",
                                    color: "#e2ab5a",
                                    backgroundColor: "rgba(226,171,90,0.15)",
                                    padding: "3px 7px",
                                    borderRadius: "2px",
                                  }}>
                                    Soft rule
                                  </span>
                                )}
                                {addon.enforcement_mode === "strict" && (
                                  <span style={{
                                    fontFamily: LATO,
                                    fontSize: "9px",
                                    letterSpacing: "1.2px",
                                    textTransform: "uppercase",
                                    color: "#e78f8f",
                                    backgroundColor: "rgba(224,112,112,0.14)",
                                    padding: "3px 7px",
                                    borderRadius: "2px",
                                  }}>
                                    Strict rule
                                  </span>
                                )}
                              </div>
                              {/* Mark as approved — hidden once approved, shows saving state */}
                              {addon.requires_approval && !isApproved && (
                                <button
                                  type="button"
                                  onClick={() => approveAddon(b.id, addon.id)}
                                  disabled={isApproving}
                                  style={{
                                    fontFamily: LATO,
                                    fontSize: "9px",
                                    letterSpacing: "1.2px",
                                    textTransform: "uppercase",
                                    color: "#6fcf8a",
                                    backgroundColor: "transparent",
                                    border: "0.5px solid rgba(111,207,138,0.45)",
                                    padding: "3px 8px",
                                    borderRadius: "2px",
                                    cursor: isApproving ? "not-allowed" : "pointer",
                                    opacity: isApproving ? 0.5 : 1,
                                    marginTop: "6px",
                                    display: "block",
                                  }}
                                >
                                  {isApproving ? "Saving…" : "Mark as approved"}
                                </button>
                              )}
                            </div>
                            <span style={{
                              fontFamily: LATO,
                              fontSize: "9px",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              color: tone.color,
                              backgroundColor: tone.backgroundColor,
                              padding: "3px 8px",
                              borderRadius: "2px",
                              whiteSpace: "nowrap",
                            }}>
                              {addon.status.replace("_", " ")}
                            </span>
                          </div>
                        );
                      })}
                      <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "2px 0 0", lineHeight: 1.5 }}>
                        Approvals are saved to the booking record.
                      </p>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    {isCancelled ? (
                      <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED }}>-</span>
                    ) : (
                      <>
                        {isPending && (
                          <button
                            onClick={() => updateStatus(b.id, "confirmed")}
                            disabled={isUpdating}
                            style={{
                              fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                              textTransform: "uppercase",
                              color: "#2E2E2E",
                              backgroundColor: isUpdating ? "rgba(80,180,100,0.5)" : "#6fcf8a",
                              border: "none",
                              padding: "10px 14px",
                              cursor: isUpdating ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Confirm
                          </button>
                        )}
                        {(isPending || isConfirmed) && (
                          <button
                            onClick={() => updateStatus(b.id, "cancelled")}
                            disabled={isUpdating}
                            style={{
                              fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                              textTransform: "uppercase",
                              color: WHITE,
                              backgroundColor: isUpdating ? "rgba(224,112,112,0.5)" : "#e07070",
                              border: "none",
                              padding: "10px 14px",
                              cursor: isUpdating ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Cancel
                          </button>
                        )}
                        {emailWarnings[b.id] && (
                          <span style={{ display: "block", width: "100%", fontFamily: LATO, fontSize: "10px", color: "#e0b070", lineHeight: 1.4 }}>
                            {emailWarnings[b.id]}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table style={{ width: "100%", minWidth: isMobile ? "760px" : "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
            <thead>
              <tr>
                {(isMobile
                  ? ["Guest / Member", "Villa", "Dates", "Message", "Status", "Actions"]
                  : ["Ref", "Guest / Member", "Contact", "Villa", "Check-in", "Check-out", "Sleeping", "Visitors", "Event", "Message", "Add-ons", "Status", "Submitted", "Actions"]
                ).map((h) => (
                  <th key={h} style={{ ...thStyle, textAlign: h === "Actions" ? "center" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => {
                const isGuest = !b.member_id;
                const isCancelled = b.status === "cancelled";
                const isConfirmed = b.status === "confirmed";
                const isPending = b.status === "pending";
                const isUpdating = updatingId === b.id;
                const memberInfo = !isGuest ? members.find((m) => m.id === b.member_id) : null;
                const displayName = isGuest ? (b.guest_name ?? "Guest") : (memberInfo?.full_name ?? "Member");
                const displayEmail = isGuest ? (b.guest_email ?? "-") : (memberInfo?.email ?? "-");
                const displayPhone = isGuest ? b.guest_phone : (memberInfo?.phone ?? null);
                const displayCountry = isGuest ? b.guest_country : (memberInfo?.country ?? null);
                const rowOpacity = isCancelled ? 0.72 : 1;
                const rowBackground = isPending ? "rgba(197,164,109,0.05)" : "transparent";

                return (
                  <tr
                    key={b.id}
                    style={{ opacity: rowOpacity, transition: "opacity 0.2s", backgroundColor: rowBackground }}
                    onMouseEnter={(e) => { if (!isCancelled) (e.currentTarget as HTMLElement).style.backgroundColor = isPending ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBackground; }}
                  >
                    {!isMobile && (
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: MUTED }}>
                        {b.id.slice(0, 8).toUpperCase()}
                      </td>
                    )}
                    <td style={tdStyle}>
                      <span style={{ color: isGuest ? "rgba(255,255,255,0.65)" : GOLD }}>
                        {displayName}
                      </span>
                      <span style={{ display: "block", fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: isGuest ? MUTED : GOLD, marginTop: "2px", opacity: isGuest ? 1 : 0.6 }}>
                        {isGuest ? "guest" : "member"}
                      </span>
                      {isMobile && (
                        <span style={{ display: "block", fontSize: "11px", marginTop: "4px", color: MUTED, lineHeight: 1.5 }}>
                          {displayEmail}
                        </span>
                      )}
                    </td>
                    {!isMobile && (
                      <td style={{ ...tdStyle, color: MUTED, fontSize: "12px" }}>
                        <span style={{ display: "block" }}>{displayEmail}</span>
                        {displayPhone && (
                          <span style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{displayPhone}</span>
                        )}
                        {displayCountry && (
                          <span style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{displayCountry}</span>
                        )}
                      </td>
                    )}
                    <td style={tdStyle}>{b.villa}</td>
                    {isMobile ? (
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={{ display: "block" }}>{fmt(b.check_in)}</span>
                        <span style={{ display: "block", fontSize: "11px", color: MUTED, marginTop: "4px" }}>
                          to {fmt(b.check_out)}
                        </span>
                      </td>
                    ) : (
                      <td style={tdStyle}>{fmt(b.check_in)}</td>
                    )}
                    {!isMobile && <td style={tdStyle}>{fmt(b.check_out)}</td>}
                    {!isMobile && <td style={{ ...tdStyle, textAlign: "center" }}>{b.sleeping_guests}</td>}
                    {!isMobile && <td style={{ ...tdStyle, textAlign: "center" }}>{b.day_visitors}</td>}
                    {!isMobile && <td style={{ ...tdStyle, color: MUTED }}>{b.event_type ?? "-"}</td>}
                    <td style={{ ...tdStyle, color: MUTED, fontSize: "12px", maxWidth: isMobile ? "180px" : "240px", whiteSpace: "normal", lineHeight: 1.5 }}>
                      {b.message?.trim() || "-"}
                    </td>
                    {!isMobile && (
                      <td style={{ ...tdStyle, color: MUTED, fontSize: "12px" }}>
                        {getAddonSnapshots(b).length > 0 ? (
                          <div style={{ display: "grid", gap: "6px" }}>
                            <span>{getAddonSnapshots(b).map((a) => a.label).join(", ")}</span>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {getAddonAttentionBadge(b)}
                              {getAddonApprovalBadge(b)}
                            </div>
                          </div>
                        ) : b.addons && b.addons.length > 0 ? (
                          b.addons.map((a) => a.label).join(", ")
                        ) : "-"}
                      </td>
                    )}
                    <td style={tdStyle}><StatusBadge status={b.status} /></td>
                    {!isMobile && (
                      <td style={{ ...tdStyle, color: MUTED, fontSize: "11px", whiteSpace: "nowrap" }}>{formatBeirutDateTime(b.created_at)}</td>
                    )}
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {isCancelled ? (
                        <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED }}>-</span>
                      ) : (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                          {isPending && (
                            <button
                              onClick={() => updateStatus(b.id, "confirmed")}
                              disabled={isUpdating}
                              style={{
                                fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                                textTransform: "uppercase",
                                color: "#2E2E2E",
                                backgroundColor: isUpdating ? "rgba(80,180,100,0.5)" : "#6fcf8a",
                                border: "none",
                                padding: "5px 12px",
                                cursor: isUpdating ? "not-allowed" : "pointer",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#50c472"; }}
                              onMouseLeave={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#6fcf8a"; }}
                            >
                              Confirm
                            </button>
                          )}
                          {(isPending || isConfirmed) && (
                            <button
                              onClick={() => updateStatus(b.id, "cancelled")}
                              disabled={isUpdating}
                              style={{
                                fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                                textTransform: "uppercase",
                                color: WHITE,
                                backgroundColor: isUpdating ? "rgba(224,112,112,0.5)" : "#e07070",
                                border: "none",
                                padding: "5px 12px",
                                cursor: isUpdating ? "not-allowed" : "pointer",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#c85a5a"; }}
                              onMouseLeave={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#e07070"; }}
                            >
                              Cancel
                            </button>
                          )}
                          {emailWarnings[b.id] && (
                            <span style={{ display: "block", width: "100%", fontFamily: LATO, fontSize: "10px", color: "#e0b070", marginTop: "4px", lineHeight: 1.4 }}>
                              {emailWarnings[b.id]}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
