/**
 * Remediation 3.2 — butler prefill tokens: expiry, tamper, wrong-purpose.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/butler/prefill-token.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.BUTLER_PREFILL_SECRET = "test-secret-for-prefill-tokens";

const { canIssuePrefillToken, createPrefillToken, verifyPrefillToken } = await import(
  "./prefill-token.ts"
);

const LEAD_ID = "lead-1234";
const NOW = 1_800_000_000;

test("round trip: claims survive and carry the prefill purpose", () => {
  const token = createPrefillToken(LEAD_ID, NOW);
  const v = verifyPrefillToken(token, NOW + 60);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.claims.lead_id, LEAD_ID);
  assert.equal(v.claims.purpose, "prefill");
  assert.equal(v.claims.v, 1);
  assert.equal(v.claims.exp, NOW + 2 * 60 * 60);
});

test("expiry: token is valid just before exp and expired at/after exp", () => {
  const token = createPrefillToken(LEAD_ID, NOW);
  assert.equal(verifyPrefillToken(token, NOW + 2 * 60 * 60 - 1).ok, true);
  assert.deepEqual(verifyPrefillToken(token, NOW + 2 * 60 * 60 + 1), {
    ok: false,
    reason: "expired",
  });
});

test("tamper: altered payload or signature is invalid", () => {
  const token = createPrefillToken(LEAD_ID, NOW);
  const [payload, sig] = token.split(".");

  const forged = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      lead_id: "someone-elses-lead",
    }),
  ).toString("base64url");
  assert.equal(verifyPrefillToken(`${forged}.${sig}`, NOW).ok, false);

  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifyPrefillToken(`${payload}.${flipped}`, NOW).ok, false);

  assert.equal(verifyPrefillToken(`${payload}.${sig}.extra`, NOW).ok, false);
  assert.equal(verifyPrefillToken("", NOW).ok, false);
});

test("wrong purpose/version: claims with a different purpose are rejected", () => {
  // Hand-craft a token signed with the right secret but purpose != prefill.
  const claims = { lead_id: LEAD_ID, exp: NOW + 3600, jti: "j", v: 1, purpose: "other" };
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", "test-secret-for-prefill-tokens")
    .update(payloadB64)
    .digest("base64url");
  assert.equal(verifyPrefillToken(`${payloadB64}.${sig}`, NOW).ok, false);
});

test("missing secret: cannot issue, and verification fails closed", () => {
  const original = process.env.BUTLER_PREFILL_SECRET;
  const token = createPrefillToken(LEAD_ID, NOW);
  delete process.env.BUTLER_PREFILL_SECRET;
  try {
    assert.equal(canIssuePrefillToken(), false);
    assert.equal(verifyPrefillToken(token, NOW).ok, false);
    assert.throws(() => createPrefillToken(LEAD_ID, NOW));
  } finally {
    process.env.BUTLER_PREFILL_SECRET = original;
  }
});
