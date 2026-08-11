import assert from "node:assert/strict";
import test from "node:test";
import { describeBookingMoney, describeBookingState } from "./booking-state-line.ts";

/**
 * The 2026-08-11 incident: a pending booking paid in full looked exactly like
 * an unpaid one, because approval state was returned before money was read.
 */

test("a pending booking that is fully paid says so", () => {
  const state = describeBookingState({
    status: "pending",
    amountPaid: 240,
    amountTotal: 240,
    refundedAt: null,
  });
  assert.equal(state.label, "Awaiting your approval");
  assert.match(state.money ?? "", /Paid in full/);
});

test("a pending unpaid booking and a pending paid one no longer read the same", () => {
  const unpaid = describeBookingState({
    status: "pending", amountPaid: 0, amountTotal: 240, refundedAt: null,
  });
  const paid = describeBookingState({
    status: "pending", amountPaid: 240, amountTotal: 240, refundedAt: null,
  });
  assert.notEqual(unpaid.money, paid.money);
  assert.match(unpaid.money ?? "", /outstanding/);
});

test("'paid in full' is never claimed without a total to measure against", () => {
  // Two live rows carry a payment with amount_total NULL.
  const noTotal = describeBookingMoney({
    status: "confirmed", amountPaid: 240, amountTotal: null, refundedAt: null,
  });
  assert.equal(noTotal, "USD 240 received");
  assert.doesNotMatch(noTotal ?? "", /paid in full/i);

  const zeroTotal = describeBookingMoney({
    status: "confirmed", amountPaid: 240, amountTotal: 0, refundedAt: null,
  });
  assert.equal(zeroTotal, "USD 240 received");
});

test("a part-paid booking shows both sides of the number", () => {
  const money = describeBookingMoney({
    status: "confirmed", amountPaid: 100, amountTotal: 240, refundedAt: null,
  });
  assert.match(money ?? "", /USD 100 of USD 240/);
  assert.match(money ?? "", /USD 140 outstanding/);
});

test("a cancelled booking still holding money is the loudest state", () => {
  const owed = describeBookingState({
    status: "cancelled", amountPaid: 240, amountTotal: 240, refundedAt: null,
  });
  assert.equal(owed.tone, "bad");
  assert.match(owed.label, /refund owed/i);

  const settled = describeBookingState({
    status: "cancelled", amountPaid: 240, amountTotal: 240, refundedAt: "2026-08-11",
  });
  assert.equal(settled.tone, "neutral");
});

test("a booking with nothing paid and no total says nothing rather than guessing", () => {
  assert.equal(
    describeBookingMoney({
      status: "pending", amountPaid: null, amountTotal: null, refundedAt: null,
    }),
    null,
  );
});

test("an overpaid booking still reads as paid, not as a negative balance", () => {
  const money = describeBookingMoney({
    status: "confirmed", amountPaid: 480, amountTotal: 240, refundedAt: null,
  });
  assert.match(money ?? "", /Paid in full/);
  assert.doesNotMatch(money ?? "", /-/);
});
