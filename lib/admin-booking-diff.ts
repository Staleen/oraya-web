/**
 * Compare two booking snapshots from admin /api/admin/data for toast messaging.
 * Phase 15 — UI only; does not alter bookings.
 */

import type { Booking } from "@/components/admin/types";

function lite(b: Booking): string {
  return JSON.stringify({
    id: b.id,
    status: (b.status || "").toLowerCase(),
    payment_stage: b.payment_stage ?? null,
    payment_status: b.payment_status ?? null,
    amount_due: b.amount_due ?? null,
    villa: b.villa,
    check_in: b.check_in,
    check_out: b.check_out,
  });
}

/** Returns a single guest-facing toast line, or null if nothing meaningful changed. */
export function diffBookingsForToast(prev: Booking[], next: Booking[]): string | null {
  const pm = new Map(prev.map((b) => [b.id, b]));
  const nm = new Map(next.map((b) => [b.id, b]));

  let inserted = 0;
  let deleted = 0;
  for (const id of Array.from(nm.keys())) {
    if (!pm.has(id)) inserted += 1;
  }
  for (const id of Array.from(pm.keys())) {
    if (!nm.has(id)) deleted += 1;
  }

  if (inserted > 0 && deleted === 0) return "New booking request received";
  if (deleted > 0 && inserted === 0) return "Booking cancelled";
  if (deleted > 0 || inserted > 0) return "Booking updated";

  for (const [id, nb] of Array.from(nm.entries())) {
    const ob = pm.get(id);
    if (!ob) continue;
    const os = (ob.status || "").toLowerCase();
    const ns = (nb.status || "").toLowerCase();
    if (os !== ns) {
      if (ns === "confirmed") return "Booking confirmed";
      if (ns === "cancelled") return "Booking cancelled";
      return "Booking updated";
    }
    if (lite(ob) !== lite(nb)) return "Booking updated";
  }

  return null;
}
