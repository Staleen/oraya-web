/**
 * `/book` guest-path audit, 2026-08-12: a guest asked to pay, checkout could
 * not be opened, and nobody was told.
 *
 * Runner: node --experimental-strip-types --test lib/payments/checkout-setup-alert.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckoutSetupFailureAlert,
  shouldAlertOperatorOnCheckoutSetupFailure,
} from "./checkout-setup-alert.ts";

test("server-side failures alert; correct refusals do not", () => {
  assert.equal(shouldAlertOperatorOnCheckoutSetupFailure(503), true);
  assert.equal(shouldAlertOperatorOnCheckoutSetupFailure(500), true);
  // "already paid in full" and "cancelled bookings cannot be paid" are right answers.
  assert.equal(shouldAlertOperatorOnCheckoutSetupFailure(400), false);
  assert.equal(shouldAlertOperatorOnCheckoutSetupFailure(401), false);
  assert.equal(shouldAlertOperatorOnCheckoutSetupFailure(404), false);
  assert.equal(shouldAlertOperatorOnCheckoutSetupFailure(Number.NaN), false);
});

test("the alert names the guest, the money, and the promise already made to them", () => {
  const alert = buildCheckoutSetupFailureAlert({
    stage: "provider_unavailable",
    booking_reference: "ORY-1234",
    guest_name: "Mira Khalaf",
    amount: 270,
    currency: "USD",
  });
  assert.match(alert.subject, /ORY-1234/);
  assert.match(alert.lines[0], /Mira Khalaf/);
  assert.match(alert.lines[0], /USD 270\.00/);
  assert.match(alert.lines.join(" "), /Send them one\./);
});

test("the alert always states that no money was taken", () => {
  for (const stage of [
    "provider_unavailable",
    "session_not_created",
    "request_not_created",
    "booking_not_updated",
    "unexpected_error",
  ] as const) {
    const alert = buildCheckoutSetupFailureAlert({
      stage,
      booking_reference: null,
      guest_name: null,
      amount: null,
      currency: null,
    });
    assert.match(alert.lines.join(" "), /No money was taken\./);
  }
});

test("a missing amount is omitted rather than printed as zero", () => {
  const alert = buildCheckoutSetupFailureAlert({
    stage: "session_not_created",
    booking_reference: null,
    guest_name: null,
    amount: 0,
    currency: "USD",
  });
  assert.doesNotMatch(alert.lines[0], /0\.00/);
  assert.match(alert.lines[0], /A guest tried to pay and/);
});
