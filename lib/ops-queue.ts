/**
 * Derives the /ops "Today" work queue from bookings and leads.
 *
 * Pure and side-effect free so it can be unit tested and so the UI never has to
 * decide what matters. The old dashboard showed data and left the operator to
 * work out what needed doing; this decides, and orders by consequence.
 */

export type QueueKind =
  | "new_lead"
  | "booking_request"
  | "addon_approval"
  | "deposit_overdue"
  | "payment_expected"
  | "refund_owed"
  | "arrival_guide_unsent";

export type QueueGroup = "attention" | "money" | "arriving";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  group: QueueGroup;
  /** Sort weight — higher is more urgent. */
  weight: number;
  title: string;
  detail: string;
  bookingId?: string;
  leadId?: string;
  amount?: number;
}

/** Mirrors the column list selected by GET /api/ops/data. */
export interface QueueBooking {
  id: string;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  created_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_country: string | null;
  sleeping_guests: number | null;
  day_visitors: number | null;
  message: string | null;
  event_type: string | null;
  addons_snapshot: unknown;
  payment_status: string | null;
  payment_method: string | null;
  payment_due_at: string | null;
  payment_reference: string | null;
  payment_received_at: string | null;
  payment_marked_by: string | null;
  deposit_amount: number | null;
  amount_total: number | null;
  amount_paid: number | null;
  amount_due: number | null;
  refund_status: string | null;
  refund_amount: number | null;
  refunded_at: string | null;
  refund_provider_reference: string | null;
  whatsapp_confirmation_sent_at: string | null;
}

/** Mirrors the whatsapp_leads columns selected by GET /api/ops/data. */
export interface QueueLead {
  id: string;
  name: string | null;
  phone: string | null;
  villa: string | null;
  request_type: string | null;
  follow_up_status: string | null;
  created_at: string | null;
  special_requests: string | null;
  admin_notes: string | null;
  normalized_check_in: string | null;
  normalized_check_out: string | null;
  check_in_text: string | null;
  check_out_text: string | null;
  guest_count: number | null;
  labels: unknown;
  linked_booking_id: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatBookingRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS);
}

function pendingAddons(snapshot: unknown): { label: string; price: number }[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .filter((a) => a.requires_approval === true && a.status === "pending_approval")
    .map((a) => ({
      label: typeof a.label === "string" ? a.label : typeof a.name === "string" ? a.name : "Extra",
      price: typeof a.price === "number" ? a.price : 0,
    }));
}

function stayDates(b: QueueBooking): string {
  if (!b.check_in || !b.check_out) return "dates not set";
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("T")[0].split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${Number(d)} ${months[Number(m) - 1]}`;
  };
  return `${fmt(b.check_in)}–${fmt(b.check_out)}`;
}

function villaName(v: string | null): string {
  if (!v) return "Villa";
  return `Villa ${v.charAt(0).toUpperCase()}${v.slice(1)}`;
}

/**
 * @param now epoch ms — passed in rather than read, so tests are deterministic.
 */
export function buildQueue(
  bookings: QueueBooking[],
  leads: QueueLead[],
  now: number,
): QueueItem[] {
  const items: QueueItem[] = [];

  for (const lead of leads) {
    if (lead.linked_booking_id) continue;
    // Live values are: new, contacted, converted.
    const status = (lead.follow_up_status ?? "new").toLowerCase();
    if (status !== "new") continue;
    const age = lead.created_at ? now - Date.parse(lead.created_at) : 0;
    items.push({
      id: `lead:${lead.id}`,
      kind: "new_lead",
      group: "attention",
      weight: 60 + Math.min(20, Math.floor(age / DAY_MS) * 5),
      title: `New enquiry from ${lead.name ?? "someone"} on WhatsApp`,
      detail: lead.special_requests?.trim()
        ? `“${lead.special_requests.trim().slice(0, 120)}”`
        : villaName(lead.villa),
      leadId: lead.id,
    });
  }

  for (const b of bookings) {
    const status = (b.status ?? "").toLowerCase();
    const ref = formatBookingRef(b.id);
    const guest = b.guest_name ?? "Guest";
    const paid = b.amount_paid ?? 0;
    const total = b.amount_total ?? 0;
    const outstanding = Math.max(0, total - paid);

    if (status === "pending") {
      const waited = b.created_at ? daysBetween(Date.parse(b.created_at), now) : 0;
      items.push({
        id: `req:${b.id}`,
        kind: "booking_request",
        group: "attention",
        // A request left waiting is the most expensive thing to miss — a guest
        // who books elsewhere. Age raises it fast.
        weight: 100 + waited * 12,
        title: `${guest} wants to book ${villaName(b.villa)}`,
        detail: `${stayDates(b)} · ${b.sleeping_guests ?? "?"} guests · ${money(total)} · waiting ${waited === 0 ? "since today" : `${waited} day${waited === 1 ? "" : "s"}`}`,
        bookingId: b.id,
        amount: total,
      });
    }

    if (status === "confirmed") {
      for (const addon of pendingAddons(b.addons_snapshot)) {
        items.push({
          id: `addon:${b.id}:${addon.label}`,
          kind: "addon_approval",
          group: "attention",
          weight: 80,
          title: `${addon.label} requested on a confirmed stay`,
          detail: `${villaName(b.villa)} · ${guest} · ${stayDates(b)}${addon.price ? ` · adds ${money(addon.price)}` : ""}`,
          bookingId: b.id,
          amount: addon.price,
        });
      }

      if (b.payment_due_at && outstanding > 0) {
        const overdueBy = daysBetween(Date.parse(b.payment_due_at), now);
        if (overdueBy > 0) {
          items.push({
            id: `due:${b.id}`,
            kind: "deposit_overdue",
            group: "money",
            weight: 90 + overdueBy * 6,
            title: `Payment is ${overdueBy} day${overdueBy === 1 ? "" : "s"} overdue — ${ref}`,
            detail: `${guest} · ${villaName(b.villa)} · ${stayDates(b)} · ${money(paid)} of ${money(total)}`,
            bookingId: b.id,
            amount: outstanding,
          });
        } else if (overdueBy === 0) {
          items.push({
            id: `due:${b.id}`,
            kind: "payment_expected",
            group: "money",
            weight: 70,
            title: `Payment expected today — ${ref}`,
            detail: `${guest} · ${money(outstanding)} outstanding of ${money(total)}`,
            bookingId: b.id,
            amount: outstanding,
          });
        }
      }

      if (b.check_in) {
        const untilArrival = daysBetween(now, Date.parse(b.check_in));
        if (untilArrival >= 0 && untilArrival <= 2 && !b.whatsapp_confirmation_sent_at) {
          items.push({
            id: `guide:${b.id}`,
            kind: "arrival_guide_unsent",
            group: "arriving",
            weight: 75 - untilArrival * 10,
            title: `${guest} arrives ${untilArrival === 0 ? "today" : untilArrival === 1 ? "tomorrow" : `in ${untilArrival} days`} — arrival guide not sent`,
            detail: `${villaName(b.villa)} · ${stayDates(b)} · ${outstanding > 0 ? `${money(outstanding)} still owed` : "paid in full"}`,
            bookingId: b.id,
          });
        }
      }
    }

    // Money the guest paid that has not been returned after a cancellation.
    if (status === "cancelled" && paid > 0) {
      const returned = b.refund_amount ?? 0;
      if (!b.refunded_at || returned < paid) {
        items.push({
          id: `refund:${b.id}`,
          kind: "refund_owed",
          group: "money",
          weight: 95,
          title: `Refund owed on a cancelled stay — ${ref}`,
          detail: `${guest} · ${money(paid - returned)} received and not yet returned`,
          bookingId: b.id,
          amount: paid - returned,
        });
      }
    }
  }

  return items.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title));
}

export function groupQueue(items: QueueItem[]): Record<QueueGroup, QueueItem[]> {
  return {
    attention: items.filter((i) => i.group === "attention"),
    money: items.filter((i) => i.group === "money"),
    arriving: items.filter((i) => i.group === "arriving"),
  };
}
