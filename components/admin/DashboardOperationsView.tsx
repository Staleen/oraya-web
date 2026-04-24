"use client";
import { formatBeirutRelative } from "@/lib/format-date";
import type { VillaBasePricing } from "@/lib/admin-pricing";
import type { Booking, CalendarSource, Member } from "@/components/admin/types";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE, fmt } from "@/components/admin/theme";

const DAY_WIDTH = 92;
const TIMELINE_DAYS = 90;
const TIMELINE_VISIBLE_LABEL = 30;
const VILLA_COLUMN_WIDTH = 170;

function startOfTodayUtcIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

function getBookingLabel(booking: Booking) {
  return booking.member_id ? "Member" : "Guest";
}

function formatSyncStatus(status: string | null) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "syncing") return "Syncing";
  return "Never run";
}

function getStatusTone(status: string) {
  if (status === "confirmed") return { color: "#6fcf8a", background: "rgba(80,180,100,0.14)" };
  if (status === "pending") return { color: "#d99644", background: "rgba(217,150,68,0.16)" };
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
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
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
  const timelineDates = Array.from({ length: TIMELINE_DAYS }, (_, index) => toIsoDate(addUtcDays(startDate, index)));
  const timelineEndExclusive = toIsoDate(addUtcDays(startDate, TIMELINE_DAYS));
  const timelineWidth = timelineDates.length * DAY_WIDTH;

  return (
    <>
      <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
              Master calendar preview
            </p>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
              Read-only timeline showing the next {TIMELINE_VISIBLE_LABEL} days by default, with horizontal scroll for a longer planning horizon.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: LATO, fontSize: "11px", color: WHITE }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#6fcf8a", marginRight: "6px", verticalAlign: "middle" }} />
              Confirmed
            </span>
            <span style={{ fontFamily: LATO, fontSize: "11px", color: WHITE }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#d99644", marginRight: "6px", verticalAlign: "middle" }} />
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
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "6px" }}>
            <div style={{ minWidth: `${(isMobile ? 110 : VILLA_COLUMN_WIDTH) + timelineWidth}px` }}>
              <div style={{ display: "flex", borderBottom: `0.5px solid ${BORDER}`, marginBottom: "12px" }}>
                <div style={{
                  width: `${isMobile ? 110 : VILLA_COLUMN_WIDTH}px`,
                  minWidth: `${isMobile ? 110 : VILLA_COLUMN_WIDTH}px`,
                  padding: "0 14px 14px 0",
                  position: "sticky",
                  left: 0,
                  backgroundColor: SURFACE,
                  zIndex: 3,
                }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD }}>
                    Villa
                  </span>
                </div>
                <div style={{ display: "flex", width: `${timelineWidth}px` }}>
                  {timelineDates.map((date) => (
                  <div key={date} style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px`, paddingBottom: "14px", borderLeft: `0.5px solid rgba(255,255,255,0.03)` }}>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: MUTED, display: "block", textAlign: "center" }}>
                        {formatTimelineDayLabel(date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {villaRows.map((villa, rowIndex) => {
                const villaBookings = activeBookings
                  .filter((booking) => booking.villa === villa && booking.check_in < timelineEndExclusive && booking.check_out > timelineDates[0])
                  .sort((a, b) => a.check_in.localeCompare(b.check_in));

                return (
                  <div key={villa} style={{ display: "flex", marginBottom: rowIndex === villaRows.length - 1 ? 0 : "12px" }}>
                    <div style={{
                      width: `${isMobile ? 110 : VILLA_COLUMN_WIDTH}px`,
                      minWidth: `${isMobile ? 110 : VILLA_COLUMN_WIDTH}px`,
                      padding: "14px 14px 0 0",
                      position: "sticky",
                      left: 0,
                      backgroundColor: SURFACE,
                      zIndex: 2,
                    }}>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "15px" : "18px", color: WHITE, margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {villa}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                        {villaBookings.length} active range{villaBookings.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div style={{
                      position: "relative",
                      width: `${timelineWidth}px`,
                      minWidth: `${timelineWidth}px`,
                      height: isMobile ? "68px" : "76px",
                      backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.04), rgba(255,255,255,0.04) 1px, transparent 1px, transparent ${DAY_WIDTH}px)`,
                      borderTop: `0.5px solid rgba(255,255,255,0.04)`,
                      borderBottom: `0.5px solid rgba(255,255,255,0.04)`,
                    }}>
                      {villaBookings.map((booking) => {
                        const clampedStart = booking.check_in > timelineDates[0] ? booking.check_in : timelineDates[0];
                        const clampedEnd = booking.check_out < timelineEndExclusive ? booking.check_out : timelineEndExclusive;
                        const startOffset = Math.max(0, timelineDates.indexOf(clampedStart));
                        const endOffset = timelineDates.indexOf(clampedEnd);
                        const widthDays = Math.max(1, (endOffset === -1 ? timelineDates.length : endOffset) - startOffset);
                        const tone = getStatusTone(booking.status);
                        const title = `${villa} | ${booking.status} | ${getBookingName(booking, members)} | ${fmt(booking.check_in)} to ${fmt(booking.check_out)}`;

                        return (
                          <div
                            key={booking.id}
                            title={title}
                            style={{
                              position: "absolute",
                              left: `${startOffset * DAY_WIDTH + 4}px`,
                              top: isMobile ? "8px" : "10px",
                              width: `${widthDays * DAY_WIDTH - 8}px`,
                              minWidth: `${Math.max(84, widthDays * DAY_WIDTH - 8)}px`,
                              height: isMobile ? "50px" : "56px",
                              backgroundColor: tone.background,
                              border: `0.5px solid ${tone.color}`,
                              padding: "8px 10px",
                              boxSizing: "border-box",
                              overflow: "hidden",
                            }}
                          >
                            <p style={{
                              fontFamily: PLAYFAIR,
                              fontSize: isMobile ? "13px" : "15px",
                              color: WHITE,
                              margin: "0 0 4px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {getBookingName(booking, members)}
                            </p>
                            <p style={{
                              fontFamily: LATO,
                              fontSize: "10px",
                              letterSpacing: "1.2px",
                              textTransform: "uppercase",
                              color: tone.color,
                              margin: 0,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {getBookingLabel(booking)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: "16px", marginBottom: "2rem" }}>
        <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem" }}>
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

        <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem" }}>
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
                      color: "#d99644",
                      backgroundColor: "rgba(217,150,68,0.16)",
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

      <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem", marginBottom: "2rem" }}>
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
          <p style={{ fontFamily: LATO, fontSize: "13px", color: "#6fcf8a", margin: "0 0 1rem" }}>
            All configured sources are currently reporting healthy sync status.
          </p>
        ) : (
          <div style={{ marginBottom: "1rem" }}>
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

        <div style={{ borderTop: `0.5px solid ${BORDER}`, paddingTop: "1rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
              Base rates
            </p>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
              Read-only nightly pricing snapshot from the manual pricing foundation.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
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
        </div>
      </section>
    </>
  );
}
