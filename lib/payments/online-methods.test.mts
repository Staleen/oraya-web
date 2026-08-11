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
  // The operator said no card on this request. Google Pay settles AS a card,
  // so offering it would quietly overrule them.
  assert.deepEqual(resolveOnlineCheckoutMethods(["cash", "bank_transfer"], ALL), []);
  assert.deepEqual(resolveOnlineCheckoutMethods(["apple_pay"], ALL), ["apple_pay"]);
});

test("Apple Pay still needs to be asked for — it is a ledger method of its own", () => {
  assert.deepEqual(
    resolveOnlineCheckoutMethods(["card"], { ...NONE, apple_pay_enabled: true }),
    ["card"],
  );
  assert.deepEqual(
    resolveOnlineCheckoutMethods(["card", "apple_pay"], { ...NONE, apple_pay_enabled: true }),
    ["card", "apple_pay"],
  );
});

test("a wallet requested but not enrolled is simply absent, never assumed", () => {
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
