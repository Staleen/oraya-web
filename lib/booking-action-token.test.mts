/**
 * Remediation 3.2 — signed booking action/view tokens: expiry, tamper,
 * wrong-purpose. Import-only coverage of the locked helper (no behavior
 * change).
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking-action-token.test.mts
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.BOOKING_ACTION_SECRET = "test-secret-for-action-tokens";

const { createActionToken, verifyActionToken, verifyViewToken } = await import(
  "./booking-action-token.ts"
);

const BOOKING_ID = "9d2f78a1-1111-2222-3333-444455556666";

before(() => {
  process.env.BOOKING_ACTION_SECRET = "test-secret-for-action-tokens";
});

test("round trip: confirmed token verifies with matching claims", () => {
  const { token, jti, exp } = createActionToken(BOOKING_ID, "confirmed");
  const v = verifyActionToken(token);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.booking_id, BOOKING_ID);
  assert.equal(v.action, "confirmed");
  assert.equal(v.jti, jti);
  assert.ok(exp > Math.floor(Date.now() / 1000));
});

test("expiry: a token whose expiresAt is in the past verifies as expired", () => {
  const { token } = createActionToken(BOOKING_ID, "cancelled", {
    expiresAt: Math.floor(Date.now() / 1000) - 60,
  });
  assert.deepEqual(verifyActionToken(token), { ok: false, reason: "expired" });
});

test("tamper: modifying the payload or signature invalidates the token", () => {
  const { token } = createActionToken(BOOKING_ID, "confirmed");
  const [payload, sig] = token.split(".");

  // Payload swapped for a different booking id, original signature kept.
  const forgedPayload = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      booking_id: "00000000-0000-0000-0000-000000000000",
    }),
  ).toString("base64url");
  assert.equal(verifyActionToken(`${forgedPayload}.${sig}`).ok, false);

  // Signature bit-flipped.
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifyActionToken(`${payload}.${flipped}`).ok, false);

  // Garbage.
  assert.equal(verifyActionToken("not-a-token").ok, false);
  assert.equal(verifyActionToken("").ok, false);
});

test("wrong purpose: view tokens are rejected by verifyActionToken and vice versa", () => {
  const { token: viewToken } = createActionToken(BOOKING_ID, "view");
  assert.deepEqual(verifyActionToken(viewToken), { ok: false, reason: "invalid" });

  const { token: confirmToken } = createActionToken(BOOKING_ID, "confirmed");
  assert.deepEqual(verifyViewToken(confirmToken), { ok: false, reason: "invalid" });

  const v = verifyViewToken(viewToken);
  assert.ok(v.ok && v.booking_id === BOOKING_ID);
});

test("tokens signed with a different secret do not verify", () => {
  const { token } = createActionToken(BOOKING_ID, "confirmed");
  process.env.BOOKING_ACTION_SECRET = "a-rotated-secret";
  try {
    assert.equal(verifyActionToken(token).ok, false);
  } finally {
    process.env.BOOKING_ACTION_SECRET = "test-secret-for-action-tokens";
  }
});
