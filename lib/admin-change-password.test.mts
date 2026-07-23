/**
 * Remediation 2 (A.1) — admin password change decisions: current-password
 * requirement, confirm field, min-12 rule, fail-closed states.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/admin-change-password.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_PASSWORD_MIN_LENGTH,
  decideAdminPasswordChange,
} from "./admin-change-password.ts";
import { hashAdminPassword, verifyAdminPassword } from "./admin-password.ts";

const CURRENT = "the-current-password";
const STORED = hashAdminPassword(CURRENT);
const NEW = "a-new-password-with-length"; // > 12 chars

test("success path: correct current password stores a fresh verifying scrypt hash", () => {
  const d = decideAdminPasswordChange({
    currentPassword: CURRENT,
    newPassword: NEW,
    confirmPassword: NEW,
    storedValue: STORED,
    lookupFailed: false,
  });
  assert.equal(d.outcome, "ok");
  if (d.outcome !== "ok") return;
  assert.notEqual(d.storedValue, STORED);
  assert.equal(verifyAdminPassword(NEW, d.storedValue), true);
  assert.equal(verifyAdminPassword(CURRENT, d.storedValue), false);
});

test("wrong current password → 401 (route records it as a throttle failure)", () => {
  const d = decideAdminPasswordChange({
    currentPassword: "not-the-current-password",
    newPassword: NEW,
    confirmPassword: NEW,
    storedValue: STORED,
    lookupFailed: false,
  });
  assert.deepEqual(d, { outcome: "wrong_current", status: 401 });

  // Missing/non-string current password is also a 401, never a crash.
  assert.equal(
    decideAdminPasswordChange({
      currentPassword: undefined,
      newPassword: NEW,
      confirmPassword: NEW,
      storedValue: STORED,
      lookupFailed: false,
    }).outcome,
    "wrong_current",
  );
});

test("short new password → 400 with the min-length message", () => {
  const short = "x".repeat(ADMIN_PASSWORD_MIN_LENGTH - 1);
  const d = decideAdminPasswordChange({
    currentPassword: CURRENT,
    newPassword: short,
    confirmPassword: short,
    storedValue: STORED,
    lookupFailed: false,
  });
  assert.equal(d.outcome, "invalid_new");
  assert.equal(d.status, 400);
  assert.match(d.outcome === "invalid_new" ? d.error : "", /12 characters/);

  // Exactly 12 characters passes the length rule.
  const exact = "x".repeat(ADMIN_PASSWORD_MIN_LENGTH);
  assert.equal(
    decideAdminPasswordChange({
      currentPassword: CURRENT,
      newPassword: exact,
      confirmPassword: exact,
      storedValue: STORED,
      lookupFailed: false,
    }).outcome,
    "ok",
  );
});

test("confirmation mismatch → 400", () => {
  const d = decideAdminPasswordChange({
    currentPassword: CURRENT,
    newPassword: NEW,
    confirmPassword: NEW + "typo",
    storedValue: STORED,
    lookupFailed: false,
  });
  assert.equal(d.outcome, "invalid_new");
  assert.match(d.outcome === "invalid_new" ? d.error : "", /do not match/);
});

test("fails closed when the stored hash is missing, plaintext, or unreadable", () => {
  for (const storedValue of [null, "", "plaintext-password"]) {
    const d = decideAdminPasswordChange({
      currentPassword: CURRENT,
      newPassword: NEW,
      confirmPassword: NEW,
      storedValue,
      lookupFailed: false,
    });
    assert.equal(d.outcome, "unavailable", String(storedValue));
    assert.equal(d.status, 503);
  }
  assert.equal(
    decideAdminPasswordChange({
      currentPassword: CURRENT,
      newPassword: NEW,
      confirmPassword: NEW,
      storedValue: STORED,
      lookupFailed: true,
    }).outcome,
    "unavailable",
  );
});
