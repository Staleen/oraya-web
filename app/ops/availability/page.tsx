"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { addDaysToDateOnly, getOperationalRange } from "@/lib/calendar/event-block";
import { formatBookingRef, type QueueBooking } from "@/lib/ops-queue";
import { useOps, type CalendarSource, type ExternalBlock } from "@/components/ops/OpsProvider";
import { Badge, EmptyState, Kicker, PageHead, T, type Tone } from "@/components/ops/ui";

/**
 * Read-only availability: what is taken, by whom, and whether the external
 * feeds keeping it honest are actually alive.
 *
 * Feed freshness is first-class here (the C-5 lesson): the real sync runs
 * every 10 minutes via cron-job.org, so a feed that hasn't succeeded for an
 * hour is limping and one silent for a day is dead — and a dead feed means
 * this calendar silently stops knowing about Airbnb bookings.
 *
 * Manual blocking / feed editing belongs to the calendar-source CRUD task
 * (G13), not this screen.
 */

const VILLAS = ["Villa Mechmech", "Villa Byblos"] as const;
const MONTHS_AHEAD = 3;
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type DayState =
  | { kind: "free" }
  | { kind: "stay"; ref: string; guest: string; bookingId: string; isEvent: boolean }
  | { kind: "external"; label: string };

/** Today in Asia/Beirut as YYYY-MM-DD, without parsing any stay date. */
function todayBeirut(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return parts; // en-CA gives YYYY-MM-DD
}

function isEventBooking(b: QueueBooking): boolean {
  return Boolean(b.event_type && typeof b.message === "string" && b.message.includes("[Event Inquiry]"));
}

/** Occupancy per day for one villa. Pure; date-only string arithmetic. */
function buildOccupancy(
  villa: string,
  bookings: QueueBooking[],
  blocks: ExternalBlock[],
): Map<string, DayState> {
  const days = new Map<string, DayState>();

  const paint = (from: string, toExclusive: string, state: DayState) => {
    let d = from;
    let guard = 0;
    while (d < toExclusive && guard < 400) {
      // Stays win over external blocks (an external block usually IS the
      // exported copy of the same stay).
      if (state.kind === "stay" || !days.has(d)) days.set(d, state);
      d = addDaysToDateOnly(d, 1);
      guard += 1;
    }
  };

  for (const block of blocks) {
    if (block.villa !== villa) continue;
    if (!block.starts_on || !block.ends_on) continue;
    paint(block.starts_on, block.ends_on, {
      kind: "external",
      label: block.summary?.trim() || "External calendar",
    });
  }

  for (const b of bookings) {
    if (b.villa !== villa) continue;
    if ((b.status ?? "").toLowerCase() !== "confirmed") continue;
    if (!b.check_in || !b.check_out) continue;
    const isEvent = isEventBooking(b);
    const range = getOperationalRange({
      check_in: b.check_in.slice(0, 10),
      check_out: b.check_out.slice(0, 10),
      event_type: b.event_type,
      message: b.message,
    });
    paint(range.check_in, range.check_out, {
      kind: "stay",
      ref: formatBookingRef(b.id),
      guest: b.guest_name ?? "Guest",
      bookingId: b.id,
      isEvent,
    });
  }

  return days;
}

function freshness(source: CalendarSource): { tone: Tone; label: string } {
  if (!source.is_enabled) return { tone: "neutral", label: "Disabled" };
  if (!source.last_synced_at) return { tone: "bad", label: "Never synced" };
  const ageMin = Math.floor((Date.now() - Date.parse(source.last_synced_at)) / 60_000);
  // sync.ts writes exactly "success" / "failed".
  const failed = (source.last_sync_status ?? "").toLowerCase() === "failed";
  if (failed) return { tone: "bad", label: `Failing — last error: ${String(source.last_error).slice(0, 60)}` };
  if (ageMin >= 24 * 60) return { tone: "bad", label: `Silent for ${Math.floor(ageMin / 60 / 24)} day(s) — treat as dead` };
  if (ageMin >= 60) return { tone: "warn", label: `Last success ${Math.floor(ageMin / 60)}h ago — should be every 10 min` };
  return { tone: "ok", label: ageMin <= 1 ? "Fresh — synced just now" : `Fresh — synced ${ageMin} min ago` };
}

export default function AvailabilityPage() {
  const { bookings, calendarSources, externalBlocks, loading, loadError, refresh } = useOps();
  const router = useRouter();

  const today = todayBeirut();

  const months = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    return Array.from({ length: MONTHS_AHEAD }, (_, i) => {
      const total = (m - 1) + i;
      const year = y + Math.floor(total / 12);
      const month = (total % 12) + 1;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
      return { year, month, daysInMonth, firstDow };
    });
  }, [today]);

  const occupancy = useMemo(() => {
    const map = new Map<string, Map<string, DayState>>();
    for (const villa of VILLAS) map.set(villa, buildOccupancy(villa, bookings, externalBlocks));
    return map;
  }, [bookings, externalBlocks]);

  if (loadError && bookings.length === 0) {
    return (
      <>
        <PageHead title="Availability" sub="What is taken, and whether the feeds are alive" />
        <EmptyState reason="load-failed" message="We couldn't load availability, so nothing here is to be trusted." onRetry={() => void refresh()} />
      </>
    );
  }

  return (
    <>
      <PageHead title="Availability" sub="What is taken, and whether the feeds keeping it honest are alive" />

      <div style={{ marginBottom: "30px" }}>
        <Kicker count={calendarSources.length}>Calendar feeds</Kicker>
        {calendarSources.length === 0 ? (
          <p style={{ fontSize: "13px", color: T.faint, margin: 0 }}>
            {loading ? "Loading…" : "No external calendar feeds are configured."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {calendarSources.map((s) => {
              const f = freshness(s);
              return (
                <div key={s.id} style={{
                  background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.r,
                  padding: "12px 16px", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: "min(100%,220px)", fontSize: "14px" }}>
                    <b>{s.source_name ?? "Feed"}</b>
                    <span style={{ color: T.muted }}> · {s.villa ?? "—"}</span>
                  </div>
                  <Badge tone={f.tone}>{f.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ fontSize: "12px", color: T.faint, margin: "10px 0 0" }}>
          Changing or adding feeds isn&apos;t possible here yet — it needs the calendar-source task still in the plan.
        </p>
      </div>

      {VILLAS.map((villa) => {
        const days = occupancy.get(villa)!;
        return (
          <div key={villa} style={{ marginBottom: "34px" }}>
            <Kicker>{villa}</Kicker>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "16px" }}>
              {months.map(({ year, month, daysInMonth, firstDow }) => (
                <div key={`${year}-${month}`} style={{
                  background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.r, padding: "14px 16px",
                }}>
                  <p style={{ fontSize: "13px", margin: "0 0 10px", color: T.ink2 }}>
                    <b>{MONTH_NAMES[month - 1]} {year}</b>
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" }}>
                    {DOW.map((d) => (
                      <div key={d} style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: T.faint, textAlign: "center", paddingBottom: "4px" }}>
                        {d}
                      </div>
                    ))}
                    {Array.from({ length: firstDow }, (_, i) => <div key={`pad-${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const date = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                      const state = days.get(date) ?? { kind: "free" as const };
                      const isPast = date < today;
                      const isToday = date === today;
                      const bg =
                        state.kind === "stay" ? (state.isEvent ? "rgba(126,207,207,.30)" : "rgba(197,164,109,.42)")
                        : state.kind === "external" ? "rgba(255,255,255,.14)"
                        : "transparent";
                      const title =
                        state.kind === "stay" ? `${state.guest} · ${state.ref}${state.isEvent ? " · event (incl. setup day)" : ""}`
                        : state.kind === "external" ? state.label
                        : "Free";
                      const cell = (
                        <div
                          title={`${date} — ${title}`}
                          style={{
                            fontSize: "11px", textAlign: "center", padding: "6px 0", borderRadius: "5px",
                            background: bg, opacity: isPast ? 0.35 : 1,
                            border: isToday ? `1px solid ${T.gold}` : "1px solid transparent",
                            color: state.kind === "free" ? T.faint : T.ink,
                            cursor: state.kind === "stay" ? "pointer" : "default",
                          }}
                        >
                          {i + 1}
                        </div>
                      );
                      return state.kind === "stay" ? (
                        <div key={date} onClick={() => router.push(`/ops/bookings/${state.bookingId}`)}>{cell}</div>
                      ) : (
                        <div key={date}>{cell}</div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "12px", color: T.muted }}>
        <span><span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "3px", background: "rgba(197,164,109,.42)", marginRight: "6px", verticalAlign: "-1px" }} />Confirmed stay (tap to open)</span>
        <span><span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "3px", background: "rgba(126,207,207,.30)", marginRight: "6px", verticalAlign: "-1px" }} />Event, incl. its setup day</span>
        <span><span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "3px", background: "rgba(255,255,255,.14)", marginRight: "6px", verticalAlign: "-1px" }} />Blocked by an external calendar</span>
      </div>
    </>
  );
}
