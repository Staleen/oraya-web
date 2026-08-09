/**
 * Owner recovery tokens for /ops.
 *
 * The property that matters most here is cross-system isolation: /ops and
 * /admin recovery tokens are signed with the SAME secret, so only the purpose
 * claim stops one from resetting the other. That is tested in both directions.
 *
 * Runner: node --experimental-strip-types --test lib/ops-recovery.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createOpsRecoveryToken,
  verifyOpsRecoveryToken,
  decideOpsRecoveryReset,
  OPS_RECOVERY_TOKEN_TTL_SECONDS,
} from "./ops-recovery.ts";
import { createAdminRecoveryToken, verifyAdminRecoveryToken } from "./admin-recovery.ts";

const SECRET = "test-secret-value-not-a-real-one";

test("a freshly minted ops token verifies and carries its jti", () => {
  const { token, jti } = createOpsRecoveryToken(SECRET);
  const v = verifyOpsRecoveryToken(token, SECRET);
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.jti, jti);
});

test("an ops token cannot reset the admin password", () => {
  const { token } = createOpsRecoveryToken(SECRET);
  const v = verifyAdminRecoveryToken(token, SECRET);
  assert.equal(v.ok, false, "admin verifier must reject an ops-purpose token");
});

test("an admin token cannot reset an ops owner", () => {
  const { token } = createAdminRecoveryToken(SECRET);
  const v = verifyOpsRecoveryToken(token, SECRET);
  assert.equal(v.ok, false, "ops verifier must reject an admin-purpose token");
});

test("a token signed with a different secret is rejected", () => {
  const { token } = createOpsRecoveryToken(SECRET);
  assert.equal(verifyOpsRecoveryToken(token, "some-other-secret").ok, false);
});

test("a tampered payload is rejected", () => {
  const { token } = createOpsRecoveryToken(SECRET);
  const [, sig] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ purpose: "ops_recovery", exp: 9999999999, jti: "forged" }),
    "utf8",
  ).toString("base64url");
  assert.equal(verifyOpsRecoveryToken(`${forged}.${sig}`, SECRET).ok, false);
});

test("an expired token is rejected as expired, not as invalid", () => {
  const now = Math.floor(Date.now() / 1000);
  const { token } = createOpsRecoveryToken(SECRET, now - OPS_RECOVERY_TOKEN_TTL_SECONDS - 60);
  const v = verifyOpsRecoveryToken(token, SECRET, now);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "expired");
});

test("malformed tokens are rejected without throwing", () => {
  for (const bad of ["", "   ", "no-dot", "a.b.c", "...", "!!!.???"]) {
    assert.equal(verifyOpsRecoveryToken(bad, SECRET).ok, false, `should reject: ${JSON.stringify(bad)}`);
  }
});

test("a spent jti cannot be reused", () => {
  const { token, jti } = createOpsRecoveryToken(SECRET);
  const verification = verifyOpsRecoveryToken(token, SECRET);

  const first = decideOpsRecoveryReset({
    verification, storedJti: jti,
    newPassword: "a-long-enough-password", confirmPassword: "a-long-enough-password",
  });
  assert.equal(first.outcome, "ok");

  // After the jti row is claimed it is cleared, so the same token dies.
  const second = decideOpsRecoveryReset({
    verification, storedJti: "",
    newPassword: "a-long-enough-password", confirmPassword: "a-long-enough-password",
  });
  assert.equal(second.outcome, "invalid_token");
});

test("a superseded token dies when a newer one is minted", () => {
  const older = createOpsRecoveryToken(SECRET);
  const newer = createOpsRecoveryToken(SECRET);
  const decision = decideOpsRecoveryReset({
    verification: verifyOpsRecoveryToken(older.token, SECRET),
    storedJti: newer.jti,
    newPassword: "a-long-enough-password", confirmPassword: "a-long-enough-password",
  });
  assert.equal(decision.outcome, "invalid_token");
});

test("short and mismatched passwords are refused", () => {
  const { token, jti } = createOpsRecoveryToken(SECRET);
  const verification = verifyOpsRecoveryToken(token, SECRET);

  assert.equal(
    decideOpsRecoveryReset({ verification, storedJti: jti, newPassword: "short", confirmPassword: "short" }).outcome,
    "invalid_new",
  );
  assert.equal(
    decideOpsRecoveryReset({
      verification, storedJti: jti,
      newPassword: "a-long-enough-password", confirmPassword: "a-different-password",
    }).outcome,
    "invalid_new",
  );
});
