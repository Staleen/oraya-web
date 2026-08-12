/**
 * Which wallet buttons Unified Checkout offers.
 *
 * Runner: node --experimental-strip-types --test lib/payments/online-methods.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOnlineCheckoutMethods } from "./online-methods.ts";

const NONE = { apple_pay_enabled: false, google_pay_enabled: false, click_to_pay_enabled: false };
const ALL = { apple_pay_enabled: true, google_pay_enabled: true, click_to_pay_enabled: true };

test("today's live state: card only, because nothing is enrolled yet", () => {
  assert.deepEqual(resolveOnlineCheckoutMethods(["card"], NONE), ["card"]);
});

test("Google Pay rides with card once enrolled — no per-request setting", () => {
  assert.deepEqual(
    resolveOnlineCheckoutMethods(["card"], { ...NONE, google_pay_enabled: true }),
    ["card", "google_pay"],
  );
});

test("a card-backed wallet is never offered where card is refused", () => {
  // The operator said no card on this request. Every wallet settles AS a card,
  // so offering one would quietly overrule them.
  assert.deepEqual(resolveOnlineCheckoutMethods(["cash", "bank_transfer"], ALL), []);
});

test("Apple Pay rides with card too — the operator never picks it", () => {
  // Live dead end 2026-08-12: a link created with ["apple_pay"] and no card
  // showed the guest "Secure card payment is not available for this request".
  assert.deepEqual(
    resolveOnlineCheckoutMethods(["card"], { ...NONE, apple_pay_enabled: true }),
    ["card", "apple_pay"],
  );
});

test("a legacy apple_pay-only request offers nothing — there is no card behind it", () => {
  // Honest rather than convenient: inventing a card rail the operator did not
  // grant would be worse than refusing. The Ops selector no longer lets this
  // combination be created.
  assert.deepEqual(resolveOnlineCheckoutMethods(["apple_pay"], ALL), []);
});

test("a legacy request carrying both card and apple_pay still works", () => {
  assert.deepEqual(
    resolveOnlineCheckoutMethods(["card", "apple_pay"], { ...NONE, apple_pay_enabled: true }),
    ["card", "apple_pay"],
  );
});

test("a wallet not enrolled is simply absent, never assumed", () => {
  assert.deepEqual(resolveOnlineCheckoutMethods(["card", "apple_pay"], NONE), ["card"]);
});

test("card leads, because it is the only button every guest can use", () => {
  assert.deepEqual(resolveOnlineCheckoutMethods(["card", "apple_pay"], ALL), [
    "card", "apple_pay", "google_pay", "click_to_pay",
  ]);
});

test("no allowed methods produces nothing rather than a default", () => {
  assert.deepEqual(resolveOnlineCheckoutMethods([], ALL), []);
});

/**
 * Which wallet buttons actually reach a guest also depends on their device:
 * Apple Pay renders only in Safari on Apple hardware, Google Pay only where
 * Google supports it. Enrolment decides what Oraya REQUESTS; the device
 * decides what appears. Both were confirmed live on 2026-08-12 — Google Pay
 * rendered in desktop Chrome, Apple Pay did not, which is correct.
 */
test("a card request with both wallets enrolled asks for all three", () => {
  assert.deepEqual(
    resolveOnlineCheckoutMethods(["card"], {
      apple_pay_enabled: true,
      google_pay_enabled: true,
      click_to_pay_enabled: false,
    }),
    ["card", "apple_pay", "google_pay"],
  );
});
