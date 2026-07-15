/**
 * Focused tests for the booking-reference uuid range computation that backs
 * `resolveBookingByReference` (Stage 4B Preview bug fix — the previous
 * `.ilike("id::text", …)` PostgREST cast filter failed server-side).
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   node --experimental-strip-types --test lib/booking-reference-range.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { bookingReferenceUuidRange } from "./booking-reference-range.ts";

test("the failing Preview reference 0F28C563 produces the exact covering range", () => {
  assert.deepEqual(bookingReferenceUuidRange("0F28C563"), {
    gte: "0f28c563-0000-0000-0000-000000000000",
    lt: "0f28c564-0000-0000-0000-000000000000",
  });
});

test("range brackets a real uuid with that prefix (string/byte order agree)", () => {
  const range = bookingReferenceUuidRange("0F28C563");
  assert.ok(range && range.lt !== undefined);
  const sampleId = "0f28c563-9a1b-4c2d-8e3f-a4b5c6d7e8f9";
  assert.ok(sampleId >= range.gte && sampleId < range.lt);
  // Neighbouring prefixes fall outside the range.
  assert.ok("0f28c562-ffff-ffff-ffff-ffffffffffff" < range.gte);
  assert.ok("0f28c564-0000-0000-0000-000000000001" >= range.lt);
});

test("lowercase and mixed-case input normalize to the same range", () => {
  assert.deepEqual(
    bookingReferenceUuidRange("0f28c563"),
    bookingReferenceUuidRange("0F28c563"),
  );
});

test("hex carry propagates through the prefix increment", () => {
  const range = bookingReferenceUuidRange("00FFFFFF");
  assert.ok(range && range.lt === "01000000-0000-0000-0000-000000000000");
});

test("all-zero prefix has a valid range", () => {
  assert.deepEqual(bookingReferenceUuidRange("00000000"), {
    gte: "00000000-0000-0000-0000-000000000000",
    lt: "00000001-0000-0000-0000-000000000000",
  });
});

test("ffffffff prefix switches to an inclusive lte bound at the max uuid", () => {
  assert.deepEqual(bookingReferenceUuidRange("FFFFFFFF"), {
    gte: "ffffffff-0000-0000-0000-000000000000",
    lte: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  });
});

test("non-8-hex input returns null", () => {
  assert.equal(bookingReferenceUuidRange(null), null);
  assert.equal(bookingReferenceUuidRange(undefined), null);
  assert.equal(bookingReferenceUuidRange(""), null);
  assert.equal(bookingReferenceUuidRange("0F28C56"), null); // 7 chars
  assert.equal(bookingReferenceUuidRange("0F28C5631"), null); // 9 chars
  assert.equal(bookingReferenceUuidRange("0F28C56G"), null); // non-hex
  assert.equal(bookingReferenceUuidRange("0f28c563-9a1b"), null); // not pre-normalized
});
