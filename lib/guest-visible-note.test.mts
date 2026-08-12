/**
 * The guest gets their own words back, or nothing.
 *
 * Pinned from the strings a real guest received on 2026-08-12: the cancellation
 * email rendered `bookings.message` raw, so it posted the machine
 * `[Booking Protocol]` section back to them, plus "Guest Notes: None" when they
 * had written nothing.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/guest-visible-note.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { extractGuestVisibleNote } from "./guest-visible-note.ts";

/** The exact shape `/book` composes on the pay-now path. */
const STAY_SETUP_WITH_PROTOCOL = [
  "[Stay Setup]",
  "Bedrooms to be used: 2 Bedrooms",
  "Estimated guests: 4",
  "Sleeping setup: 2 bedrooms prepared",
  "Guest Notes: Decorate room",
  "",
  "[Booking Protocol]",
  "System branch: Hosted checkout after booking creation",
  "Supported online protocol targets: card/debit card, Apple Pay, Google Pay when enabled by the hosted provider",
].join("\n");

const STAY_SETUP_NO_NOTES = STAY_SETUP_WITH_PROTOCOL.replace("Guest Notes: Decorate room", "Guest Notes: None");

test("the guest's own words survive, and nothing else does", () => {
  const note = extractGuestVisibleNote({ event_type: null, message: STAY_SETUP_WITH_PROTOCOL });
  assert.equal(note, "Decorate room");
});

test("a guest who wrote nothing gets no notes section at all", () => {
  assert.equal(extractGuestVisibleNote({ event_type: null, message: STAY_SETUP_NO_NOTES }), null);
});

test("no machine text can reach a guest through this function", () => {
  for (const message of [STAY_SETUP_WITH_PROTOCOL, STAY_SETUP_NO_NOTES]) {
    const note = extractGuestVisibleNote({ event_type: null, message }) ?? "";
    for (const leak of [
      "[Stay Setup]",
      "[Booking Protocol]",
      "System branch",
      "protocol targets",
      "Bedrooms to be used",
      "Estimated guests",
      "Sleeping setup",
      "Guest Notes",
      "Apple Pay",
    ]) {
      assert.ok(!note.includes(leak), `machine text "${leak}" reached the guest`);
    }
  }
});

test("a multi-line guest note keeps its lines", () => {
  const message = [
    "[Stay Setup]",
    "Bedrooms to be used: 1 Bedroom",
    "Guest Notes: Please chill the wine.",
    "We arrive late — around 23:00.",
    "",
    "[Booking Protocol]",
    "System branch: Hosted checkout after booking creation",
  ].join("\n");
  assert.equal(
    extractGuestVisibleNote({ event_type: null, message }),
    "Please chill the wine.\nWe arrive late — around 23:00.",
  );
});

test("an event inquiry gives up only its Notes line", () => {
  const message = [
    "[Event Inquiry]",
    "Event type: Wedding",
    "Notes: We would like a string quartet.",
    "[EventSetupEstimate] {\"lines\":[]}",
  ].join("\n");
  assert.equal(
    extractGuestVisibleNote({ event_type: "Wedding", message }),
    "We would like a string quartet.",
  );
});

test("an event inquiry is recognised even when the caller omits event_type", () => {
  const message = ["[Event Inquiry]", "Notes: Sunset ceremony please."].join("\n");
  assert.equal(extractGuestVisibleNote({ message }), "Sunset ceremony please.");
});

test("a legacy free-text message is the guest's own text and passes through", () => {
  assert.equal(
    extractGuestVisibleNote({ event_type: null, message: "  Could we borrow a cot?  " }),
    "Could we borrow a cot?",
  );
});

test("absent, empty and whitespace messages produce no section", () => {
  assert.equal(extractGuestVisibleNote({ message: null }), null);
  assert.equal(extractGuestVisibleNote({ message: undefined }), null);
  assert.equal(extractGuestVisibleNote({ message: "" }), null);
  assert.equal(extractGuestVisibleNote({ message: "   \n  " }), null);
});
