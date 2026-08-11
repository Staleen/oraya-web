/**
 * Ops Admin v2 — the Today work queue is what the operator trusts each
 * morning, so its ordering and inclusion rules are pinned here.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/ops-queue.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bookingGuestName,
  buildQueue,
  formatBookingRef,
  groupQueue,
  villaName,
  type QueueBooking,
  type QueueLead,
} from "./ops-queue.ts";

const DAY = 24 * 60 * 60 * 1000;
/** Deterministic "now": 2026-08-07T12:00:00Z. */
const NOW = Date.UTC(2026, 7, 7, 12, 0, 0);

function iso(offsetDays: number): string {
  return new Date(NOW + offsetDays * DAY).toISOString();
}

function dateOnly(offsetDays: number): string {
  return new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);
}

function booking(overrides: Partial<QueueBooking>): QueueBooking {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    villa: "Villa Mechmech",
    check_in: dateOnly(10),
    check_out: dateOnly(13),
    status: "confirmed",
    created_at: iso(-1),
    member_id: null,
    member_contact: null,
    guest_name: "Nadia",
    guest_email: "nadia@example.com",
    guest_phone: "+961 3 123456",
    guest_country: null,
    sleeping_guests: 4,
    day_visitors: null,
    message: null,
    event_type: null,
    addons_snapshot: null,
    pricing_subtotal: null,
    pricing_snapshot: null,
    payment_status: null,
    payment_method: null,
    payment_due_at: null,
    payment_reference: null,
    payment_received_at: null,
    payment_marked_by: null,
    deposit_amount: null,
    amount_total: 1000,
    amount_paid: 0,
    amount_due: null,
    refund_status: null,
    refund_amount: null,
    refunded_at: null,
    refund_provider_reference: null,
    whatsapp_confirmation_sent_at: null,
    payment_link_url: null,
    payment_link_provider: null,
    payment_link_status: null,
    payment_link_expires_at: null,
    payment_link_issued_at: null,
    feedback_requested_at: null,
    feedback_request_count: null,
    proposal_status: null,
    proposal_total_amount: null,
    proposal_deposit_amount: null,
    proposal_valid_until: null,
    proposal_payment_methods: null,
    proposal_notes: null, proposal_included_services: null,
    ...overrides,
  };
}

/** An event booking is detected by event_type + the [Event Inquiry] marker. */
function eventBooking(overrides: Partial<QueueBooking>): QueueBooking {
  return booking({
    event_type: "Birthday",
    message: "[Event Inquiry] 30 guests",
    status: "pending",
    ...overrides,
  });
}

function lead(overrides: Partial<QueueLead>): QueueLead {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Karim",
    phone: "+9613000000",
    villa: "mechmech",
    request_type: "stay",
    follow_up_status: "new",
    created_at: iso(0),
    special_requests: null,
    admin_notes: null,
    addons_interest: null,
    normalized_check_in: null,
    normalized_check_out: null,
    check_in_text: null,
    check_out_text: null,
    guest_count: 4,
    labels: null,
    linked_booking_id: null,
    ...overrides,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

test("formatBookingRef: 8-char uppercase prefix of the dashless uuid", () => {
  assert.equal(formatBookingRef("a0b8cecb-1234-4321-9999-000000000000"), "A0B8CECB");
});

test("villaName: canonical 'Villa X' values are not double-prefixed", () => {
  assert.equal(villaName("Villa Mechmech"), "Villa Mechmech");
  assert.equal(villaName("mechmech"), "Villa Mechmech");
  assert.equal(villaName(null), "Villa");
});

// ── leads ────────────────────────────────────────────────────────────────────

test("a new unlinked lead enters the attention group", () => {
  const items = buildQueue([], [lead({})], NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "new_lead");
  assert.equal(items[0].group, "attention");
});

test("contacted, converted and linked leads stay out of the queue", () => {
  const items = buildQueue(
    [],
    [
      lead({ id: "aaaaaaaa-bbbb-cccc-dddd-000000000001", follow_up_status: "contacted" }),
      lead({ id: "aaaaaaaa-bbbb-cccc-dddd-000000000002", follow_up_status: "converted" }),
      lead({ id: "aaaaaaaa-bbbb-cccc-dddd-000000000003", linked_booking_id: "11111111-2222-3333-4444-555555555555" }),
    ],
    NOW,
  );
  assert.equal(items.length, 0);
});

// ── bookings ─────────────────────────────────────────────────────────────────

test("a pending request outranks everything and ages upward", () => {
  const items = buildQueue(
    [
      booking({ id: "11111111-2222-3333-4444-000000000001", status: "pending", created_at: iso(-3) }),
      booking({ id: "11111111-2222-3333-4444-000000000002", status: "pending", created_at: iso(0) }),
    ],
    [lead({})],
    NOW,
  );
  assert.equal(items[0].kind, "booking_request");
  assert.ok(items[0].id.includes("000000000001"), "the older request ranks first");
  assert.ok(
    items.filter((i) => i.kind === "booking_request").every((i) => i.weight > 60),
    "requests outrank a fresh lead",
  );
});

test("overdue payment on a confirmed stay lands in the money group", () => {
  const items = buildQueue(
    [booking({ payment_due_at: iso(-2), amount_total: 1000, amount_paid: 400 })],
    [],
    NOW,
  );
  const due = items.find((i) => i.kind === "deposit_overdue");
  assert.ok(due, "expected a deposit_overdue item");
  assert.equal(due!.group, "money");
  assert.equal(due!.amount, 600);
});

test("payment due today is expected, not overdue", () => {
  const items = buildQueue(
    [booking({ payment_due_at: iso(0), amount_total: 1000, amount_paid: 0 })],
    [],
    NOW,
  );
  assert.ok(items.some((i) => i.kind === "payment_expected"));
  assert.ok(!items.some((i) => i.kind === "deposit_overdue"));
});

test("a fully paid stay raises no money item", () => {
  const items = buildQueue(
    [booking({ payment_due_at: iso(-2), amount_total: 1000, amount_paid: 1000 })],
    [],
    NOW,
  );
  assert.ok(!items.some((i) => i.group === "money"));
});

test("cancelled stay holding guest money owes a refund until fully returned", () => {
  const stillOwed = buildQueue(
    [booking({ status: "cancelled", amount_paid: 500, refund_amount: 200, refunded_at: iso(-1) })],
    [],
    NOW,
  );
  const owed = stillOwed.find((i) => i.kind === "refund_owed");
  assert.ok(owed, "partially refunded is still owed");
  assert.equal(owed!.amount, 300);

  const settled = buildQueue(
    [booking({ status: "cancelled", amount_paid: 500, refund_amount: 500, refunded_at: iso(-1) })],
    [],
    NOW,
  );
  assert.ok(!settled.some((i) => i.kind === "refund_owed"));
});

test("arrival within 2 days without the WhatsApp guide raises an arriving item", () => {
  const unsent = buildQueue(
    [booking({ check_in: dateOnly(1), check_out: dateOnly(4), amount_paid: 1000 })],
    [],
    NOW,
  );
  assert.ok(unsent.some((i) => i.kind === "arrival_guide_unsent"));

  const sent = buildQueue(
    [booking({ check_in: dateOnly(1), check_out: dateOnly(4), whatsapp_confirmation_sent_at: iso(-1) })],
    [],
    NOW,
  );
  assert.ok(!sent.some((i) => i.kind === "arrival_guide_unsent"));
});

test("pending add-on approvals on a confirmed stay need attention", () => {
  const items = buildQueue(
    [booking({
      addons_snapshot: [
        { label: "Heated Pool", price: 150, requires_approval: true, status: "pending_approval" },
        { label: "Breakfast", price: 40, requires_approval: true, status: "approved" },
      ],
    })],
    [],
    NOW,
  );
  const addons = items.filter((i) => i.kind === "addon_approval");
  assert.equal(addons.length, 1);
  assert.equal(addons[0].amount, 150);
});

test("member bookings use the member's name, not 'Guest'", () => {
  const items = buildQueue(
    [booking({
      status: "pending",
      guest_name: null,
      member_id: "99999999-9999-9999-9999-999999999999",
      member_contact: { full_name: "Mehdi Chamsedine", email: "m@example.com", phone: null },
    })],
    [],
    NOW,
  );
  assert.ok(items[0].title.includes("Mehdi Chamsedine"));
});

test("a pending request without recorded money shows the snapshot estimate, marked est.", () => {
  const items = buildQueue(
    [booking({
      status: "pending",
      amount_total: null,
      pricing_snapshot: { subtotal: 600 },
      addons_snapshot: [{ label: "Fireplace Diesel", price: 20 }],
    })],
    [],
    NOW,
  );
  assert.ok(items[0].detail.includes("$620 est."), items[0].detail);
});

// ── events ───────────────────────────────────────────────────────────────────

test("a pending event without a proposal asks for one, not for plain approval", () => {
  const items = buildQueue([eventBooking({ proposal_status: null })], [], NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "event_proposal_needed");
  assert.ok(!items.some((i) => i.kind === "booking_request"));
});

test("a sent proposal waits quietly; an accepted one demands confirmation", () => {
  assert.equal(buildQueue([eventBooking({ proposal_status: "sent" })], [], NOW).length, 0);

  const accepted = buildQueue(
    [eventBooking({ proposal_status: "accepted", proposal_total_amount: 4200 })],
    [],
    NOW,
  );
  assert.equal(accepted[0].kind, "event_accepted_unconfirmed");
  assert.equal(accepted[0].amount, 4200);
  assert.ok(accepted[0].title.includes("accepted"));
});

test("an accepted event outranks a waiting stay request", () => {
  const items = buildQueue(
    [
      booking({ id: "11111111-2222-3333-4444-00000000000a", status: "pending", created_at: iso(-1) }),
      eventBooking({ id: "11111111-2222-3333-4444-00000000000b", proposal_status: "accepted" }),
    ],
    [],
    NOW,
  );
  assert.equal(items[0].kind, "event_accepted_unconfirmed");
});

// ── grouping ────────────────────────────────────────────────────────────────

test("groupQueue splits by group and loses nothing", () => {
  const items = buildQueue(
    [
      booking({ id: "11111111-2222-3333-4444-000000000001", status: "pending" }),
      booking({ id: "11111111-2222-3333-4444-000000000002", payment_due_at: iso(-1), amount_total: 500, amount_paid: 0 }),
      booking({ id: "11111111-2222-3333-4444-000000000003", check_in: dateOnly(1), check_out: dateOnly(3), amount_paid: 0 }),
    ],
    [lead({})],
    NOW,
  );
  const groups = groupQueue(items);
  assert.equal(
    groups.attention.length + groups.money.length + groups.arriving.length,
    items.length,
  );
});

/**
 * Reported from production 2026-08-12: the payments booking picker listed every
 * member booking as "Guest" while anonymous bookings showed real names — the
 * operator lost the identity of the customers Oraya knows most about.
 */
test("bookingGuestName shows the member's name when the booking carries no guest_name", () => {
  assert.equal(
    bookingGuestName({
      guest_name: null,
      member_id: "m-1",
      member_contact: { full_name: "Mira Khalaf", email: "mira@example.com", phone: null },
    } as never),
    "Mira Khalaf",
  );
});

test("bookingGuestName prefers the name typed on the booking over the member record", () => {
  assert.equal(
    bookingGuestName({
      guest_name: "Booked for Nadia",
      member_id: "m-1",
      member_contact: { full_name: "Mira Khalaf", email: null, phone: null },
    } as never),
    "Booked for Nadia",
  );
});

test("bookingGuestName falls back to an email before giving up on a member", () => {
  assert.equal(
    bookingGuestName({
      guest_name: "   ",
      member_id: "m-1",
      member_contact: { full_name: null, email: "mira@example.com", phone: null },
    } as never),
    "mira@example.com",
  );
});

test("bookingGuestName says Member, not Guest, when an account holder has no name on file", () => {
  const label = bookingGuestName({ guest_name: null, member_id: "m-1", member_contact: null } as never);
  assert.equal(label, "Member");
  assert.notEqual(label, "Guest");
});

test("bookingGuestName still says Guest for a genuinely anonymous booking", () => {
  assert.equal(bookingGuestName({ guest_name: null, member_id: null, member_contact: null } as never), "Guest");
});
