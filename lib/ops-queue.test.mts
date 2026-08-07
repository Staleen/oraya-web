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
    guest_name: "Nadia",
    guest_email: "nadia@example.com",
    guest_phone: "+961 3 123456",
    guest_country: null,
    sleeping_guests: 4,
    day_visitors: null,
    message: null,
    event_type: null,
    addons_snapshot: null,
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
    ...overrides,
  };
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
