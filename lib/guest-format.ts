// Relative .ts import so node:test can load this module (repo test convention).
import { parseLocalISO } from "./booking/calendar-validity.ts";

/**
 * Remediation 5.4 — shared guest-facing formatting helpers, reconciled from
 * the per-page copies in /book, /events/inquiry, /profile,
 * /booking/view/[token], and /booking-action/confirm.
 *
 * Reconciliation notes:
 * - fmtDate adopts the /profile variant (strips a time suffix before
 *   formatting) — byte-identical output for the date-only strings every other
 *   caller passes.
 * - friendlyError is intentionally NOT shared: /book and /events/inquiry use
 *   deliberately different guest copy.
 */

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export function nightCount(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round(
    (parseLocalISO(checkOut).getTime() - parseLocalISO(checkIn).getTime()) / 86_400_000
  ));
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
