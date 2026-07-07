/**
 * Unit tests for the dates-pending WhatsApp lead contract
 * (`lib/butler/leads.ts` + `lib/butler/prefill-token.ts`).
 *
 * The v6 WhatChimp flow submits a lead even when the guest's dates could not
 * be read (failed final retry): the date custom fields then hold the literal
 * string "null". These tests prove the backend contract the flow relies on:
 *
 *   1. `normalizeLeadInput` accepts such a payload, stores NO date (never the
 *      "null" string) in the normalized date columns, and keeps the guest
 *      count / bedrooms / villa intact (bedrooms land in raw_payload).
 *   2. The prefill token — the basis of the secure `prefill_url` returned by
 *      POST /api/butler/lead — is minted from the lead id alone, so absent
 *      dates never block the secure website handoff. `/book` then lets the
 *      guest choose the dates.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   node --test lib/butler/leads-absent-dates.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeLeadInput } from "./leads.ts";
import { canIssuePrefillToken, createPrefillToken, verifyPrefillToken } from "./prefill-token.ts";

// The exact shape the dates-pending flow submits: hashtag interpolation
// yields the literal "null" for the unresolved date fields.
const DATES_PENDING_BODY = {
  source: "whatchimp",
  oraya_villa: "Villa Mechmech",
  oraya_check_in: "null",
  oraya_check_out: "null",
  oraya_guest_count: "4",
  oraya_bedroom_count: "2 bedrooms",
  oraya_guest_followup: "null",
  oraya_subscriber_id: "123456",
  raw_payload: {
    oraya_check_in: "null",
    oraya_check_out: "null",
    oraya_bedroom_count: "2 bedrooms",
  },
};

test('normalizeLeadInput: literal "null" date strings normalize to NO date, never the string', () => {
  const row = normalizeLeadInput(DATES_PENDING_BODY);
  assert.ok(row, "a dates-pending payload must normalize to an insertable row");
  assert.equal(row.normalized_check_in, null);
  assert.equal(row.normalized_check_out, null);
  // the rest of the request survives intact
  assert.equal(row.villa, "Villa Mechmech");
  assert.equal(row.guest_count, "4");
  assert.equal((row.raw_payload as Record<string, unknown>).oraya_bedroom_count, "2 bedrooms");
});

test("normalizeLeadInput: one resolved + one unresolved date stores NO date range (no misleading half-range)", () => {
  const row = normalizeLeadInput({
    ...DATES_PENDING_BODY,
    oraya_check_in: "2026-07-10",
    raw_payload: { ...DATES_PENDING_BODY.raw_payload, oraya_check_in: "2026-07-10" },
  });
  assert.ok(row);
  // sanitizeNormalizedDateRange requires a coherent pair; a check-in without
  // a check-out must not persist as a range the prefill would then surface
  assert.equal(row.normalized_check_out, null);
  if (row.normalized_check_in !== null) {
    assert.equal(row.normalized_check_in, "2026-07-10");
  }
});

test("normalizeLeadInput: fully-dated payloads still normalize both dates", () => {
  const row = normalizeLeadInput({
    ...DATES_PENDING_BODY,
    oraya_check_in: "2026-07-10",
    oraya_check_out: "2026-07-12",
  });
  assert.ok(row);
  assert.equal(row.normalized_check_in, "2026-07-10");
  assert.equal(row.normalized_check_out, "2026-07-12");
});

test("prefill token: minted from the lead id alone — absent dates never block the secure handoff", () => {
  const prev = process.env.BUTLER_PREFILL_SECRET;
  process.env.BUTLER_PREFILL_SECRET = "test-secret-for-dates-pending-check";
  try {
    assert.equal(canIssuePrefillToken(), true);
    const leadId = "3f9c2f0a-6a4b-4a58-9d2e-2f22cf9a7f11";
    const token = createPrefillToken(leadId);
    assert.ok(token.length > 0);
    const verified = verifyPrefillToken(token);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.equal(verified.claims.lead_id, leadId);
  } finally {
    if (prev === undefined) delete process.env.BUTLER_PREFILL_SECRET;
    else process.env.BUTLER_PREFILL_SECRET = prev;
  }
});
