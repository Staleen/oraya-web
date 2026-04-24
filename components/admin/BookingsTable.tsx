"use client";
import { formatBeirutDateTime } from "@/lib/format-date";
import type { Booking, Member } from "./types";
import { GOLD, WHITE, MIDNIGHT, MUTED, LATO, SURFACE, BORDER, thStyle, tdStyle, fieldStyle, fmt } from "./theme";

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
  return (
    <div>
      <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1rem", marginBottom: "1rem" }}>
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
              border: `0.5px solid ${BORDER}`, padding: "12px 18px", cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ overflowX: isMobile ? "visible" : "auto" }}>
        {loading ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading...</p>
        ) : filteredBookings.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No bookings match the current filters.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
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
                        {b.addons && b.addons.length > 0
                          ? b.addons.map((a) => a.label).join(", ")
                          : "-"}
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
