/**
 * Remediation 5.3 — Butler prefill hydration decisions (extracted from /book).
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking/butler-prefill-hydration.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nextBedroomCountAfterPrefill,
  nextFullNameAfterPrefill,
  nextSleepingGuestsAfterPrefill,
  nextVillaAfterPrefill,
} from "./butler-prefill-hydration.ts";

const VILLAS = ["Villa Mechmech", "Villa Byblos"] as const;

test("villa: fills empty selection, overrides only a query-param pick, never a manual pick", () => {
  assert.equal(
    nextVillaAfterPrefill({
      currentVilla: "",
      normalizedPrefillVilla: "Villa Byblos",
      queryVilla: null,
      knownVillas: VILLAS,
    }),
    "Villa Byblos",
  );
  // current pick came from ?villa= → prefill may override
  assert.equal(
    nextVillaAfterPrefill({
      currentVilla: "Villa Mechmech",
      normalizedPrefillVilla: "Villa Byblos",
      queryVilla: "Villa Mechmech",
      knownVillas: VILLAS,
    }),
    "Villa Byblos",
  );
  // manual pick (no query param) → keep
  assert.equal(
    nextVillaAfterPrefill({
      currentVilla: "Villa Mechmech",
      normalizedPrefillVilla: "Villa Byblos",
      queryVilla: null,
      knownVillas: VILLAS,
    }),
    null,
  );
  // unknown villa → no-op
  assert.equal(
    nextVillaAfterPrefill({
      currentVilla: "",
      normalizedPrefillVilla: "Villa Nowhere",
      queryVilla: null,
      knownVillas: VILLAS,
    }),
    null,
  );
});

test("sleeping guests: only the untouched default or empty field is filled", () => {
  assert.equal(nextSleepingGuestsAfterPrefill("2", { sleeping_guests: "5" }), "5");
  assert.equal(nextSleepingGuestsAfterPrefill("", { sleeping_guests: "5" }), "5");
  assert.equal(nextSleepingGuestsAfterPrefill("4", { sleeping_guests: "5" }), null);
  assert.equal(nextSleepingGuestsAfterPrefill("2", {}), null);
});

test("bedrooms: explicit prefill wins; otherwise derived from guest count; manual pick kept", () => {
  assert.equal(nextBedroomCountAfterPrefill("1", { bedroom_count: "3" }), "3");
  assert.equal(nextBedroomCountAfterPrefill("2", { bedroom_count: "3" }), null); // manual pick
  assert.equal(nextBedroomCountAfterPrefill("1", { sleeping_guests: "2" }), "1");
  assert.equal(nextBedroomCountAfterPrefill("1", { sleeping_guests: "4" }), "2");
  assert.equal(nextBedroomCountAfterPrefill("1", { sleeping_guests: "6" }), "3");
  assert.equal(nextBedroomCountAfterPrefill("1", { bedroom_count: "9" }), null); // invalid + no guests
});

test("full name: only fills an empty field", () => {
  assert.equal(nextFullNameAfterPrefill("", { full_name: "Rana K" }), "Rana K");
  assert.equal(nextFullNameAfterPrefill("  ", { full_name: "Rana K" }), "Rana K");
  assert.equal(nextFullNameAfterPrefill("Existing Name", { full_name: "Rana K" }), null);
  assert.equal(nextFullNameAfterPrefill("", {}), null);
});
