/**
 * Remediation 1.2 — throttle decision logic for admin login.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/admin-login-throttle.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_LOGIN_MAX_FAILURES_PER_IP,
  ADMIN_LOGIN_MAX_FAILURES_GLOBAL,
  evaluateAdminLoginThrottle,
  extractClientIp,
} from "./admin-login-throttle.ts";

test("allows when both counters are under their limits", () => {
  assert.deepEqual(
    evaluateAdminLoginThrottle({ perIpFailures: 0, globalFailures: 0 }),
    { action: "allow" },
  );
  assert.deepEqual(
    evaluateAdminLoginThrottle({
      perIpFailures: ADMIN_LOGIN_MAX_FAILURES_PER_IP - 1,
      globalFailures: ADMIN_LOGIN_MAX_FAILURES_GLOBAL - 1,
    }),
    { action: "allow" },
  );
});

test("blocks the IP at exactly the per-IP failure limit", () => {
  const d = evaluateAdminLoginThrottle({
    perIpFailures: ADMIN_LOGIN_MAX_FAILURES_PER_IP,
    globalFailures: 0,
  });
  assert.equal(d.action, "block");
  assert.equal(d.action === "block" && d.scope, "ip");
  assert.equal(d.action === "block" && d.status, 429);
});

test("blocks globally at the global failure limit even for a clean IP", () => {
  const d = evaluateAdminLoginThrottle({
    perIpFailures: 0,
    globalFailures: ADMIN_LOGIN_MAX_FAILURES_GLOBAL,
  });
  assert.equal(d.action, "block");
  assert.equal(d.action === "block" && d.scope, "global");
});

test("fails closed (503) when either counter is unreadable", () => {
  assert.equal(
    evaluateAdminLoginThrottle({ perIpFailures: null, globalFailures: 0 }).action,
    "unavailable",
  );
  assert.equal(
    evaluateAdminLoginThrottle({ perIpFailures: 0, globalFailures: null }).action,
    "unavailable",
  );
  assert.equal(
    evaluateAdminLoginThrottle({ perIpFailures: NaN, globalFailures: 0 }).action,
    "unavailable",
  );
});

test("extractClientIp: first XFF entry wins, fallbacks, bounded length", () => {
  assert.equal(extractClientIp("1.2.3.4, 5.6.7.8"), "1.2.3.4");
  assert.equal(extractClientIp(null, "9.9.9.9"), "9.9.9.9");
  assert.equal(extractClientIp(null, null), "unknown");
  assert.equal(extractClientIp("", ""), "unknown");
  assert.equal(extractClientIp("x".repeat(500)).length, 100);
});
