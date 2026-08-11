import assert from "node:assert/strict";
import test from "node:test";
import {
  decideInstantConfirmation,
  describeInstantConfirmSkip,
  type InstantConfirmBooking,
} from "./instant-confirm.ts";

const TODAY = "2026-08-11";

function booking(overrides: Partial<InstantConfirmBooking> = {}): InstantConfirmBooking {
  return {
    status: "pending",
    villa: "Villa Byblos",
    event_type: null,
    message: null,
    addons_snapshot: [],
    amount_paid: 240,
    amount_total: 240,
    check_out: "2026-08-13",
    ...overrides,
  };
}

const ON = { auto_confirm_enabled: true, villa_instant_enabled: true };

function decide(b: Partial<InstantConfirmBooking>, settings = ON) {
  return decideInstantConfirmation({ booking: booking(b), settings, today_utc: TODAY });
}

test("a fully paid, add-on-free stay on an instant villa confirms itself", () => {
  assert.deepEqual(decide({}), { confirm: true });
});

test("the master switch is the first gate — off means nothing happens", () => {
  assert.deepEqual(
    decide({}, { auto_confirm_enabled: false, villa_instant_enabled: true }),
    { confirm: false, reason: "auto_confirm_disabled" },
  );
});

test("a villa that does not offer instant booking never auto-confirms", () => {
  assert.deepEqual(
    decide({}, { auto_confirm_enabled: true, villa_instant_enabled: false }),
    { confirm: false, reason: "villa_not_instant" },
  );
});

test("a deposit is never enough — full payment only", () => {
  assert.deepEqual(decide({ amount_paid: 100 }), { confirm: false, reason: "not_paid_in_full" });
  assert.deepEqual(decide({ amount_paid: 239.99 }), { confirm: false, reason: "not_paid_in_full" });
  // Overpayment still counts as paid in full.
  assert.deepEqual(decide({ amount_paid: 260 }), { confirm: true });
});

test("float noise cannot block a guest who paid everything", () => {
  assert.deepEqual(decide({ amount_paid: 0.1 + 0.2, amount_total: 0.3 }), { confirm: true });
});

test("an unknown or zero total fails closed", () => {
  assert.deepEqual(decide({ amount_total: null }), { confirm: false, reason: "total_unknown" });
  assert.deepEqual(decide({ amount_total: 0 }), { confirm: false, reason: "total_unknown" });
});

test("add-ons always require a person", () => {
  assert.deepEqual(
    decide({ addons_snapshot: [{ id: "breakfast" }] }),
    { confirm: false, reason: "has_addons" },
  );
});

test("a special request always requires a person", () => {
  assert.deepEqual(
    decide({ message: "Can we have late checkout?" }),
    { confirm: false, reason: "has_special_request" },
  );
  // Whitespace is not a request.
  assert.deepEqual(decide({ message: "   " }), { confirm: true });
});

test("event inquiries are never instant", () => {
  assert.deepEqual(
    decide({ event_type: "Wedding" }),
    { confirm: false, reason: "event_inquiry" },
  );
});

test("only a pending booking can be auto-confirmed", () => {
  for (const status of ["confirmed", "cancelled", "CONFIRMED", null]) {
    assert.equal(decide({ status }).confirm, false, String(status));
  }
});

test("a stay that already ended never ships arrival details", () => {
  assert.deepEqual(
    decide({ check_out: "2026-08-10" }),
    { confirm: false, reason: "stay_already_over" },
  );
  // Checkout day itself still qualifies.
  assert.deepEqual(decide({ check_out: TODAY }), { confirm: true });
});

test("every skip reason has owner-facing copy", () => {
  const reasons = [
    "auto_confirm_disabled", "villa_not_instant", "not_pending", "event_inquiry",
    "has_addons", "has_special_request", "total_unknown", "not_paid_in_full",
    "stay_already_over",
  ] as const;
  for (const reason of reasons) {
    const copy = describeInstantConfirmSkip(reason);
    assert.ok(copy.length > 10, reason);
    assert.doesNotMatch(copy, /_/, reason);
  }
});
