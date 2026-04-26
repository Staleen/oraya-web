"use client";
import { useEffect, useState } from "react";
import { formatBeirutRelative } from "@/lib/format-date";
import type { Booking, CalendarSource, Member } from "@/components/admin/types";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE, fmt } from "@/components/admin/theme";
import { KNOWN_VILLAS } from "@/lib/calendar/villas";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { AddonIcon } from "@/components/addon-icon";

const DESKTOP_DAY_WIDTH = 92;
const TIMELINE_DAYS = 90;
const TIMELINE_VISIBLE_LABEL = 30;
const MOBILE_LIST_DAYS = 30;
const VILLA_COLUMN_WIDTH = 170;
const BLOCK_HEIGHT = 46;
const BLOCK_GAP = 8;

interface ExternalCalendarBlock {
  id: string;
  villa: string;
  starts_on: string;
  ends_on: string;
  summary: string | null;
  is_active?: boolean;
}

type CalendarItem =
  | { type: "booking"; id: string; villa: string; starts_on: string; ends_on: string; status: string; booking: Booking }
  | { type: "external"; id: string; villa: string; starts_on: string; ends_on: string; status: "external"; summary: string | null };

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

function getBookingAddons(booking: Booking) {
  if (!booking.addons?.length) return "-";
  return booking.addons.map((addon) => addon.label).join(", ");
}

function getAddonStatusTone(status: NonNullable<Booking["addons_snapshot"]>[number]["status"]) {
  if (status === "confirmed" || status === "approved") {
    return { color: "#6fcf8a", background: "rgba(80,180,100,0.15)" };
  }
  if (status === "declined") {
    return { color: "#f08b8b", background: "rgba(224,112,112,0.14)" };
  }
  if (status === "at_risk") return { color: "#e2ab5a", background: "rgba(226,171,90,0.16)" };
  return { color: "#9db7d9", background: "rgba(157,183,217,0.14)" };
}

function getOperationalBadgeTone(kind: "approval" | "soft" | "strict") {
  if (kind === "strict") return { color: "#e78f8f", background: "rgba(224,112,112,0.14)" };
  if (kind === "soft") return { color: "#e2ab5a", background: "rgba(226,171,90,0.15)" };
  return { color: GOLD, background: "rgba(197,164,109,0.14)" };
}

function getAddonRiskWarning(addon: NonNullable<Booking["addons_snapshot"]>[number]) {
  if (addon.same_day_warning === "same_day_checkout") return "Same-day checkout risk";
  if (addon.same_day_warning === "same_day_checkin") return "Same-day check-in risk";
  return null;
}

function hasResolvedAddonStatus(addon: NonNullable<Booking["addons_snapshot"]>[number]) {
  return addon.status === "approved" || addon.status === "declined";
}

function addonNeedsAttention(addon: NonNullable<Booking["addons_snapshot"]>[number]) {
  if (hasResolvedAddonStatus(addon)) return false;
  return (
    addon.status === "pending_approval" ||
    addon.status === "at_risk" ||
    addon.same_day_warning === "same_day_checkout" ||
    addon.same_day_warning === "same_day_checkin"
  );
}

function formatAddonPrice(price: number | null) {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

function bookingNeedsAddonAttention(booking: Booking) {
  return (booking.addons_snapshot ?? []).some((addon) => addonNeedsAttention(addon));
}

function renderAddonOperationalBadges(booking: Booking, addon: NonNullable<Booking["addons_snapshot"]>[number]) {
  const badges = [];

  if (addon.requires_approval) {
    const tone = getOperationalBadgeTone("approval");
    badges.push(
      <span
        key={`${booking.id}-${addon.id}-approval`}
        style={{
          fontFamily: LATO,
          fontSize: "9px",
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: tone.color,
          backgroundColor: tone.background,
          padding: "3px 7px",
          borderRadius: "2px",
        }}
      >
        Requires approval
      </span>,
    );
  }

  if (addon.enforcement_mode === "soft") {
    const tone = getOperationalBadgeTone("soft");
    badges.push(
      <span
        key={`${booking.id}-${addon.id}-soft`}
        style={{
          fontFamily: LATO,
          fontSize: "9px",
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: tone.color,
          backgroundColor: tone.background,
          padding: "3px 7px",
          borderRadius: "2px",
        }}
      >
        Soft rule
      </span>,
    );
  }

  if (addon.enforcement_mode === "strict") {
    const tone = getOperationalBadgeTone("strict");
    badges.push(
      <span
        key={`${booking.id}-${addon.id}-strict`}
        style={{
          fontFamily: LATO,
          fontSize: "9px",
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: tone.color,
          backgroundColor: tone.background,
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

function formatSyncStatus(status: string | null) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "syncing") return "Syncing";
  return "Never run";
}

function getStatusTone(status: string) {
  if (status === "confirmed") return { color: "#6fcf8a", background: "rgba(80,180,100,0.14)" };
  if (status === "pending") return { color: "#d99644", background: "rgba(217,150,68,0.16)" };
  if (status === "external") return { color: "#9a9a9a", background: "rgba(255,255,255,0.08)" };
  return { color: MUTED, background: "rgba(255,255,255,0.04)" };
}

function itemOverlapsDay(item: CalendarItem, date: string) {
  return item.starts_on <= date && item.ends_on > date;
}

function getItemName(item: CalendarItem, members: Member[]) {
  if (item.type === "external") return item.summary?.trim() || "External block";
  return getBookingName(item.booking, members);
}

function getItemLabel(item: CalendarItem) {
  if (item.type === "external") return "External";
  return getBookingLabel(item.booking);
}

function getMobileStatusLabel(item: CalendarItem, members: Member[]) {
  if (item.type === "external") return "External";
  const name = getBookingName(item.booking, members);
  if (item.status === "pending") return `Pending (${name})`;
  return `Booked (${name})`;
}

function assignLanes(items: CalendarItem[]) {
  const laneEnds: string[] = [];
  return items
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.ends_on.localeCompare(b.ends_on))
    .map((item) => {
      let lane = laneEnds.findIndex((endsOn) => item.starts_on >= endsOn);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.ends_on;
      return { item, lane };
    });
}

export default function DashboardOperationsView({
  bookings,
  members,
  calendarSources,
  loading,
  externalBlocks = [],
}: {
  bookings: Booking[];
  members: Member[];
  calendarSources: CalendarSource[];
  loading: boolean;
  externalBlocks?: ExternalCalendarBlock[];
}) {
  const { setBookings } = useAdminData();
  const [isMobile, setIsMobile] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [approvingAddonId, setApprovingAddonId] = useState<string | null>(null);

  async function resolveAddon(bookingId: string, addonId: string, decision: "approve" | "decline") {
    const key = `${bookingId}-${addonId}-${decision}`;
    setApprovingAddonId(key);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/approve-addon`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_id: addonId, decision }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.addons_snapshot)) {
        // Update booking in global context so list views reflect persisted state.
        setBookings((prev) =>
          prev.map((b) => b.id === bookingId ? { ...b, addons_snapshot: d.addons_snapshot } : b)
        );
        // Also update the open modal's local booking reference.
        setSelectedBooking((prev) =>
          prev?.id === bookingId ? { ...prev, addons_snapshot: d.addons_snapshot } : prev
        );
      } else {
        console.error("[admin] resolve-addon failed:", d.error ?? "unknown error");
      }
    } catch (err) {
      console.error("[admin] resolve-addon network error:", err);
    } finally {
      setApprovingAddonId(null);
    }
  }

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth < 768);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const activeBookings = bookings.filter((booking) => booking.status !== "cancelled");
  const activeExternalBlocks = externalBlocks.filter((block) => block.is_active !== false);
  const calendarItems: CalendarItem[] = [
    ...activeBookings.map((booking) => ({
      type: "booking" as const,
      id: booking.id,
      villa: booking.villa,
      starts_on: booking.check_in,
      ends_on: booking.check_out,
      status: booking.status,
      booking,
    })),
    ...activeExternalBlocks.map((block) => ({
      type: "external" as const,
      id: block.id,
      villa: block.villa,
      starts_on: block.starts_on,
      ends_on: block.ends_on,
      status: "external" as const,
      summary: block.summary,
    })),
  ];
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

  const villaRows = Array.from(new Set([...KNOWN_VILLAS, ...calendarItems.map((item) => item.villa)])).sort();
  const startDate = startOfTodayUtcIso();
  const timelineDates = Array.from({ length: TIMELINE_DAYS }, (_, index) => toIsoDate(addUtcDays(startDate, index)));
  const mobileDates = timelineDates.slice(0, MOBILE_LIST_DAYS);
  const timelineEndExclusive = toIsoDate(addUtcDays(startDate, TIMELINE_DAYS));
  const dayWidth = DESKTOP_DAY_WIDTH;
  const timelineWidth = timelineDates.length * dayWidth;

  return (
    <>
      <section style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
              Master calendar
            </p>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
              Read-only operations calendar showing the next {isMobile ? MOBILE_LIST_DAYS : TIMELINE_VISIBLE_LABEL} days by default.
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
            {activeExternalBlocks.length > 0 && (
              <span style={{ fontFamily: LATO, fontSize: "11px", color: WHITE }}>
                <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#9a9a9a", marginRight: "6px", verticalAlign: "middle" }} />
                External
              </span>
            )}
          </div>
        </div>

        {activeExternalBlocks.length === 0 && (
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 1rem" }}>
            External calendar blocks are not shown here because the current admin data context does not include imported external block rows.
          </p>
        )}

        {loading ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>Loading...</p>
        ) : villaRows.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>No villas available for the master calendar.</p>
        ) : isMobile ? (
          <>
            <div style={{
              maxHeight: "480px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
            }}>
              <div style={{ display: "grid", gap: "8px", paddingBottom: "24px" }}>
                {mobileDates.map((date) => (
                  <div key={date} style={{ border: `0.5px solid ${BORDER}`, padding: "10px 12px", backgroundColor: "rgba(255,255,255,0.015)" }}>
                    <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                      {formatTimelineDayLabel(date)}
                    </p>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {villaRows.map((villa) => {
                        const dayItems = calendarItems
                          .filter((item) => item.villa === villa && itemOverlapsDay(item, date))
                          .sort((a, b) => a.status.localeCompare(b.status));

                        return (
                          <div key={`${date}-${villa}`} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 0.8fr) minmax(0, 1.2fr)", gap: "10px", alignItems: "start", paddingTop: "8px", borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
                            <p style={{ fontFamily: PLAYFAIR, fontSize: "13px", color: WHITE, margin: 0, lineHeight: 1.3 }}>
                              {villa.replace("Villa ", "")}
                            </p>
                            {dayItems.length === 0 ? (
                              <span style={{ fontFamily: LATO, fontSize: "11px", color: MUTED }}>
                                Available
                              </span>
                            ) : (
                              <div style={{ display: "grid", gap: "5px" }}>
                                {dayItems.map((item) => {
                                  const tone = getStatusTone(item.status);
                                  const content = (
                                    <span style={{
                                      display: "block",
                                      fontFamily: LATO,
                                      fontSize: "11px",
                                      color: item.type === "external" ? MUTED : WHITE,
                                      backgroundColor: tone.background,
                                      border: `0.5px solid ${tone.color}`,
                                      padding: "4px 7px",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}>
                                      {getMobileStatusLabel(item, members)}
                                    </span>
                                  );

                                  if (item.type === "booking") {
                                    return (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedBooking(item.booking)}
                                        style={{ appearance: "none", border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", width: "100%" }}
                                      >
                                        {content}
                                      </button>
                                    );
                                  }

                                  return <div key={item.id}>{content}</div>;
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, margin: "8px 0 0", textAlign: "center" }}>
              Scroll to view all 30 days
            </p>
          </>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "6px" }}>
            <div style={{ minWidth: `${VILLA_COLUMN_WIDTH + timelineWidth}px` }}>
              <div style={{ display: "flex", borderBottom: `0.5px solid ${BORDER}`, marginBottom: "12px" }}>
                <div style={{
                  width: `${VILLA_COLUMN_WIDTH}px`,
                  minWidth: `${VILLA_COLUMN_WIDTH}px`,
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
                  <div key={date} style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px`, paddingBottom: "14px", borderLeft: `0.5px solid rgba(255,255,255,0.03)` }}>
                      <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: MUTED, display: "block", textAlign: "center" }}>
                        {formatTimelineDayLabel(date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {villaRows.map((villa, rowIndex) => {
                const villaItems = calendarItems
                  .filter((item) => item.villa === villa && item.starts_on < timelineEndExclusive && item.ends_on > timelineDates[0]);
                const positionedItems = assignLanes(villaItems);
                const laneCount = positionedItems.reduce((max, positioned) => Math.max(max, positioned.lane + 1), 0);
                const rowHeight = Math.max(76, laneCount * (BLOCK_HEIGHT + BLOCK_GAP) + 20);

                return (
                  <div key={villa} style={{ display: "flex", marginBottom: rowIndex === villaRows.length - 1 ? 0 : "16px", borderTop: rowIndex === 0 ? "none" : "0.5px solid rgba(255,255,255,0.05)", paddingTop: rowIndex === 0 ? 0 : "16px" }}>
                    <div style={{
                      width: `${VILLA_COLUMN_WIDTH}px`,
                      minWidth: `${VILLA_COLUMN_WIDTH}px`,
                      padding: "14px 14px 0 0",
                      position: "sticky",
                      left: 0,
                      backgroundColor: SURFACE,
                      zIndex: 2,
                    }}>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", color: WHITE, margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {villa}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>
                        {villaItems.length} active range{villaItems.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div style={{
                      position: "relative",
                      width: `${timelineWidth}px`,
                      minWidth: `${timelineWidth}px`,
                      height: `${rowHeight}px`,
                      backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.04), rgba(255,255,255,0.04) 1px, transparent 1px, transparent ${dayWidth}px)`,
                      borderTop: `0.5px solid rgba(255,255,255,0.04)`,
                      borderBottom: `0.5px solid rgba(255,255,255,0.04)`,
                    }}>
                      {positionedItems.map(({ item, lane }) => {
                        const clampedStart = item.starts_on > timelineDates[0] ? item.starts_on : timelineDates[0];
                        const clampedEnd = item.ends_on < timelineEndExclusive ? item.ends_on : timelineEndExclusive;
                        const startOffset = Math.max(0, timelineDates.indexOf(clampedStart));
                        const endOffset = timelineDates.indexOf(clampedEnd);
                        const widthDays = Math.max(1, (endOffset === -1 ? timelineDates.length : endOffset) - startOffset);
                        const tone = getStatusTone(item.status);
                        const title = `${villa} | ${item.status} | ${getItemName(item, members)} | ${fmt(item.starts_on)} to ${fmt(item.ends_on)}`;
                        const content = (
                          <>
                            <p style={{
                              fontFamily: PLAYFAIR,
                              fontSize: "14px",
                              color: item.type === "external" ? "rgba(255,255,255,0.62)" : WHITE,
                              margin: "0 0 4px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {getItemName(item, members)}
                            </p>
                            <p style={{
                              fontFamily: LATO,
                              fontSize: "9px",
                              letterSpacing: "1.2px",
                              textTransform: "uppercase",
                              color: tone.color,
                              margin: 0,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {getItemLabel(item)}
                            </p>
                          </>
                        );

                        const blockStyle = {
                          position: "absolute" as const,
                          left: `${startOffset * dayWidth + 4}px`,
                          top: `${10 + lane * (BLOCK_HEIGHT + BLOCK_GAP)}px`,
                          width: `${Math.max(dayWidth - 8, widthDays * dayWidth - 8)}px`,
                          minWidth: `${Math.max(96, widthDays * dayWidth - 8)}px`,
                          height: `${BLOCK_HEIGHT}px`,
                          backgroundColor: tone.background,
                          border: `0.5px solid ${tone.color}`,
                          padding: "7px 10px",
                          boxSizing: "border-box" as const,
                          overflow: "hidden",
                        };

                        if (item.type === "booking") {
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedBooking(item.booking)}
                              title={title}
                              style={{ ...blockStyle, cursor: "pointer", textAlign: "left" }}
                            >
                              {content}
                            </button>
                          );
                        }

                        return (
                          <div
                            key={item.id}
                            title={title}
                            style={blockStyle}
                          >
                            {content}
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

      </section>

      {selectedBooking && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            backgroundColor: "rgba(10,14,18,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setSelectedBooking(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              backgroundColor: SURFACE,
              border: `0.5px solid ${BORDER}`,
              padding: isMobile ? "1rem" : "1.5rem",
              boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "1rem" }}>
              <div>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                  Booking details
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "1.5rem", color: WHITE, margin: 0 }}>
                  {getBookingName(selectedBooking, members)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                style={{ fontFamily: LATO, fontSize: "18px", color: MUTED, background: "transparent", border: "none", cursor: "pointer", lineHeight: 1 }}
                aria-label="Close booking details"
              >
                x
              </button>
            </div>

            {bookingNeedsAddonAttention(selectedBooking) && (
              <div style={{ border: "0.5px solid rgba(226,171,90,0.24)", backgroundColor: "rgba(226,171,90,0.08)", padding: "10px 12px", marginBottom: "1rem" }}>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.5 }}>
                  This booking has add-ons requiring attention.
                </p>
              </div>
            )}

            {[
              ["Villa", selectedBooking.villa],
              ["Check-in", fmt(selectedBooking.check_in)],
              ["Check-out", fmt(selectedBooking.check_out)],
              ["Status", selectedBooking.status],
              ["Type", getBookingLabel(selectedBooking)],
              ["Add-ons", getBookingAddons(selectedBooking)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "10px 0", borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0 }}>
                  {label}
                </span>
                <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, textAlign: "right", lineHeight: 1.5 }}>
                  {value}
                </span>
              </div>
            ))}

            {(selectedBooking.addons_snapshot ?? []).length > 0 && (
              <div style={{ padding: "10px 0", borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "10px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0 }}>
                    Add-on status
                  </span>
                  <div style={{ width: "100%", maxWidth: "280px", display: "grid", gap: "10px" }}>
                    {selectedBooking.addons_snapshot?.map((addon) => {
                      const tone = getAddonStatusTone(addon.status);
                      const isResolved = hasResolvedAddonStatus(addon);
                      const isPendingApproval = addon.requires_approval && addon.status === "pending_approval";
                      const isApproving = approvingAddonId === `${selectedBooking.id}-${addon.id}-approve`;
                      const isDeclining = approvingAddonId === `${selectedBooking.id}-${addon.id}-decline`;
                      const sameDayRiskWarning = getAddonRiskWarning(addon);
                      return (
                        <div key={`${selectedBooking.id}-${addon.id}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "7px", justifyContent: "flex-end", marginBottom: "4px" }}>
                              <AddonIcon label={addon.label} size={16} color="rgba(197,164,109,0.5)" style={{ flexShrink: 0 }} />
                              <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: 0, lineHeight: 1.5 }}>
                                {addon.label}
                              </p>
                            </div>
                            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.4 }}>
                              {formatAddonPrice(addon.price)}
                            </p>
                            <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                              {/* Approval badge — green when approved, gold when pending */}
                              {!isResolved && isPendingApproval && (
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
                            {sameDayRiskWarning && (
                              <p style={{
                                fontFamily: LATO,
                                fontSize: "10px",
                                color: "#e2ab5a",
                                margin: "6px 0 0",
                                lineHeight: 1.5,
                              }}>
                                {sameDayRiskWarning}
                              </p>
                            )}
                            {!isResolved && isPendingApproval && (
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                                <button
                                  type="button"
                                  onClick={() => resolveAddon(selectedBooking.id, addon.id, "approve")}
                                  disabled={isApproving || isDeclining}
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
                                    cursor: isApproving || isDeclining ? "not-allowed" : "pointer",
                                    opacity: isApproving || isDeclining ? 0.5 : 1,
                                  }}
                                >
                                  {isApproving ? "Saving..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resolveAddon(selectedBooking.id, addon.id, "decline")}
                                  disabled={isApproving || isDeclining}
                                  style={{
                                    fontFamily: LATO,
                                    fontSize: "9px",
                                    letterSpacing: "1.2px",
                                    textTransform: "uppercase",
                                    color: "#f08b8b",
                                    backgroundColor: "transparent",
                                    border: "0.5px solid rgba(224,112,112,0.4)",
                                    padding: "3px 8px",
                                    borderRadius: "2px",
                                    cursor: isApproving || isDeclining ? "not-allowed" : "pointer",
                                    opacity: isApproving || isDeclining ? 0.5 : 1,
                                  }}
                                >
                                  {isDeclining ? "Saving..." : "Decline"}
                                </button>
                              </div>
                            )}
                          </div>
                          <span style={{
                            fontFamily: LATO,
                            fontSize: "9px",
                            letterSpacing: "1.5px",
                            textTransform: "uppercase",
                            color: tone.color,
                            backgroundColor: tone.background,
                            padding: "3px 8px",
                            borderRadius: "2px",
                            whiteSpace: "nowrap",
                          }}>
                            {addon.status.replace("_", " ")}
                          </span>
                        </div>
                      );
                    })}
                    <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "4px 0 0", lineHeight: 1.5, textAlign: "right" }}>
                      Approvals are saved to the booking record.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
