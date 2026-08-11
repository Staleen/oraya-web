/**
 * /ops display truths: estimated totals and the [Stay Setup] parser.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/ops-booking-display.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeRequestedAt, bookingMoneyView, parseStaySetupMessage } from "./ops-booking-display.ts";

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

/**
 * The booking detail screen never showed when a request came in — the operator
 * could not tell a request from an hour ago from one from three weeks ago.
 */
test("describeRequestedAt gives the date and how long ago, quietly", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");
  assert.equal(
    describeRequestedAt("2026-08-12T11:30:00.000Z", now),
    "Requested 12 Aug 2026 · 30 minutes ago",
  );
  assert.equal(
    describeRequestedAt("2026-08-12T09:00:00.000Z", now),
    "Requested 12 Aug 2026 · 3 hours ago",
  );
  assert.equal(
    describeRequestedAt("2026-08-09T12:00:00.000Z", now),
    "Requested 9 Aug 2026 · 3 days ago",
  );
  assert.equal(
    describeRequestedAt("2026-06-12T12:00:00.000Z", now),
    "Requested 12 Jun 2026 · 2 months ago",
  );
});

test("describeRequestedAt uses singular units where it should", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");
  assert.match(describeRequestedAt("2026-08-12T11:59:00.000Z", now) ?? "", /1 minute ago/);
  assert.match(describeRequestedAt("2026-08-12T11:00:00.000Z", now) ?? "", /1 hour ago/);
  assert.match(describeRequestedAt("2026-08-11T12:00:00.000Z", now) ?? "", /1 day ago/);
});

test("describeRequestedAt never invents an age it cannot know", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");
  assert.equal(describeRequestedAt(null, now), null);
  assert.equal(describeRequestedAt(undefined, now), null);
  assert.equal(describeRequestedAt("not a date", now), null);
  // A future timestamp is a clock problem, not a negative age.
  assert.equal(describeRequestedAt("2026-08-13T12:00:00.000Z", now), "Requested 13 Aug 2026");
});
