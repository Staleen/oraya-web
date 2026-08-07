/**
 * /ops display truths: estimated totals and the [Stay Setup] parser.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/ops-booking-display.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { bookingMoneyView, parseStaySetupMessage } from "./ops-booking-display.ts";

// ── bookingMoneyView ─────────────────────────────────────────────────────────

test("recorded amount_total always wins and is never marked estimated", () => {
  const view = bookingMoneyView({
    amount_total: 900,
    pricing_snapshot: { subtotal: 600 },
    addons_snapshot: [{ price: 20 }],
  });
  assert.deepEqual(view, { amount: 900, estimated: false });
});

test("null amount_total falls back to snapshot subtotal + priced add-ons, marked estimated", () => {
  const view = bookingMoneyView({
    amount_total: null,
    pricing_snapshot: { subtotal: 600 },
    addons_snapshot: [{ price: 20 }, { price: 0 }],
  });
  assert.deepEqual(view, { amount: 620, estimated: true });
});

test("string subtotal in the snapshot parses; pricing_subtotal is the fallback", () => {
  assert.deepEqual(
    bookingMoneyView({ amount_total: null, pricing_snapshot: { subtotal: "600" } }),
    { amount: 600, estimated: true },
  );
  assert.deepEqual(
    bookingMoneyView({ amount_total: null, pricing_snapshot: null, pricing_subtotal: 450 }),
    { amount: 450, estimated: true },
  );
});

test("a price-on-request add-on keeps the stay subtotal as the estimate", () => {
  const view = bookingMoneyView({
    amount_total: null,
    pricing_snapshot: { subtotal: 600 },
    addons_snapshot: [{ price: 20 }, { price: null }],
  });
  assert.deepEqual(view, { amount: 600, estimated: true });
});

test("nothing recorded and nothing estimable is null, not zero", () => {
  assert.deepEqual(
    bookingMoneyView({ amount_total: null, pricing_snapshot: null, pricing_subtotal: null }),
    { amount: null, estimated: false },
  );
});

// ── parseStaySetupMessage ────────────────────────────────────────────────────

const SAMPLE = [
  "[Stay Setup]",
  "Bedrooms to be used: 1 Bedroom",
  "Estimated guests: 2",
  "Sleeping setup: Standard bedroom setup",
  "Guest Notes: Decorate room Honeymood stay Directly after the winding",
  "[Booking Protocol]",
  "System branch: Pending booking request for admin review",
  "Charge status: No charge collected on website at booking-request stage",
].join("\n");

test("parses the live-evidence message: fields extracted, protocol block dropped", () => {
  const view = parseStaySetupMessage(SAMPLE);
  assert.ok(view);
  assert.equal(view!.bedrooms, "1 Bedroom");
  assert.equal(view!.estimatedGuests, "2");
  assert.equal(view!.guestNotes, "Decorate room Honeymood stay Directly after the winding");
  assert.equal(view!.addonsInterest, null);
  assert.ok(!JSON.stringify(view).includes("Booking Protocol"));
});

test("conversion-format message with None placeholders reads as absent", () => {
  const view = parseStaySetupMessage(
    "[Stay Setup]\nBedrooms to be used: 2 Bedrooms\nEstimated guests: 4\nSleeping setup: To be reviewed by Oraya.\nGuest Notes: None\nAdd-ons interest: Heated pool",
  );
  assert.ok(view);
  assert.equal(view!.guestNotes, null);
  assert.equal(view!.addonsInterest, "Heated pool");
});

test("a normal human message is not parsed", () => {
  assert.equal(parseStaySetupMessage("We arrive late, please keep the gate open."), null);
  assert.equal(parseStaySetupMessage(null), null);
  assert.equal(parseStaySetupMessage(""), null);
});

test("multi-line guest notes survive until the next known field", () => {
  const view = parseStaySetupMessage(
    "[Stay Setup]\nGuest Notes: line one\nline two\nAdd-ons interest: None",
  );
  assert.ok(view);
  assert.equal(view!.guestNotes, "line one\nline two");
  assert.equal(view!.addonsInterest, null);
});
