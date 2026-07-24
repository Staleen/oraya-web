/**
 * Plan 4 Phase 1 (KNOWN_BUGS #15) — recording an executed manual refund
 * without a Business Center provider reference must be refused (the API route
 * maps a failed validation to HTTP 400).
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/manual-refund.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MISSING_REFUND_REFERENCE_ERROR,
  validateManualRefundRecord,
} from "./manual-refund.ts";

test("refund_status=refunded without provider reference is refused", () => {
  const v = validateManualRefundRecord({
    refund_status: "refunded",
    refund_amount: 100,
    refunded_at: "2026-07-25T10:00:00.000Z",
  });
  assert.deepEqual(v, { ok: false, error: MISSING_REFUND_REFERENCE_ERROR });
});

test("refund_status=refunded with empty/whitespace reference is refused", () => {
  for (const bad of ["", "   ", null, 42, {}]) {
    const v = validateManualRefundRecord({
      refund_status: "refunded",
      refund_provider_reference: bad,
    });
    assert.equal(v.ok, false, `reference ${JSON.stringify(bad)} must be refused`);
  }
});

test("refund_status=partial_refund also requires the reference", () => {
  const v = validateManualRefundRecord({ refund_status: "partial_refund" });
  assert.equal(v.ok, false);
});

test("refund_status=refunded with a reference passes and trims it", () => {
  const v = validateManualRefundRecord({
    refund_status: "refunded",
    refund_provider_reference: "  BC-REF-12345  ",
  });
  assert.deepEqual(v, {
    ok: true,
    records_executed_refund: true,
    provider_reference: "BC-REF-12345",
  });
});

test("refund_pending is an intent marker — no reference required yet", () => {
  const v = validateManualRefundRecord({ refund_status: "refund_pending" });
  assert.deepEqual(v, { ok: true, records_executed_refund: false });
});

test("payloads that do not touch refund_status are not affected", () => {
  const v = validateManualRefundRecord({ payment_status: "deposit_paid" });
  assert.deepEqual(v, { ok: true, records_executed_refund: false });
});

test("clearing refund_status (null/empty) does not require a reference", () => {
  for (const cleared of [null, ""]) {
    const v = validateManualRefundRecord({ refund_status: cleared });
    assert.deepEqual(v, { ok: true, records_executed_refund: false });
  }
});
