/**
 * Remediation 2 (A.2) — admin recovery tokens: expiry, tamper, reuse
 * rejection, unset-env behavior, and the reset decision rules.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/admin-recovery.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_TOKEN_TTL_SECONDS,
  createAdminRecoveryToken,
  decideRecoveryReset,
  verifyAdminRecoveryToken,
} from "./admin-recovery.ts";
import { verifyAdminPassword } from "./admin-password.ts";

const SECRET = "test-admin-secret";
const NOW = 1_800_000_000;
const NEW = "a-long-recovery-password"; // >= 12 chars

test("round trip: token verifies with its jti until the 30-minute expiry", () => {
  const { token, jti, exp } = createAdminRecoveryToken(SECRET, NOW);
  assert.equal(exp, NOW + RECOVERY_TOKEN_TTL_SECONDS);

  const v = verifyAdminRecoveryToken(token, SECRET, NOW + 60);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.jti, jti);

  assert.equal(verifyAdminRecoveryToken(token, SECRET, exp).ok, true); // at expiry boundary
  assert.deepEqual(verifyAdminRecoveryToken(token, SECRET, exp + 1), {
    ok: false,
    reason: "expired",
  });
});

test("tamper: altered payload, altered signature, wrong secret all fail", () => {
  const { token } = createAdminRecoveryToken(SECRET, NOW);
  const [payload, sig] = token.split(".");

  const forged = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      exp: NOW + 999_999,
    }),
  ).toString("base64url");
  assert.equal(verifyAdminRecoveryToken(`${forged}.${sig}`, SECRET, NOW).ok, false);

  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifyAdminRecoveryToken(`${payload}.${flipped}`, SECRET, NOW).ok, false);

  assert.equal(verifyAdminRecoveryToken(token, "different-secret", NOW).ok, false);
  assert.equal(verifyAdminRecoveryToken(`${payload}.${sig}.extra`, SECRET, NOW).ok, false);
  assert.equal(verifyAdminRecoveryToken("", SECRET, NOW).ok, false);
});

test("wrong purpose: a token signed with the same secret but another purpose fails", async () => {
  const { createHmac } = await import("node:crypto");
  const claims = { purpose: "view", exp: NOW + 3600, jti: "j-1" };
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  assert.equal(verifyAdminRecoveryToken(`${payloadB64}.${sig}`, SECRET, NOW).ok, false);
});

test("unset env: minting throws, verification fails closed", () => {
  assert.throws(() => createAdminRecoveryToken("", NOW));
  assert.throws(() => createAdminRecoveryToken("   ", NOW));
  const { token } = createAdminRecoveryToken(SECRET, NOW);
  assert.equal(verifyAdminRecoveryToken(token, "", NOW).ok, false);
});

test("reset decision: success spends the matching jti and stores a verifying hash", () => {
  const { token, jti } = createAdminRecoveryToken(SECRET, NOW);
  const verification = verifyAdminRecoveryToken(token, SECRET, NOW + 10);
  const d = decideRecoveryReset({
    verification,
    storedJti: jti,
    newPassword: NEW,
    confirmPassword: NEW,
  });
  assert.equal(d.outcome, "ok");
  if (d.outcome !== "ok") return;
  assert.equal(verifyAdminPassword(NEW, d.storedValue), true);
});

test("reuse rejection: spent or superseded jti fails with the generic message", () => {
  const { token, jti } = createAdminRecoveryToken(SECRET, NOW);
  const verification = verifyAdminRecoveryToken(token, SECRET, NOW + 10);

  for (const storedJti of ["", null, undefined, "a-newer-token-jti"]) {
    const d = decideRecoveryReset({
      verification,
      storedJti,
      newPassword: NEW,
      confirmPassword: NEW,
    });
    assert.equal(d.outcome, "invalid_token", String(storedJti));
    assert.match(d.outcome === "invalid_token" ? d.error : "", /invalid or has expired/);
  }
  // sanity: the matching jti still succeeds
  assert.equal(
    decideRecoveryReset({ verification, storedJti: jti, newPassword: NEW, confirmPassword: NEW })
      .outcome,
    "ok",
  );
});

test("reset decision: short or mismatched new password → 400; bad token wins over bad password", () => {
  const { token, jti } = createAdminRecoveryToken(SECRET, NOW);
  const verification = verifyAdminRecoveryToken(token, SECRET, NOW + 10);

  assert.equal(
    decideRecoveryReset({ verification, storedJti: jti, newPassword: "short", confirmPassword: "short" })
      .outcome,
    "invalid_new",
  );
  assert.equal(
    decideRecoveryReset({ verification, storedJti: jti, newPassword: NEW, confirmPassword: NEW + "x" })
      .outcome,
    "invalid_new",
  );
  // expired token reports invalid_token even when the password is also bad
  const expired = verifyAdminRecoveryToken(token, SECRET, NOW + RECOVERY_TOKEN_TTL_SECONDS + 1);
  assert.equal(
    decideRecoveryReset({ verification: expired, storedJti: jti, newPassword: "short", confirmPassword: "x" })
      .outcome,
    "invalid_token",
  );
});
