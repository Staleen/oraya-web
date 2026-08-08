/**
 * Business numbers for the owner screen.
 *
 * Pure and unit-tested. Two rules learned from the legacy dashboard:
 *
 * 1. Audit D-8 — the old analytics mixed populations: savings and add-on
 *    stats counted cancelled bookings while revenue excluded them. Here every
 *    metric states its population and CANCELLED IS ALWAYS EXCLUDED.
 * 2. Revenue means money actually RECORDED (`amount_paid`), never an estimate.
 *    Estimates are reported separately as "expected", clearly labelled.
 */

import type { QueueBooking, QueueLead } from "./ops-queue.ts";
import { bookingMoneyView } from "./ops-booking-display.ts";

export interface BusinessSummary {
  /** Money recorded as received, cancelled bookings excluded. */
  revenue_received: number;
  /** Contract value of confirmed stays not yet fully paid (estimate-aware). */
  revenue_expected: number;
  /** Money received on cancelled bookings that has not been returned. */
  refunds_owed: number;
  confirmed_count: number;
  pending_count: number;
  cancelled_count: number;
  /** Nights sold per villa within the window, confirmed only. */
  nights_by_villa: Record<string, number>;
  occupancy_pct_by_villa: Record<string, number>;
  /** Add-on label → times approved/confirmed on non-cancelled bookings. */
  addon_uptake: Array<{ label: string; count: number; revenue: number }>;
  leads_total: number;
  leads_converted: number;
  lead_conversion_pct: number;
  /** The window these numbers cover, inclusive date-only strings. */
  window: { from: string; to: string; days: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Nights of a stay that fall inside [from, to] — date-only string math. */
function nightsInWindow(checkIn: string | null, checkOut: string | null, from: string, to: string): number {
  const start = dateOnly(checkIn);
  const end = dateOnly(checkOut);
  if (!start || !end) return 0;
  const lo = start > from ? start : from;
  const hi = end < to ? end : to;
  if (hi <= lo) return 0;
  return Math.round((Date.parse(`${hi}T00:00:00Z`) - Date.parse(`${lo}T00:00:00Z`)) / DAY_MS);
}

function addonRows(snapshot: unknown): Array<{ label: string; price: number; status: string }> {
  if (!Array.isArray(snapshot)) return [];
  return snapshot
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .map((a) => ({
      label: typeof a.label === "string" ? a.label : "Extra",
      price: typeof a.price === "number" ? a.price : 0,
      status: typeof a.status === "string" ? a.status : "confirmed",
    }));
}

export function buildBusinessSummary(
  bookings: QueueBooking[],
  leads: QueueLead[],
  windowFrom: string,
  windowTo: string,
  villas: string[] = ["Villa Mechmech", "Villa Byblos"],
): BusinessSummary {
  const days = Math.max(
    1,
    Math.round((Date.parse(`${windowTo}T00:00:00Z`) - Date.parse(`${windowFrom}T00:00:00Z`)) / DAY_MS),
  );

  let revenueReceived = 0;
  let revenueExpected = 0;
  let refundsOwed = 0;
  let confirmed = 0;
  let pending = 0;
  let cancelled = 0;

  const nights: Record<string, number> = {};
  for (const villa of villas) nights[villa] = 0;
  const addonCounts = new Map<string, { count: number; revenue: number }>();

  for (const b of bookings) {
    const status = (b.status ?? "").toLowerCase();
    const paid = b.amount_paid ?? 0;

    if (status === "cancelled") {
      cancelled += 1;
      const returned = b.refund_amount ?? 0;
      if (paid > returned) refundsOwed += paid - returned;
      continue; // D-8: cancelled bookings are excluded from every other metric.
    }

    if (status === "pending") { pending += 1; continue; }
    if (status !== "confirmed") continue;

    confirmed += 1;
    revenueReceived += paid;

    const view = bookingMoneyView(b);
    if (view.amount !== null && view.amount > paid) revenueExpected += view.amount - paid;

    const villa = b.villa ?? "";
    if (villa in nights) nights[villa] += nightsInWindow(b.check_in, b.check_out, windowFrom, windowTo);

    for (const addon of addonRows(b.addons_snapshot)) {
      if (addon.status === "declined") continue;
      const current = addonCounts.get(addon.label) ?? { count: 0, revenue: 0 };
      addonCounts.set(addon.label, { count: current.count + 1, revenue: current.revenue + addon.price });
    }
  }

  const occupancy: Record<string, number> = {};
  for (const villa of villas) {
    occupancy[villa] = days > 0 ? Math.round(((nights[villa] ?? 0) / days) * 100) : 0;
  }

  const leadsTotal = leads.length;
  const leadsConverted = leads.filter(
    (l) => Boolean(l.linked_booking_id) || (l.follow_up_status ?? "").toLowerCase() === "converted",
  ).length;

  return {
    revenue_received: Math.round(revenueReceived),
    revenue_expected: Math.round(revenueExpected),
    refunds_owed: Math.round(refundsOwed),
    confirmed_count: confirmed,
    pending_count: pending,
    cancelled_count: cancelled,
    nights_by_villa: nights,
    occupancy_pct_by_villa: occupancy,
    addon_uptake: [...addonCounts.entries()]
      .map(([label, v]) => ({ label, count: v.count, revenue: Math.round(v.revenue) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    leads_total: leadsTotal,
    leads_converted: leadsConverted,
    lead_conversion_pct: leadsTotal > 0 ? Math.round((leadsConverted / leadsTotal) * 100) : 0,
    window: { from: windowFrom, to: windowTo, days },
  };
}
