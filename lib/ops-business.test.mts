/**
 * Business summary — the owner's numbers. The rule under test throughout is
 * D-8: one population, stated. Cancelled bookings never leak into revenue,
 * occupancy or add-on uptake.
 *
 * Runner: node --experimental-strip-types --test lib/ops-business.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBusinessSummary } from "./ops-business.ts";
import type { QueueBooking, QueueLead } from "./ops-queue.ts";

function booking(o: Partial<QueueBooking>): QueueBooking {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    villa: "Villa Mechmech",
    check_in: "2026-08-10", check_out: "2026-08-13",
    status: "confirmed", created_at: "2026-08-01T00:00:00Z",
    member_id: null, member_contact: null,
    guest_name: "Guest", guest_email: null, guest_phone: null, guest_country: null,
    sleeping_guests: 2, day_visitors: null, message: null, event_type: null,
    addons_snapshot: null, pricing_subtotal: null, pricing_snapshot: null,
    payment_status: null, payment_method: null, payment_due_at: null,
    payment_reference: null, payment_received_at: null, payment_marked_by: null,
    deposit_amount: null, amount_total: null, amount_paid: null, amount_due: null,
    refund_status: null, refund_amount: null, refunded_at: null,
    refund_provider_reference: null, whatsapp_confirmation_sent_at: null,
    payment_link_url: null, payment_link_provider: null, payment_link_status: null,
    payment_link_expires_at: null, payment_link_issued_at: null,
    feedback_requested_at: null, feedback_request_count: null,
    proposal_status: null, proposal_total_amount: null, proposal_deposit_amount: null,
    proposal_valid_until: null, proposal_payment_methods: null, proposal_notes: null,
    ...o,
  };
}

function lead(o: Partial<QueueLead>): QueueLead {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Someone", phone: null, villa: null, request_type: "stay",
    follow_up_status: "new", created_at: "2026-08-01T00:00:00Z",
    special_requests: null, admin_notes: null, addons_interest: null,
    normalized_check_in: null, normalized_check_out: null,
    check_in_text: null, check_out_text: null, guest_count: null,
    labels: null, linked_booking_id: null,
    ...o,
  };
}

const FROM = "2026-08-01";
const TO = "2026-08-31";

test("revenue counts recorded money only, and never from cancelled bookings", () => {
  const s = buildBusinessSummary(
    [
      booking({ id: "a", amount_paid: 500, amount_total: 900 }),
      booking({ id: "b", status: "cancelled", amount_paid: 400, refund_amount: 100 }),
    ],
    [], FROM, TO,
  );
  assert.equal(s.revenue_received, 500, "cancelled money is not revenue");
  assert.equal(s.refunds_owed, 300, "400 taken, 100 returned");
  assert.equal(s.revenue_expected, 400, "900 contracted minus 500 received");
  assert.equal(s.confirmed_count, 1);
  assert.equal(s.cancelled_count, 1);
});

test("expected revenue uses the snapshot estimate when no total is recorded", () => {
  const s = buildBusinessSummary(
    [booking({ amount_paid: 0, amount_total: null, pricing_snapshot: { subtotal: 620 } })],
    [], FROM, TO,
  );
  assert.equal(s.revenue_expected, 620);
});

test("occupancy counts only nights inside the window, confirmed only", () => {
  const s = buildBusinessSummary(
    [
      booking({ id: "a", check_in: "2026-07-30", check_out: "2026-08-03" }), // 2 nights inside
      booking({ id: "b", check_in: "2026-08-10", check_out: "2026-08-13" }), // 3 nights
      booking({ id: "c", status: "cancelled", check_in: "2026-08-20", check_out: "2026-08-27" }),
      booking({ id: "d", status: "pending", check_in: "2026-08-20", check_out: "2026-08-27" }),
    ],
    [], FROM, TO,
  );
  assert.equal(s.nights_by_villa["Villa Mechmech"], 5);
  assert.equal(s.nights_by_villa["Villa Byblos"], 0);
  assert.equal(s.occupancy_pct_by_villa["Villa Mechmech"], Math.round((5 / 30) * 100));
  assert.equal(s.pending_count, 1);
});

test("add-on uptake ignores declined items and cancelled bookings", () => {
  const s = buildBusinessSummary(
    [
      booking({ id: "a", addons_snapshot: [
        { label: "Heated Pool", price: 150, status: "approved" },
        { label: "Breakfast", price: 40, status: "declined" },
      ] }),
      booking({ id: "b", addons_snapshot: [{ label: "Heated Pool", price: 150, status: "confirmed" }] }),
      booking({ id: "c", status: "cancelled", addons_snapshot: [{ label: "Heated Pool", price: 150, status: "approved" }] }),
    ],
    [], FROM, TO,
  );
  assert.deepEqual(s.addon_uptake, [{ label: "Heated Pool", count: 2, revenue: 300 }]);
});

test("lead conversion counts a linked booking or a converted status", () => {
  const s = buildBusinessSummary(
    [],
    [
      lead({ id: "1", linked_booking_id: "11111111-2222-3333-4444-555555555555" }),
      lead({ id: "2", follow_up_status: "converted" }),
      lead({ id: "3" }),
      lead({ id: "4", follow_up_status: "contacted" }),
    ],
    FROM, TO,
  );
  assert.equal(s.leads_total, 4);
  assert.equal(s.leads_converted, 2);
  assert.equal(s.lead_conversion_pct, 50);
});

test("an empty month reports zeros, not NaN", () => {
  const s = buildBusinessSummary([], [], FROM, TO);
  assert.equal(s.revenue_received, 0);
  assert.equal(s.lead_conversion_pct, 0);
  assert.equal(s.occupancy_pct_by_villa["Villa Byblos"], 0);
  assert.equal(s.window.days, 30);
});
