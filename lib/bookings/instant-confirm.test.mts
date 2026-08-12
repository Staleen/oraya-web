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

/* ── The defect that made instant booking unreachable (fixed 2026-08-12) ──
 *
 * Every /book submission composes a machine "[Stay Setup]" block into
 * `bookings.message`, so the column is never empty. Treating any non-empty
 * message as a special request meant has_special_request was true for every
 * booking that had ever existed, and the feature had never fired once.
 *
 * These fixtures are byte-faithful to what app/book/page.tsx composes.
 */

/** Exactly what /book writes when the guest typed nothing. */
const STAY_SETUP_NO_NOTES = [
  "[Stay Setup]",
  "Bedrooms to be used: 2 bedrooms",
  "Estimated guests: 4",
  "Sleeping setup: 2 bedrooms · 4 guests",
  "Guest Notes: None",
  "[Booking Protocol]",
  "System branch: Hosted checkout after booking creation",
  "Payment choice: Full payment on hosted checkout",
  "Supported online protocol targets: card/debit card, Apple Pay, Google Pay when enabled by the hosted provider",
  "Amount to collect now: $270.00",
].join("\n");

/** The same block when the guest actually wrote something. */
function staySetupWithNotes(notes: string): string {
  return STAY_SETUP_NO_NOTES.replace("Guest Notes: None", `Guest Notes: ${notes}`);
}

test("the auto-generated Stay Setup summary is NOT a special request", () => {
  assert.deepEqual(
    decide({ message: STAY_SETUP_NO_NOTES }),
    { confirm: true },
    "this exact shape is on every booking ever created — it blocked the feature entirely",
  );
});

test("a request the guest actually typed still requires a person", () => {
  assert.deepEqual(
    decide({ message: staySetupWithNotes("Decorate room") }),
    { confirm: false, reason: "has_special_request" },
    "live booking 574d64a5 carries exactly this",
  );
  assert.deepEqual(
    decide({ message: staySetupWithNotes("Can we arrive at 10pm?") }),
    { confirm: false, reason: "has_special_request" },
  );
});

test("a multi-line typed request is still a request", () => {
  assert.deepEqual(
    decide({ message: staySetupWithNotes("Late checkout please\nand extra towels") }),
    { confirm: false, reason: "has_special_request" },
  );
});

test("a Stay Setup block without the Booking Protocol section behaves the same", () => {
  // The protocol section is only appended on the request path.
  const withoutProtocol = STAY_SETUP_NO_NOTES.split("\n[Booking Protocol]")[0];
  assert.deepEqual(decide({ message: withoutProtocol }), { confirm: true });
  assert.deepEqual(
    decide({ message: withoutProtocol.replace("Guest Notes: None", "Guest Notes: call me") }),
    { confirm: false, reason: "has_special_request" },
  );
});

test("unknown message shapes fail closed — unknown means a person looks", () => {
  // Not a Stay Setup block: a legacy row, another intake path, or a format
  // that changed. Never assume it is safe to skip the human.
  for (const message of [
    "Can we have late checkout?",
    "[Booking Protocol]\nSystem branch: something",
    "Guest Notes: this is not inside a Stay Setup block",
    "[Some Future Block]\nGuest Notes: None",
    "random text",
  ]) {
    assert.deepEqual(
      decide({ message }),
      { confirm: false, reason: "has_special_request" },
      `unrecognised message must fail closed: ${message.slice(0, 30)}`,
    );
  }
});

test("system talk in the Booking Protocol section is never mistaken for a guest request", () => {
  // Every line after [Booking Protocol] describes the system, not the guest.
  const noisy = `${STAY_SETUP_NO_NOTES}\nPreferred follow-up payment method: Not specified in schema; operator confirms manually`;
  assert.deepEqual(decide({ message: noisy }), { confirm: true });
});

test("the special-request gate does not weaken any other gate", () => {
  // A clean Stay Setup block must still lose to every other condition.
  const m = STAY_SETUP_NO_NOTES;
  assert.deepEqual(decide({ message: m, addons_snapshot: [{ id: "breakfast" }] }), { confirm: false, reason: "has_addons" });
  assert.deepEqual(decide({ message: m, event_type: "Wedding" }), { confirm: false, reason: "event_inquiry" });
  assert.deepEqual(decide({ message: m, amount_paid: 100 }), { confirm: false, reason: "not_paid_in_full" });
  assert.deepEqual(decide({ message: m, amount_total: null }), { confirm: false, reason: "total_unknown" });
  assert.deepEqual(decide({ message: m, status: "confirmed" }), { confirm: false, reason: "not_pending" });
  assert.deepEqual(decide({ message: m, check_out: "2026-08-01" }), { confirm: false, reason: "stay_already_over" });
  assert.deepEqual(
    decide({ message: m }, { auto_confirm_enabled: false, villa_instant_enabled: true }),
    { confirm: false, reason: "auto_confirm_disabled" },
  );
  assert.deepEqual(
    decide({ message: m }, { auto_confirm_enabled: true, villa_instant_enabled: false }),
    { confirm: false, reason: "villa_not_instant" },
  );
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
