/**
 * Focused tests for the Phase 16C Stage 4B Arrival Guide URL builder.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   BOOKING_ACTION_SECRET=test-secret-for-unit-tests \
 *     node --experimental-strip-types --test lib/arrival-guide-link.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyViewToken } from "./booking-action-token.ts";
import { SITE_URL } from "./brand.ts";
import { buildArrivalGuideUrl } from "./arrival-guide-link.ts";

const SECRET = "test-secret-for-unit-tests-arrival-guide-link";
process.env.BOOKING_ACTION_SECRET = SECRET;
delete process.env.NEXT_PUBLIC_SITE_URL;

const BOOKING_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CHECK_OUT = "2026-08-20";
// 2026-08-20T23:59:59Z — the checkout-day expiry contract.
const EXPECTED_EXP = Math.floor(Date.parse(`${CHECK_OUT}T23:59:59Z`) / 1000);

function extractToken(url: string): string {
  const prefix = `${SITE_URL}/arrival/`;
  assert.ok(url.startsWith(prefix), `URL must start with ${prefix} (got ${url})`);
  return decodeURIComponent(url.slice(prefix.length));
}

function decodeExp(token: string): number {
  const payload = token.slice(0, token.lastIndexOf("."));
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
  return parsed.exp;
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test("confirmed eligible booking mints a canonical /arrival/<view-token> URL", () => {
  const url = buildArrivalGuideUrl(BOOKING_ID, CHECK_OUT);
  assert.ok(url !== null);
  const token = extractToken(url);

  const verified = verifyViewToken(token);
  assert.deepEqual(
    { ok: verified.ok, booking_id: verified.ok ? verified.booking_id : null },
    { ok: true, booking_id: BOOKING_ID },
  );
});

test("token expiry is checkout-day expiry (23:59:59Z on check_out)", () => {
  const url = buildArrivalGuideUrl(BOOKING_ID, CHECK_OUT);
  assert.ok(url !== null);
  assert.equal(decodeExp(extractToken(url)), EXPECTED_EXP);
});

test("booking id and check_out are trimmed before minting", () => {
  const url = buildArrivalGuideUrl(`  ${BOOKING_ID}  `, `  ${CHECK_OUT}  `);
  assert.ok(url !== null);
  const verified = verifyViewToken(extractToken(url));
  assert.ok(verified.ok && verified.booking_id === BOOKING_ID);
});

// ─── Refusals (null — never throw) ────────────────────────────────────────────

test("missing / blank booking id returns null", () => {
  assert.equal(buildArrivalGuideUrl(null, CHECK_OUT), null);
  assert.equal(buildArrivalGuideUrl(undefined, CHECK_OUT), null);
  assert.equal(buildArrivalGuideUrl("   ", CHECK_OUT), null);
});

test("missing / malformed check_out returns null", () => {
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, null), null);
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, undefined), null);
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, ""), null);
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, "2026-8-20"), null);
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, "20/08/2026"), null);
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, "not-a-date"), null);
});

test("impossible calendar date (NaN expiry) returns null", () => {
  assert.equal(buildArrivalGuideUrl(BOOKING_ID, "2026-99-99"), null);
});

test("missing BOOKING_ACTION_SECRET returns null instead of throwing", () => {
  delete process.env.BOOKING_ACTION_SECRET;
  try {
    assert.equal(buildArrivalGuideUrl(BOOKING_ID, CHECK_OUT), null);
  } finally {
    process.env.BOOKING_ACTION_SECRET = SECRET;
  }
});

// ─── Origin convention ────────────────────────────────────────────────────────

test("NEXT_PUBLIC_SITE_URL overrides the canonical origin when set", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
  try {
    const url = buildArrivalGuideUrl(BOOKING_ID, CHECK_OUT);
    assert.ok(url !== null && url.startsWith("https://preview.example.com/arrival/"));
  } finally {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  }
});

test("default origin is the canonical guest-facing SITE_URL", () => {
  const url = buildArrivalGuideUrl(BOOKING_ID, CHECK_OUT);
  assert.ok(url !== null && url.startsWith(`${SITE_URL}/arrival/`));
});
