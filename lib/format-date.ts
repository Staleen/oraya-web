/**
 * Date/time formatting helpers for Oraya admin surfaces.
 *
 * Oraya properties are in Lebanon. Business timezone = Asia/Beirut.
 * Supabase stores timestamps as UTC; Vercel runs in UTC. Any admin-facing
 * timestamp must therefore be explicitly converted to Beirut time — never
 * rely on `new Date().getHours()` etc., which use the runtime's local zone.
 *
 * Stay dates (check_in / check_out) are pure calendar dates and are NOT
 * handled here — parse them by string split in the caller so they never
 * shift across a timezone boundary.
 */

const BEIRUT_TZ = "Asia/Beirut";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BEIRUT_TZ,
  day:      "numeric",
  month:    "short",
  year:     "numeric",
  hour:     "2-digit",
  minute:   "2-digit",
  hour12:   false,
});

const timeOnlyFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BEIRUT_TZ,
  hour:     "2-digit",
  minute:   "2-digit",
  hour12:   false,
});

/**
 * Full admin timestamp in Beirut tz, 24-hour, with "(Beirut)" label.
 * Example: "1 Jan 2026, 14:30 (Beirut)"
 */
export function formatBeirutDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  return `${dateTimeFmt.format(dt)} (Beirut)`;
}

/**
 * Short Beirut time + relative suffix, for the calendar sync "Last sync" cell.
 * Example: "06:02 (Beirut) — 3 min ago"
 */
export function formatBeirutRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";

  const time = timeOnlyFmt.format(dt);

  const diffSec = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 1000));
  let rel: string;
  if (diffSec < 45)         rel = "just now";
  else if (diffSec < 3600)  rel = `${Math.round(diffSec / 60)} min ago`;
  else if (diffSec < 86400) rel = `${Math.round(diffSec / 3600)} hr ago`;
  else                      rel = `${Math.round(diffSec / 86400)} d ago`;

  return `${time} (Beirut) — ${rel}`;
}
