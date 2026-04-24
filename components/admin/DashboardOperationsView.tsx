"use client";
import { formatBeirutRelative } from "@/lib/format-date";
import type { VillaBasePricing } from "@/lib/admin-pricing";
import type { Booking, CalendarSource, Member } from "@/components/admin/types";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE, fmt } from "@/components/admin/theme";

function startOfTodayUtcIso() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimelineDayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
}

function getBookingName(booking: Booking, members: Member[]) {
  if (!booking.member_id) return booking.guest_name ?? "Guest";
  return members.find((member) => member.id === booking.member_id)?.full_name ?? "Member";
}

function getBookingEmail(booking: Booking, members: Member[]) {
  if (!booking.member_id) return booking.guest_email ?? "-";
  return members.find((member) => member.id === booking.member_id)?.email ?? "-";
}

function formatSyncStatus(status: string | null) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "syncing") return "Syncing";
  return "Never run";
}

function getStatusTone(status: string) {
  if (status === "confirmed") return { color: "#6fcf8a", background: "rgba(80,180,100,0.14)" };
  if (status === "pending") return { color: GOLD, background: "rgba(197,164,109,0.14)" };
  return { color: MUTED, background: "rgba(255,255,255,0.04)" };
}

export default function DashboardOperationsView({
  bookings,
  members,
  calendarSources,
  villaPricing,
  loading,
}: {
  bookings: Booking[];
  members: Member[];
  calendarSources: CalendarSource[];
  villaPricing: VillaBasePricing[];
  loading: boolean;
}) {
  const activeBookings = bookings.filter((booking) => booking.status !== "cancelled");
  const recentBookings = [...activeBookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const pendingBookings = [...bookings]
    .filter((booking) => booking.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 6);

  const syncSuccessCount = calendarSources.filter((source) => source.last_sync_status === "success").length;
  const syncFailureCount = calendarSources.filter((source) => source.last_sync_status === "failed").length;
  const staleSources = calendarSources
    .filter((source) => source.last_sync_status !== "success" || !!source.last_error?.trim())
    .slice(0, 4);

  const villaRows = Array.from(new Set(activeBookings.map((booking) => booking.villa))).sort();
  const startDate = startOfTodayUtcIso();
  const timelineDates = Array.from({ length: 30 }, (_, index) => toIsoDate(addUtcDays(startDate, index)));

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: "16px", marginBottom: "2rem" }}>
        <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "1rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                Recent bookings
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
                Latest guest and member activity across both villas.
              </p>
            </div>
          </div>
          {loading ? (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
          ) : recentBookings.length === 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>No bookings to show yet.</p>
          ) : (
            <div>
              {recentBookings.map((booking, index) => {
                const tone = getStatusTone(booking.status);
                return (
                  <div
                    key={booking.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "12px",
                      padding: "14px 0",
                      borderTop: index === 0 ? "none" : `0.5px solid rgba(255,255,255,0.04)`,
                    }}
                  >
                    <div>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", color: WHITE, margin: "0 0 6px" }}>
                        {getBookingName(booking, members)}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 6px" }}>
                        {booking.villa} | {fmt(booking.check_in)} to {fmt(booking.check_out)}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                        {getBookingEmail(booking, members)} | {booking.sleeping_guests} sleeping
                        {booking.day_visitors > 0 ? ` | ${booking.day_visitors} visitors` : ""}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        display: "inline-block",
                        fontFamily: LATO,
                        fontSize: "10px",
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        color: tone.color,
                        backgroundColor: tone.background,
                        padding: "4px 10px",
                        borderRadius: "2px",
                      }}>
                        {booking.status}
                      </span>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "10px 0 0" }}>
                        {formatBeirutRelative(booking.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
            Pending approvals
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 1rem" }}>
            Oldest pending requests first so operations can clear the queue quickly.
          </p>
          {loading ? (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
          ) : pendingBookings.length === 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>No pending approvals right now.</p>
          ) : (
            <div>
              {pendingBookings.map((booking, index) => (
                <div
                  key={booking.id}
                  style={{
                    padding: "12px 0",
                    borderTop: index === 0 ? "none" : `0.5px solid rgba(255,255,255,0.04)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                    <p style={{ fontFamily: PLAYFAIR, fontSize: "17px", color: WHITE, margin: 0 }}>
                      {getBookingName(booking, members)}
                    </p>
                    <span style={{
                      fontFamily: LATO,
                      fontSize: "10px",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: GOLD,
                      backgroundColor: "rgba(197,164,109,0.14)",
                      padding: "4px 10px",
                      borderRadius: "2px",
                    }}>
                      pending
                    </span>
                  </div>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 4px" }}>
                    {booking.villa} | {fmt(booking.check_in)} to {fmt(booking.check_out)}
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                    Submitted {formatBeirutRelative(booking.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
              Calendar sync health
            </p>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
              Read-only snapshot of current source health from the existing admin sync data.
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              { label: "Sources", value: calendarSources.length },
              { label: "Healthy", value: syncSuccessCount },
              { label: "Failed", value: syncFailureCount },
            ].map((item) => (
              <div key={item.label} style={{ minWidth: "92px", border: `0.5px solid ${BORDER}`, padding: "12px 14px" }}>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 6px" }}>
                  {item.label}
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "1.5rem", color: GOLD, margin: 0, lineHeight: 1 }}>
                  {loading ? "-" : item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
        {loading ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
        ) : calendarSources.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>No calendar sources configured yet.</p>
        ) : staleSources.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: "#6fcf8a", margin: 0 }}>
            All configured sources are currently reporting healthy sync status.
          </p>
        ) : (
          <div>
            {staleSources.map((source, index) => (
              <div key={source.id} style={{ padding: "12px 0", borderTop: index === 0 ? "none" : `0.5px solid rgba(255,255,255,0.04)` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <p style={{ fontFamily: PLAYFAIR, fontSize: "17px", color: WHITE, margin: 0 }}>
                    {source.villa} - {source.source_name}
                  </p>
                  <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: source.last_sync_status === "failed" ? "#e07070" : GOLD }}>
                    {formatSyncStatus(source.last_sync_status)}
                  </span>
                </div>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "6px 0 0" }}>
                  {source.last_synced_at ? formatBeirutRelative(source.last_synced_at) : "Never run"}
                </p>
                {source.last_error?.trim() && (
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e0b070", margin: "6px 0 0" }}>
                    {source.last_error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
            Base rates
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
            Read-only nightly pricing snapshot from the manual pricing foundation.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          {villaPricing.map((item) => (
            <div key={item.villa} style={{ border: `0.5px solid ${BORDER}`, padding: "14px 16px" }}>
              <p style={{ fontFamily: PLAYFAIR, fontSize: "1.2rem", color: WHITE, margin: "0 0 10px" }}>
                {item.villa}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 4px" }}>
                Base rate: {item.base_price ?? "-"}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 4px" }}>
                Weekend: {item.weekend_price ?? "-"}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 4px" }}>
                Weekday override: {item.weekday_price ?? "-"}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
                Minimum stay: {item.minimum_stay ?? "-"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
              Master calendar preview
            </p>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
              Read-only 30-day villa timeline. Confirmed stays are blocked and pending requests are highlighted for review.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: LATO, fontSize: "11px", color: WHITE }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#6fcf8a", marginRight: "6px", verticalAlign: "middle" }} />
              Confirmed
            </span>
            <span style={{ fontFamily: LATO, fontSize: "11px", color: WHITE }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: GOLD, marginRight: "6px", verticalAlign: "middle" }} />
              Pending
            </span>
          </div>
        </div>

        <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 1rem" }}>
          External calendar blocks are not shown here because the current admin data context does not include imported external block rows.
        </p>

        {loading ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
        ) : villaRows.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>No active bookings available for the timeline preview.</p>
        ) : (
          <div style={{ overflowX: "auto", paddingBottom: "6px" }}>
            <table style={{ borderCollapse: "collapse", minWidth: "1100px", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, padding: "0 14px 14px 0", textAlign: "left", position: "sticky", left: 0, backgroundColor: SURFACE, zIndex: 2 }}>
                    Villa
                  </th>
                  {timelineDates.map((date) => (
                    <th key={date} style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: MUTED, padding: "0 0 14px", minWidth: "32px" }}>
                      {formatTimelineDayLabel(date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {villaRows.map((villa) => {
                  const villaBookings = activeBookings.filter((booking) => booking.villa === villa);
                  return (
                    <tr key={villa}>
                      <td style={{ fontFamily: PLAYFAIR, fontSize: "18px", color: WHITE, padding: "0 14px 0 0", whiteSpace: "nowrap", position: "sticky", left: 0, backgroundColor: SURFACE, zIndex: 1 }}>
                        {villa}
                      </td>
                      {timelineDates.map((date) => {
                        const activeRange = villaBookings.find((booking) => date >= booking.check_in && date < booking.check_out);
                        const status = activeRange?.status;
                        const backgroundColor = status === "confirmed"
                          ? "#6fcf8a"
                          : status === "pending"
                            ? GOLD
                            : "transparent";
                        const borderColor = status
                          ? "transparent"
                          : "rgba(255,255,255,0.05)";
                        const title = activeRange
                          ? `${villa} | ${status} | ${fmt(activeRange.check_in)} to ${fmt(activeRange.check_out)}`
                          : `${villa} | available`;

                        return (
                          <td key={`${villa}-${date}`} title={title} style={{ padding: "0 0 10px" }}>
                            <div
                              style={{
                                width: "100%",
                                minWidth: "32px",
                                height: "28px",
                                backgroundColor,
                                border: `0.5px solid ${borderColor}`,
                                opacity: status === "pending" ? 0.9 : 1,
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
