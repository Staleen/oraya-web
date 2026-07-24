/**
 * Plan 3 Phase 4 (KNOWN_BUGS #2) — /api/health decision logic.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/health.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateHealth, REQUIRED_HEALTH_KEYS } from "./health.ts";

function fullEnv(): Record<string, string | undefined> {
  return Object.fromEntries(REQUIRED_HEALTH_KEYS.map((key) => [key, `value-of-${key}`]));
}

test("all required keys present → ok", () => {
  assert.deepEqual(evaluateHealth(fullEnv()), { ok: true });
});

test("a missing key is reported by NAME only", () => {
  const env = fullEnv();
  delete env.RESEND_API_KEY;
  const decision = evaluateHealth(env);
  assert.deepEqual(decision, { ok: false, missing: ["RESEND_API_KEY"] });
  // never leaks values
  assert.ok(!JSON.stringify(decision).includes("value-of-"));
});

test("empty and whitespace-only values count as missing", () => {
  const env = fullEnv();
  env.ADMIN_SECRET = "";
  env.ADMIN_RECOVERY_EMAIL = "   ";
  const decision = evaluateHealth(env);
  assert.equal(decision.ok, false);
  if (decision.ok) return;
  assert.deepEqual(decision.missing, ["ADMIN_SECRET", "ADMIN_RECOVERY_EMAIL"]);
});

test("multiple missing keys are all listed, in required-key order", () => {
  const decision = evaluateHealth({});
  assert.equal(decision.ok, false);
  if (decision.ok) return;
  assert.deepEqual(decision.missing, [...REQUIRED_HEALTH_KEYS]);
});

test("the required set covers the KNOWN_BUGS #2 alarm keys", () => {
  for (const key of [
    "RESEND_API_KEY",
    "ADMIN_SECRET",
    "ADMIN_RECOVERY_EMAIL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert.ok((REQUIRED_HEALTH_KEYS as readonly string[]).includes(key), `${key} must be health-checked`);
  }
});

test("extra unrelated env keys never affect the decision", () => {
  const env = { ...fullEnv(), SOME_OTHER_KEY: undefined, ANOTHER: "x" };
  assert.deepEqual(evaluateHealth(env), { ok: true });
});
