/**
 * Phase 16B W2 — the legacy admin route may no longer record money.
 *
 * Two things are pinned here:
 *   1. the rule itself, behaviourally — a money-bearing payload is refused, a
 *      non-money payload is not
 *   2. that the rule is actually WIRED into the route and the admin UI no
 *      longer offers the controls, asserted against the real sources
 *
 * The second half is a source contract rather than a request/response test:
 * `PATCH /api/admin/bookings/[id]` needs a service-role Supabase client and a
 * signed admin cookie to reach its body, and the repo has no harness for that.
 * Stated plainly rather than dressed up as an end-to-end proof.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/admin/money-field-guard.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_MONEY_FIELDS,
  ADMIN_MONEY_REJECTION_MESSAGE,
  findAdminMoneyFields,
  payloadRecordsMoney,
} from "./money-field-guard.ts";

const ROUTE = readFileSync("app/api/admin/bookings/[id]/route.ts", "utf8");
const PAYMENT_SECTION = readFileSync("components/admin/bookings/PaymentSection.tsx", "utf8");
const BOOKINGS_TABLE = readFileSync("components/admin/BookingsTable.tsx", "utf8");
const ACTIONS = readFileSync("components/admin/bookings/actions.ts", "utf8");

/* ── The rule ─────────────────────────────────────────────────────────────── */

test("a money-bearing PATCH is refused", () => {
  // The exact payload the admin "Record payment" button used to send — this is
  // the shape that wrote the duplicate $240 on booking 53896156.
  const recordPayment = {
    payment_method: "card_manual",
    amount_paid: 240,
    payment_notes: "Recorded by hand",
    payment_received_at: "2026-08-11T18:00:00.000Z",
    amount_total: 240,
    amount_due: 0,
    payment_status: "paid_in_full",
  };
  assert.equal(payloadRecordsMoney(recordPayment), true);
  assert.deepEqual(findAdminMoneyFields(recordPayment).sort(), [
    "amount_due",
    "amount_paid",
    "amount_total",
    "payment_method",
    "payment_notes",
    "payment_received_at",
    "payment_status",
  ]);
});

test("each money field is refused on its own, not just in combination", () => {
  for (const field of ADMIN_MONEY_FIELDS) {
    assert.equal(
      payloadRecordsMoney({ [field]: "anything" }),
      true,
      `${field} must be refused on its own`,
    );
  }
});

test("presence is what counts — a null or zero write is still a money write", () => {
  // A partial write is exactly how the duplicate receipt happened, so the value
  // is irrelevant: attempting to touch the column at all is refused.
  assert.equal(payloadRecordsMoney({ amount_paid: null }), true);
  assert.equal(payloadRecordsMoney({ amount_paid: 0 }), true);
  assert.equal(payloadRecordsMoney({ refund_amount: undefined }), true);
  assert.equal(payloadRecordsMoney({ refund_status: "" }), true);
});

test("the old refund recorder and deposit request are both refused", () => {
  assert.equal(
    payloadRecordsMoney({
      refund_status: "refunded",
      refund_amount: 240,
      refund_provider_reference: "7864700292896974704899",
      payment_notes: "BC refund",
    }),
    true,
  );
  assert.equal(
    payloadRecordsMoney({
      deposit_amount: 100,
      payment_method: "whish",
      payment_status: "payment_requested",
    }),
    true,
  );
});

/* ── What must still work ─────────────────────────────────────────────────── */

test("a non-money PATCH is not refused", () => {
  // Status changes — the confirm/cancel path the admin bookings page uses.
  assert.equal(payloadRecordsMoney({ status: "confirmed" }), false);
  assert.equal(payloadRecordsMoney({ status: "cancelled" }), false);
  assert.deepEqual(findAdminMoneyFields({ status: "confirmed" }), []);
});

test("proposal fields and the reminder flag are not money fields", () => {
  assert.equal(
    payloadRecordsMoney({
      proposal_status: "sent",
      proposal_total_amount: 1200,
      proposal_deposit_amount: 400,
      proposal_notes: "…",
      proposal_valid_until: "2026-09-01",
      proposal_payment_methods: ["cash"],
    }),
    false,
    "event proposal amounts are a quote, not recorded money",
  );
  assert.equal(payloadRecordsMoney({ send_payment_reminder: true }), false);
  assert.equal(payloadRecordsMoney({ send_event_proposal: true }), false);
});

test("malformed payloads do not throw", () => {
  for (const payload of [null, undefined, "string", 42, [], [{ amount_paid: 1 }]]) {
    assert.equal(payloadRecordsMoney(payload), false, String(payload));
  }
});

test("the rejection message names where money is recorded instead", () => {
  assert.match(ADMIN_MONEY_REJECTION_MESSAGE, /Ops → Payments/);
  assert.match(ADMIN_MONEY_REJECTION_MESSAGE, /twice/);
});

/* ── The rule is wired in, and the UI no longer offers it ─────────────────── */

test("the route refuses money fields before it reads or writes anything", () => {
  assert.match(ROUTE, /findAdminMoneyFields/);
  assert.match(ROUTE, /ADMIN_MONEY_REJECTION_MESSAGE/);
  assert.match(ROUTE, /money_path_closed/);

  const guardIndex = ROUTE.indexOf("const attemptedMoneyFields = findAdminMoneyFields(payload)");
  const loadIndex = ROUTE.indexOf('.from("bookings")');
  assert.ok(guardIndex > 0, "the guard must be present");
  assert.ok(
    loadIndex > guardIndex,
    "the guard must run before the booking is loaded, so nothing lands half-applied",
  );
});

test("the non-money paths are still handled by the route", () => {
  // Status, proposals and the reminder must keep working exactly as before.
  assert.match(ROUTE, /statusUpdateProvided/);
  assert.match(ROUTE, /proposalUpdateProvided/);
  assert.match(ROUTE, /reminderRequested/);
  assert.match(ROUTE, /send_event_proposal/);
});

test("the admin UI no longer offers a money control", () => {
  for (const gone of [
    "actions.requestDeposit",
    "actions.recordPayment",
    "actions.issueRefund",
    "Record manual refund",
    "Record payment",
    "Request deposit",
  ]) {
    assert.ok(
      !PAYMENT_SECTION.includes(gone),
      `PaymentSection must no longer offer "${gone}"`,
    );
  }
  // …and it points at where money is recorded now.
  assert.match(PAYMENT_SECTION, /Ops → Payments/);
  assert.match(PAYMENT_SECTION, /\/ops\/payments/);
});

test("no admin code composes a money PATCH any more", () => {
  for (const gone of [
    "async function requestDeposit",
    "async function recordPayment",
    "async function issueRefund",
  ]) {
    assert.ok(!BOOKINGS_TABLE.includes(gone), `BookingsTable must no longer define ${gone}`);
  }
  for (const gone of ["requestDeposit:", "recordPayment:", "issueRefund:"]) {
    assert.ok(!ACTIONS.includes(gone), `the card-actions contract must not expose ${gone}`);
  }
});

test("reading money history in admin is untouched — only writing is closed", () => {
  // W2 is about what can be written from now on. Stored history stays readable.
  for (const kept of ["Recorded refund", "Amount paid", "Summary", "Send reminder"]) {
    assert.ok(PAYMENT_SECTION.includes(kept), `admin must still display "${kept}"`);
  }
});
