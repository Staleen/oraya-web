/**
 * Plan 4 Phase 3 (3.3) — every gate combination of the live rollout switch:
 * missing env, sandbox, production without the toggle, production with the
 * toggle, unreadable settings ⇒ expected ready / not-ready.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/live-rollout.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideCreditLibanaisCheckoutReady,
  LIVE_SETTING_ROW_MISSING_MESSAGE,
  LIVE_SETTING_UNREADABLE_MESSAGE,
  type LiveRolloutInput,
} from "./live-rollout.ts";

const WEBHOOK_MISSING = ["NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID is not configured"];

function input(overrides: Partial<LiveRolloutInput> = {}): LiveRolloutInput {
  return {
    environment: "production",
    session_missing: [],
    webhook_env_missing: [],
    live_setting: { ok: true, value: "true" },
    ...overrides,
  };
}

test("missing session env config ⇒ not ready in any environment", () => {
  for (const environment of ["sandbox", "production"] as const) {
    const d = decideCreditLibanaisCheckoutReady(
      input({
        environment,
        session_missing: ["NETCOMMERCE_CYBERSOURCE_MERCHANT_ID is not configured"],
      }),
    );
    assert.equal(d.checkout_ready, false, environment);
    assert.deepEqual(d.missing, ["NETCOMMERCE_CYBERSOURCE_MERCHANT_ID is not configured"]);
  }
});

test("unset/invalid environment ⇒ not ready", () => {
  const d = decideCreditLibanaisCheckoutReady(input({ environment: null }));
  assert.equal(d.checkout_ready, false);
});

test("sandbox + full session config ⇒ ready (webhook vars and toggle not required)", () => {
  const d = decideCreditLibanaisCheckoutReady(
    input({
      environment: "sandbox",
      webhook_env_missing: WEBHOOK_MISSING,
      live_setting: { ok: true, value: null },
    }),
  );
  assert.deepEqual(d, { checkout_ready: true, missing: [] });
});

test("production + toggle true but webhook env missing ⇒ not ready", () => {
  const d = decideCreditLibanaisCheckoutReady(input({ webhook_env_missing: WEBHOOK_MISSING }));
  assert.equal(d.checkout_ready, false);
  assert.deepEqual(d.missing, WEBHOOK_MISSING);
});

test("production + webhook env complete but settings row missing ⇒ not ready", () => {
  const d = decideCreditLibanaisCheckoutReady(input({ live_setting: { ok: true, value: null } }));
  assert.equal(d.checkout_ready, false);
  assert.deepEqual(d.missing, [LIVE_SETTING_ROW_MISSING_MESSAGE]);
});

test("production + any non-'true' value ⇒ not ready (kill switch)", () => {
  for (const value of ["false", "TRUE", "True", "1", "yes", "on", ""]) {
    const d = decideCreditLibanaisCheckoutReady(input({ live_setting: { ok: true, value } }));
    assert.equal(d.checkout_ready, false, `value ${JSON.stringify(value)}`);
    assert.equal(d.missing.length, 1);
  }
});

test("production + unreadable settings ⇒ not ready (fail closed)", () => {
  const d = decideCreditLibanaisCheckoutReady(input({ live_setting: { ok: false } }));
  assert.equal(d.checkout_ready, false);
  assert.deepEqual(d.missing, [LIVE_SETTING_UNREADABLE_MESSAGE]);
});

test("production + full env + toggle exactly 'true' ⇒ READY with zero missing", () => {
  const d = decideCreditLibanaisCheckoutReady(input());
  assert.deepEqual(d, { checkout_ready: true, missing: [] });
});

test("production with several problems lists ALL of them", () => {
  const d = decideCreditLibanaisCheckoutReady(
    input({ webhook_env_missing: WEBHOOK_MISSING, live_setting: { ok: true, value: "false" } }),
  );
  assert.equal(d.checkout_ready, false);
  assert.equal(d.missing.length, 2);
});
