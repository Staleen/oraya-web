/**
 * Remediation 1.6 — webhook `set_paid` idempotency (double-count fix).
 * Distinct from KNOWN_BUGS #14 (unified-checkout completion idempotency).
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/webhook-set-paid.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideSetPaidUpdate, type SetPaidBookingState } from "./webhook-set-paid.ts";

function bookingState(overrides: Partial<SetPaidBookingState> = {}): SetPaidBookingState {
  return {
    event_type: null,
    message: null,
    payment_link_status: "active",
    payment_reference: null,
    amount_paid: null,
    amount_total: 1000,
    ...overrides,
  };
}

const DELTA = {
  amount_paid: 400,
  payment_reference: "REF-1",
  payment_received_at: "2026-07-23T10:00:00.000Z",
};

test("first delivery applies: amounts, stage, and paid link status", () => {
  const d = decideSetPaidUpdate(bookingState(), DELTA);
  assert.equal(d.action, "apply");
  if (d.action !== "apply") return;
  assert.equal(d.updatePayload.amount_paid, 400);
  assert.equal(d.updatePayload.amount_total, 1000);
  assert.equal(d.updatePayload.amount_due, 600);
  assert.equal(d.updatePayload.payment_status, "deposit_paid");
  assert.equal(d.updatePayload.payment_stage, "partially_paid");
  assert.equal(d.updatePayload.payment_link_status, "paid");
  assert.equal(d.updatePayload.payment_reference, "REF-1");
});

test("payment covering the full total becomes paid_in_full / fully_paid", () => {
  const d = decideSetPaidUpdate(bookingState(), { ...DELTA, amount_paid: 1000 });
  assert.equal(d.action, "apply");
  if (d.action !== "apply") return;
  assert.equal(d.updatePayload.payment_status, "paid_in_full");
  assert.equal(d.updatePayload.payment_stage, "fully_paid");
  assert.equal(d.updatePayload.amount_due, 0);
});

test("duplicate delivery (already paid, same reference) is idempotent — no re-add", () => {
  const d = decideSetPaidUpdate(
    bookingState({ payment_link_status: "paid", payment_reference: "REF-1", amount_paid: 400 }),
    DELTA,
  );
  assert.deepEqual(d, { action: "idempotent", reason: "same_reference" });
});

test("different-reference event for an already-paid session is idempotent — no re-add", () => {
  const d = decideSetPaidUpdate(
    bookingState({ payment_link_status: "paid", payment_reference: "REF-1", amount_paid: 400 }),
    { ...DELTA, payment_reference: "REF-2" },
  );
  assert.deepEqual(d, { action: "idempotent", reason: "already_paid" });
});

test("existing partial payment accumulates only while link is not yet paid", () => {
  const d = decideSetPaidUpdate(
    bookingState({ payment_link_status: "active", amount_paid: 250 }),
    DELTA,
  );
  assert.equal(d.action, "apply");
  if (d.action !== "apply") return;
  assert.equal(d.updatePayload.amount_paid, 650);
  assert.equal(d.updatePayload.amount_due, 350);
});

test("null payment_link_status (fresh link) still applies", () => {
  const d = decideSetPaidUpdate(bookingState({ payment_link_status: null }), DELTA);
  assert.equal(d.action, "apply");
});
