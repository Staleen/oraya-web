/**
 * Unit tests for `lib/butler/extract-stay-intent.ts`.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * No new dependencies. `.mts` so Node's TypeScript type-stripping loader
 * runs it as ESM and the file can `import` the `.ts` helper directly.
 *
 * Run from repo root:
 *   node --test lib/butler/extract-stay-intent.test.mts
 *
 * Reference date is pinned to `2026-06-05` in every test that relies on
 * relative resolution ("this Saturday", "next Saturday"), so results are
 * deterministic regardless of when the suite runs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { extractStayIntent } from "./extract-stay-intent.ts";

const REF = "2026-06-05"; // Friday, June 5, 2026

// ─── Combined-message extraction (the headline cases from Phase 16A audit) ─

test("clear: 'June 10 to June 15'", () => {
  const r = extractStayIntent({ stay_text: "June 10 to June 15", reference_date: REF });
  assert.equal(r.extracted.check_in,  "2026-06-10");
  assert.equal(r.extracted.check_out, "2026-06-15");
  assert.equal(r.extracted.nights, 5);
  assert.equal(r.status, "partial");
  assert.ok(r.missing_fields.includes("villa"));
  assert.ok(r.missing_fields.includes("guest_count"));
});

test("clear: 'June 10 till June 15 for 4 people'", () => {
  const r = extractStayIntent({
    stay_text: "June 10 till June 15 for 4 people",
    reference_date: REF,
  });
  assert.equal(r.extracted.check_in,    "2026-06-10");
  assert.equal(r.extracted.check_out,   "2026-06-15");
  assert.equal(r.extracted.nights,      5);
  assert.equal(r.extracted.guest_count, 4);
  assert.equal(r.extracted.villa,       null);
  assert.equal(r.status, "partial");
  assert.deepEqual(r.missing_fields, ["villa"]);
});

test("clear: 'I want Mechmech from June 10 to 15, 3 adults'", () => {
  const r = extractStayIntent({
    stay_text: "I want Mechmech from June 10 to 15, 3 adults",
    reference_date: REF,
  });
  assert.equal(r.extracted.check_in,    "2026-06-10");
  assert.equal(r.extracted.check_out,   "2026-06-15");
  assert.equal(r.extracted.nights,      5);
  assert.equal(r.extracted.villa,       "Villa Mechmech");
  assert.equal(r.extracted.guest_count, 3);
  assert.equal(r.status, "clear");
  assert.deepEqual(r.missing_fields, []);
});

test("clear: '10 June for 3 nights'", () => {
  const r = extractStayIntent({ stay_text: "10 June for 3 nights", reference_date: REF });
  assert.equal(r.extracted.check_in,  "2026-06-10");
  assert.equal(r.extracted.check_out, "2026-06-13");
  assert.equal(r.extracted.nights,    3);
});

test("clear: 'Book Byblos for 5 people next Saturday to Monday'", () => {
  const r = extractStayIntent({
    stay_text: "Book Byblos for 5 people next Saturday to Monday",
    reference_date: REF, // Fri 2026-06-05; next Sat = 2026-06-13; following Mon = 2026-06-15
  });
  assert.equal(r.extracted.check_in,    "2026-06-13");
  assert.equal(r.extracted.check_out,   "2026-06-15");
  assert.equal(r.extracted.nights,      2);
  assert.equal(r.extracted.villa,       "Villa Byblos");
  assert.equal(r.extracted.guest_count, 5);
  assert.equal(r.status, "clear");
});

// ─── Villa detection ───────────────────────────────────────────────────────

test("villa: 'Villa Mechmech' canonical", () => {
  const r = extractStayIntent({ stay_text: "villa mechmech June 10 to 15", reference_date: REF });
  assert.equal(r.extracted.villa, "Villa Mechmech");
});

test("villa: bare 'byblos' alias", () => {
  const r = extractStayIntent({ stay_text: "byblos June 10 to 15", reference_date: REF });
  assert.equal(r.extracted.villa, "Villa Byblos");
});

test("villa: 'Annaya' alias resolves to Mechmech", () => {
  const r = extractStayIntent({ stay_text: "Annaya June 10 to 15", reference_date: REF });
  assert.equal(r.extracted.villa, "Villa Mechmech");
});

test("villa: 'Jbeil' alias resolves to Byblos", () => {
  const r = extractStayIntent({ stay_text: "Jbeil June 10 to 15", reference_date: REF });
  assert.equal(r.extracted.villa, "Villa Byblos");
});

test("villa: unknown villa name leaves villa null", () => {
  const r = extractStayIntent({ stay_text: "Tripoli villa June 10 to 15", reference_date: REF });
  assert.equal(r.extracted.villa, null);
  assert.ok(r.missing_fields.includes("villa"));
});

// ─── Guest-count detection ─────────────────────────────────────────────────

test("guest_count: '2 guests'", () => {
  const r = extractStayIntent({ stay_text: "Mechmech June 10 to 15, 2 guests", reference_date: REF });
  assert.equal(r.extracted.guest_count, 2);
});

test("guest_count: 'we are 6'", () => {
  const r = extractStayIntent({ stay_text: "Byblos June 10 to 15 we are 6", reference_date: REF });
  assert.equal(r.extracted.guest_count, 6);
});

test("guest_count: 'group of 4'", () => {
  const r = extractStayIntent({ stay_text: "Mechmech June 10 to 15, group of 4", reference_date: REF });
  assert.equal(r.extracted.guest_count, 4);
});

test("guest_count: number word 'three guests'", () => {
  const r = extractStayIntent({ stay_text: "Mechmech June 10 to 15, three guests", reference_date: REF });
  assert.equal(r.extracted.guest_count, 3);
});

test("guest_count: must NOT collide with 'for 3 nights' duration", () => {
  const r = extractStayIntent({ stay_text: "Mechmech 10 June for 3 nights", reference_date: REF });
  assert.equal(r.extracted.guest_count, null);
  assert.equal(r.extracted.check_in,  "2026-06-10");
  assert.equal(r.extracted.check_out, "2026-06-13");
  assert.equal(r.extracted.nights,    3);
});

// ─── Hyphen day-range normalization ────────────────────────────────────────

test("range: 'Jun 10-15' parses as June 10 to June 15", () => {
  const r = extractStayIntent({ stay_text: "Jun 10-15 Mechmech 2 guests", reference_date: REF });
  assert.equal(r.extracted.check_in,  "2026-06-10");
  assert.equal(r.extracted.check_out, "2026-06-15");
});

test("range: ISO date '2026-06-10' is NOT mangled by hyphen rule", () => {
  const r = extractStayIntent({ stay_text: "2026-06-10 to 2026-06-15", reference_date: REF });
  assert.equal(r.extracted.check_in,  "2026-06-10");
  assert.equal(r.extracted.check_out, "2026-06-15");
});

// ─── Partial / unclear paths ───────────────────────────────────────────────

test("partial: only check-in known → missing check_out/villa/guest_count", () => {
  const r = extractStayIntent({ stay_text: "June 10 Mechmech", reference_date: REF });
  assert.equal(r.extracted.check_in,  "2026-06-10");
  assert.equal(r.extracted.check_out, null);
  assert.equal(r.extracted.villa,     "Villa Mechmech");
  assert.equal(r.status, "partial");
  assert.deepEqual(r.missing_fields, ["check_out", "guest_count"]);
});

test("unclear: empty stay_text", () => {
  const r = extractStayIntent({ stay_text: "   ", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.extracted.check_in, null);
  assert.equal(r.extracted.check_out, null);
  assert.deepEqual(r.missing_fields, ["check_in", "check_out", "villa", "guest_count"]);
});

test("unclear: unparseable text", () => {
  const r = extractStayIntent({ stay_text: "hello can you help me", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.extracted.check_in, null);
});

test("unclear: villa + guest count but no dates", () => {
  const r = extractStayIntent({ stay_text: "Mechmech for 3 people", reference_date: REF });
  assert.equal(r.status, "unclear");
  assert.equal(r.extracted.check_in,    null);
  assert.equal(r.extracted.villa,       "Villa Mechmech");
  assert.equal(r.extracted.guest_count, 3);
});

// ─── Safe message + confirm prompt ─────────────────────────────────────────

test("safe_message: 'clear' status is a confirmation question", () => {
  const r = extractStayIntent({
    stay_text: "Mechmech June 10 to 15 for 3 people",
    reference_date: REF,
  });
  assert.equal(r.status, "clear");
  assert.match(r.safe_message, /I have you down for/);
  assert.match(r.safe_message, /Should I share this with Oraya/);
});

test("safe_message: 'partial' single-field ask is targeted", () => {
  const r = extractStayIntent({
    stay_text: "June 10 to 15 Mechmech",
    reference_date: REF,
  });
  assert.equal(r.status, "partial");
  assert.deepEqual(r.missing_fields, ["guest_count"]);
  assert.match(r.safe_message, /number of guests/);
});

test("safe_message: 'partial' multi-field ask joins with 'and'", () => {
  const r = extractStayIntent({
    stay_text: "June 10 to June 15",
    reference_date: REF,
  });
  assert.equal(r.status, "partial");
  assert.match(r.safe_message, /preferred villa.*and.*number of guests/);
});

test("confirm_prompt is always present", () => {
  const r = extractStayIntent({ stay_text: "June 10 to 15", reference_date: REF });
  assert.equal(r.confirm_prompt, "Please confirm before I share this with Oraya.");
});

// ─── Discipline: never throws, never blows up on hostile input ─────────────

test("safety: extremely long input does not throw", () => {
  const text = "Mechmech ".repeat(80) + "June 10 to 15";
  assert.doesNotThrow(() => extractStayIntent({ stay_text: text, reference_date: REF }));
});

test("safety: emoji / unicode passes through cleanly", () => {
  const r = extractStayIntent({
    stay_text: "🌿 Mechmech 🌅 June 10 → June 15 for 4 people 🎉",
    reference_date: REF,
  });
  assert.equal(r.extracted.check_in,    "2026-06-10");
  assert.equal(r.extracted.check_out,   "2026-06-15");
  assert.equal(r.extracted.villa,       "Villa Mechmech");
  assert.equal(r.extracted.guest_count, 4);
});

test("safety: non-string stay_text returns unclear, not a throw", () => {
  // @ts-expect-error — exercising defensive code path
  const r = extractStayIntent({ stay_text: 12345, reference_date: REF });
  assert.equal(r.status, "unclear");
});

test("safety: missing reference_date uses server 'today' without throwing", () => {
  assert.doesNotThrow(() =>
    extractStayIntent({ stay_text: "June 10 to June 15" }),
  );
});

// ─── ISO check-in path ─────────────────────────────────────────────────────

test("iso: 'check in 2026-06-10 check out 2026-06-15 Mechmech 2 guests'", () => {
  const r = extractStayIntent({
    stay_text: "check in 2026-06-10 check out 2026-06-15 Mechmech 2 guests",
    reference_date: REF,
  });
  assert.equal(r.extracted.check_in,    "2026-06-10");
  assert.equal(r.extracted.check_out,   "2026-06-15");
  assert.equal(r.extracted.villa,       "Villa Mechmech");
  assert.equal(r.extracted.guest_count, 2);
});

// ─── No-double-extraction guarantee ────────────────────────────────────────

test("'for 5 people' is consumed by guest count, not by date parser", () => {
  const r = extractStayIntent({
    stay_text: "Mechmech June 10 to 15 for 5 people",
    reference_date: REF,
  });
  assert.equal(r.extracted.guest_count, 5);
  // Crucially: check-out is still June 15, not nights=5 from a misread.
  assert.equal(r.extracted.check_out, "2026-06-15");
  assert.equal(r.extracted.nights,    5);
});

// ─── extracted_text (stale-field-safe string mirror, Phase 16A v6 flow) ────

test("extracted_text mirrors extracted with literal \"null\" strings for missing fields", () => {
  const r = extractStayIntent({
    stay_text: "Villa Byblos please",
    reference_date: REF,
  });
  assert.equal(r.extracted_text.villa,       "Villa Byblos");
  assert.equal(r.extracted_text.check_in,    "null");
  assert.equal(r.extracted_text.check_out,   "null");
  assert.equal(r.extracted_text.nights,      "null");
  assert.equal(r.extracted_text.guest_count, "null");
});

test("extracted_text carries every populated field as a plain string", () => {
  const r = extractStayIntent({
    stay_text: "Mechmech June 10 to June 15 for 3 guests",
    reference_date: REF,
  });
  assert.equal(r.extracted_text.check_in,    "2026-06-10");
  assert.equal(r.extracted_text.check_out,   "2026-06-15");
  assert.equal(r.extracted_text.nights,      "5");
  assert.equal(r.extracted_text.villa,       "Villa Mechmech");
  assert.equal(r.extracted_text.guest_count, "3");
});

test("extracted_text is never null-valued on the unclear path (overwrite guarantee)", () => {
  const r = extractStayIntent({ stay_text: "?????", reference_date: REF });
  for (const value of Object.values(r.extracted_text)) {
    assert.equal(typeof value, "string");
    assert.notEqual(value, "");
  }
});

test("extracted_text.guest_followup is always the literal \"null\" reset value", () => {
  for (const text of [
    "Villa Mechmech June 10 to June 15 for 3 guests",
    "we are 12 people",
    "?????",
  ]) {
    const r = extractStayIntent({ stay_text: text, reference_date: REF });
    assert.equal(r.extracted_text.guest_followup, "null");
  }
});
