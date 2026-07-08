/**
 * Unit tests pinning the `normalizeStayDates` behaviors the v6 WhatChimp
 * structured date ladder RELIES on (`lib/butler/normalize-dates.ts` — the
 * handler behind POST /api/butler/normalize-dates, WhatChimp integration
 * 7458, whose FIXED request body reads oraya_check_in_text /
 * oraya_check_out_text).
 *
 * The flow's assumptions, each proven here:
 *   1. A bare single date ("10 july") parses as check-in — the one-by-one
 *      ladder questions work.
 *   2. An ISO date re-parses to itself — the 7466/8101 response-mapping
 *      mirrors (extracted_text.check_in → oraya_check_in_text) let an
 *      already-extracted check-in pass through the ND body unchanged.
 *   3. The literal "null" (hashtag interpolation of an unset field) parses
 *      as NOTHING — a stale/unset mirror can never fabricate a date.
 *   4. A "to <date>" checkout reply does NOT parse — this is the documented
 *      failure that makes the flow's one structured retry necessary.
 *   5. A checkout-only answer ("11 july") combined with a held ISO check-in
 *      resolves BOTH dates — the flow's split-turn live gap, fixed by
 *      ND-first routing on Q426.
 *   6. Duration hints ("2 nights") resolve the checkout from the check-in.
 *   7. When the checkout is unclear the response still carries the parsed
 *      check_in — the basis of the flow's treat-null-as-undefined mapping
 *      analysis (both skip and ""-write semantics are safe downstream).
 *
 * No backend code is changed by the v6 ladder work — these tests pin the
 * existing contract so a future backend change that would break the flow
 * fails loudly here first.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   node --test lib/butler/normalize-dates.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeStayDates } from "./normalize-dates.ts";

// Deterministic "today" for relative-date resolution.
const REF = "2026-07-08";

test("bare single date parses as check-in (ladder one-by-one question)", () => {
  const r = normalizeStayDates({ check_in_text: "10 july", check_out_text: "11 july", reference_date: REF });
  assert.equal(r.status, "clear");
  assert.equal(r.check_in, "2026-07-10");
  assert.equal(r.check_out, "2026-07-11");
  assert.equal(r.nights, 1);
});

test("ISO check-in re-parses to itself (extracted_text mirror pass-through)", () => {
  const r = normalizeStayDates({ check_in_text: "2026-07-10", check_out_text: "2026-07-12", reference_date: REF });
  assert.equal(r.status, "clear");
  assert.equal(r.check_in, "2026-07-10");
  assert.equal(r.check_out, "2026-07-12");
  assert.equal(r.nights, 2);
});

test("the literal \"null\" (unset-field interpolation) never fabricates a date", () => {
  const r = normalizeStayDates({ check_in_text: "null", check_out_text: "null", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.check_in, null);
  assert.equal(r.check_out, null);
});

test("a \"to <date>\" checkout reply does NOT parse — the flow's structured retry exists for exactly this", () => {
  const r = normalizeStayDates({ check_in_text: "2026-07-10", check_out_text: "to 11 july", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.check_in, "2026-07-10", "the parsed check-in must be retained");
  assert.equal(r.check_out, null);
});

test("checkout-only answer + held ISO check-in resolves both dates (the split-turn live gap)", () => {
  const r = normalizeStayDates({ check_in_text: "2026-07-10", check_out_text: "11 july", reference_date: REF });
  assert.equal(r.status, "clear");
  assert.equal(r.check_in, "2026-07-10");
  assert.equal(r.check_out, "2026-07-11");
});

test("duration hint (\"2 nights\") resolves the checkout from the check-in", () => {
  const r = normalizeStayDates({ check_in_text: "10 july", check_out_text: "2 nights", reference_date: REF });
  assert.equal(r.status, "clear");
  assert.equal(r.check_in, "2026-07-10");
  assert.equal(r.check_out, "2026-07-12");
  assert.equal(r.nights, 2);
});

test("weekday check-in resolves relative to the reference date", () => {
  // 2026-07-08 is a Wednesday; "this saturday" → 2026-07-11.
  const r = normalizeStayDates({ check_in_text: "this saturday", check_out_text: "1 night", reference_date: REF });
  assert.equal(r.status, "clear");
  assert.equal(r.check_in, "2026-07-11");
  assert.equal(r.check_out, "2026-07-12");
});

test("unclear checkout still returns the parsed check_in (treat-null-as-undefined mapping analysis)", () => {
  const r = normalizeStayDates({ check_in_text: "10 july", check_out_text: "whenever works", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.check_in, "2026-07-10", "check_in must be present even when the checkout is unclear");
  assert.equal(r.check_out, null);
  assert.ok(r.safe_message.length > 0, "a guest-safe clarification message is always returned");
});

test("empty checkout text is unclear, never an invented date", () => {
  const r = normalizeStayDates({ check_in_text: "10 july", check_out_text: "", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.check_in, "2026-07-10");
  assert.equal(r.check_out, null);
});
