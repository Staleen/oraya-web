/**
 * KNOWN_BUGS #27.3 — "Instant confirmation available for eligible stays" was
 * rendered to every guest while `instant_booking_auto_confirm` was off, so it
 * was true for nobody.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking/instant-promise.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { canPromiseInstantConfirmation, type AutoConfirmSwitch } from "./instant-promise.ts";

const ELIGIBLE = { villaInstantEnabled: true, stayEligible: true };

test("the line is absent when the master switch is off", () => {
  assert.equal(canPromiseInstantConfirmation({ autoConfirmEnabled: false, ...ELIGIBLE }), false);
});

test("the line is absent when the switch cannot be read", () => {
  // /book cannot read instant_booking_auto_confirm today. Unknown means silent —
  // guessing is how the promise got made to nobody in the first place.
  assert.equal(canPromiseInstantConfirmation({ autoConfirmEnabled: "unknown", ...ELIGIBLE }), false);
});

test("the line is absent when this villa is not an instant villa", () => {
  assert.equal(
    canPromiseInstantConfirmation({ autoConfirmEnabled: true, villaInstantEnabled: false, stayEligible: true }),
    false,
  );
});

test("the line is absent when the stay itself is not eligible", () => {
  // Add-ons needing approval, a calendar conflict, or no dates yet.
  assert.equal(
    canPromiseInstantConfirmation({ autoConfirmEnabled: true, villaInstantEnabled: true, stayEligible: false }),
    false,
  );
});

test("the line appears only when all three are true", () => {
  assert.equal(canPromiseInstantConfirmation({ autoConfirmEnabled: true, ...ELIGIBLE }), true);
});

test("no single condition can carry the promise on its own", () => {
  const switches: AutoConfirmSwitch[] = [true, false, "unknown"];
  for (const autoConfirmEnabled of switches) {
    for (const villaInstantEnabled of [true, false]) {
      for (const stayEligible of [true, false]) {
        const allowed = canPromiseInstantConfirmation({ autoConfirmEnabled, villaInstantEnabled, stayEligible });
        const expected = autoConfirmEnabled === true && villaInstantEnabled && stayEligible;
        assert.equal(
          allowed,
          expected,
          `promise=${allowed} for master=${String(autoConfirmEnabled)} villa=${villaInstantEnabled} stay=${stayEligible}`,
        );
      }
    }
  }
});
