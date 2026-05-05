/**
 * Phase 15I.5 — heated pool strict timing may be waived when the pool was already
 * prepared for the immediately preceding confirmed stay (same villa, ≤24h gap).
 */

export const HEATED_POOL_ADDON_PRIMARY_ID = "heated_pool";

/** User-facing copy (also referenced from /book when carryover applies). */
export const HEATED_POOL_CARRYOVER_GUEST_NOTE =
  "Heated pool may be available because the pool is already prepared from the previous booking.";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Stable id first; label fallback is narrow (exact “heated pool” only). */
export function isHeatedPoolAddon(entry: { id: string; label?: string | null }): boolean {
  if (entry.id === HEATED_POOL_ADDON_PRIMARY_ID) return true;
  const label = typeof entry.label === "string" ? entry.label.trim().toLowerCase() : "";
  return label === "heated pool";
}

function parseUtcMidnight(isoDate: string): number | null {
  const m = ISO_DATE_RE.exec(isoDate);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return t;
}

/**
 * Hours between prior checkout calendar day and new check-in calendar day (UTC date-only).
 * Same day → 0; consecutive days → 24.
 */
export function hoursBetweenPrevCheckoutAndNewCheckIn(
  prevCheckOut: string,
  newCheckIn: string,
): number | null {
  const a = parseUtcMidnight(prevCheckOut);
  const b = parseUtcMidnight(newCheckIn);
  if (a === null || b === null) return null;
  return (b - a) / 3_600_000;
}

/** Inclusive upper bound aligned with “≤ 24 hours” on date-only boundaries. */
export const HEATED_POOL_CARRYOVER_MAX_HOURS = 24;

export function addonsSnapshotIncludesHeatedPool(snapshot: unknown): boolean {
  if (!Array.isArray(snapshot)) return false;
  for (const raw of snapshot) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { id?: unknown; label?: unknown; status?: unknown };
    if (row.status === "declined") continue;
    const id = row.id;
    const label = row.label;
    if (typeof id !== "string") continue;
    if (!isHeatedPoolAddon({ id, label: typeof label === "string" ? label : null })) continue;
    return true;
  }
  return false;
}

export function heatedPoolCarryoverFromPriorBooking(params: {
  newCheckIn: string;
  priorCheckOut: string;
  priorAddonsSnapshot: unknown;
}): boolean {
  const hours = hoursBetweenPrevCheckoutAndNewCheckIn(params.priorCheckOut, params.newCheckIn);
  if (hours === null || hours < 0) return false;
  if (hours > HEATED_POOL_CARRYOVER_MAX_HOURS) return false;
  return addonsSnapshotIncludesHeatedPool(params.priorAddonsSnapshot);
}
