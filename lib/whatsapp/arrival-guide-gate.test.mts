import assert from "node:assert/strict";
import test from "node:test";
import { decideArrivalGuideRelease } from "./arrival-guide-gate.ts";

/**
 * Live evidence 2026-08-11: 20 confirmed bookings were unpaid and three of
 * them already held the Arrival Guide having paid nothing.
 */

test("off by default — behaviour is unchanged unless the switch is on", () => {
  assert.deepEqual(
    decideArrivalGuideRelease({
      enabled: false,
      amountPaid: 0,
      amountTotal: 240,
      depositAmount: 100,
    }),
    { send: true },
  );
});

test("on + deposit unmet holds the guide", () => {
  assert.deepEqual(
    decideArrivalGuideRelease({
      enabled: true,
      amountPaid: 0,
      amountTotal: 240,
      depositAmount: 100,
    }),
    { send: false, reason: "awaiting_deposit" },
  );
  // Short of the deposit by a cent still holds.
  assert.equal(
    decideArrivalGuideRelease({
      enabled: true,
      amountPaid: 99.99,
      amountTotal: 240,
      depositAmount: 100,
    }).send,
    false,
  );
});

test("on + deposit met releases the guide", () => {
  assert.deepEqual(
    decideArrivalGuideRelease({
      enabled: true,
      amountPaid: 100,
      amountTotal: 240,
      depositAmount: 100,
    }),
    { send: true },
  );
});

test("with no deposit set, the full total is the threshold", () => {
  assert.equal(
    decideArrivalGuideRelease({
      enabled: true,
      amountPaid: 100,
      amountTotal: 240,
      depositAmount: null,
    }).send,
    false,
  );
  assert.equal(
    decideArrivalGuideRelease({
      enabled: true,
      amountPaid: 240,
      amountTotal: 240,
      depositAmount: null,
    }).send,
    true,
  );
});

test("an unknown threshold never holds — the gate refuses to guess", () => {
  for (const [total, deposit] of [[null, null], [0, 0], [Number.NaN, null]]) {
    assert.deepEqual(
      decideArrivalGuideRelease({
        enabled: true,
        amountPaid: 0,
        amountTotal: total as number | null,
        depositAmount: deposit as number | null,
      }),
      { send: true },
    );
  }
});

test("the operator can always send a held guide anyway", () => {
  assert.deepEqual(
    decideArrivalGuideRelease({
      enabled: true,
      amountPaid: 0,
      amountTotal: 240,
      depositAmount: 100,
      overrideSend: true,
    }),
    { send: true },
  );
});
