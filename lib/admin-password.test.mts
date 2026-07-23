/**
 * Remediation 1.1 — admin password storage moves from plaintext (with a
 * hardcoded "Oraya2026" fallback) to a scrypt hash in settings.admin_password,
 * failing CLOSED whenever a trustworthy hash is absent.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   node --experimental-strip-types --test lib/admin-password.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  hashAdminPassword,
  isScryptHash,
  verifyAdminPassword,
  decideAdminLogin,
} from "./admin-password.ts";

test("hash → verify round-trip accepts the right password and rejects others", () => {
  const stored = hashAdminPassword("correct horse battery staple");
  assert.equal(isScryptHash(stored), true);
  assert.equal(verifyAdminPassword("correct horse battery staple", stored), true);
  assert.equal(verifyAdminPassword("wrong password", stored), false);
  assert.equal(verifyAdminPassword("", stored), false);
});

test("two hashes of the same password differ (random salt) but both verify", () => {
  const a = hashAdminPassword("secret-1");
  const b = hashAdminPassword("secret-1");
  assert.notEqual(a, b);
  assert.equal(verifyAdminPassword("secret-1", a), true);
  assert.equal(verifyAdminPassword("secret-1", b), true);
});

test("plaintext / legacy / malformed stored values are never verifiable", () => {
  for (const legacy of [
    "Oraya2026", // the old hardcoded fallback — must never compare
    "plaintext-password",
    "scrypt$bad",
    "scrypt$16384$8$1$$", // empty salt/hash
    "scrypt$notanumber$8$1$c2FsdA$aGFzaA",
    "",
  ]) {
    assert.equal(isScryptHash(legacy) && verifyAdminPassword(legacy, legacy), false);
    assert.equal(verifyAdminPassword("Oraya2026", legacy), false, `legacy=${legacy}`);
  }
});

test("absurd cost params in a stored value are rejected (no scrypt DoS)", () => {
  const huge = ["scrypt", String(1 << 25), "8", "1", "c2FsdHNhbHRzYWx0c2E", "aGFzaGhhc2hoYXNoaGFzaA"].join("$");
  assert.equal(verifyAdminPassword("x", huge), false);
});

test("route decision: missing row → 503 unavailable (fail closed, no fallback)", () => {
  const d = decideAdminLogin({ password: "Oraya2026", storedValue: null, lookupFailed: false });
  assert.equal(d.outcome, "unavailable");
  assert.equal(d.status, 503);
});

test("route decision: DB lookup failure → 503 unavailable", () => {
  const stored = hashAdminPassword("s3cret!!");
  const d = decideAdminLogin({ password: "s3cret!!", storedValue: stored, lookupFailed: true });
  assert.equal(d.outcome, "unavailable");
  assert.equal(d.status, 503);
});

test("route decision: plaintext row (pre-migration state) → 503, not a plaintext compare", () => {
  const d = decideAdminLogin({ password: "Oraya2026", storedValue: "Oraya2026", lookupFailed: false });
  assert.equal(d.outcome, "unavailable");
  assert.equal(d.status, 503);
});

test("route decision: wrong password → 401", () => {
  const stored = hashAdminPassword("the-real-password");
  const d = decideAdminLogin({ password: "not-it", storedValue: stored, lookupFailed: false });
  assert.equal(d.outcome, "unauthorized");
  assert.equal(d.status, 401);
});

test("route decision: correct password → ok (session may be attached)", () => {
  const stored = hashAdminPassword("the-real-password");
  const d = decideAdminLogin({ password: "the-real-password", storedValue: stored, lookupFailed: false });
  assert.equal(d.outcome, "ok");
  assert.equal(d.status, 200);
});
