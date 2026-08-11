import assert from "node:assert/strict";
import test from "node:test";
import { describeDriftCorrection, detectProviderDrift } from "./provider-drift.ts";

/**
 * Live proof this exists: booking 52f5b602 — a real guest — still read
 * paid_in_full, $240, with no reversal, after the authorization was voided in
 * Business Center. Nothing in Oraya could observe that.
 */

function base(overrides: Record<string, unknown> = {}) {
  return {
    transaction_type: "payment",
    status: "confirmed",
    provider: "credit_libanais",
    has_reversal: false,
    has_refund: false,
    provider_status: "AUTHORIZED",
    provider_reachable: true,
    ...overrides,
  } as Parameters<typeof detectProviderDrift>[0];
}

test("a payment voided at the provider is detected as drift", () => {
  for (const status of ["VOIDED", "REVERSED", "CANCELLED", "AUTHORIZED_REVERSED"]) {
    assert.deepEqual(
      detectProviderDrift(base({ provider_status: status })),
      { drifted: true, reason: "provider_voided" },
      status,
    );
  }
});

test("live money is never touched", () => {
  for (const status of ["AUTHORIZED", "CAPTURED", "SETTLED", "TRANSMITTED", "PENDING"]) {
    assert.equal(detectProviderDrift(base({ provider_status: status })).drifted, false, status);
  }
});

test("an unreachable provider corrects nothing", () => {
  assert.deepEqual(
    detectProviderDrift(base({ provider_reachable: false, provider_status: null })),
    { drifted: false, reason: "provider_unreachable" },
  );
});

test("an unrecognised status corrects nothing", () => {
  for (const status of [null, "", "   ", "SOMETHING_NEW"]) {
    assert.deepEqual(
      detectProviderDrift(base({ provider_status: status })),
      { drifted: false, reason: "unknown_provider_state" },
      String(status),
    );
  }
});

test("a correction is never stacked on one already made", () => {
  assert.deepEqual(
    detectProviderDrift(base({ provider_status: "VOIDED", has_reversal: true })),
    { drifted: false, reason: "already_reversed_in_oraya" },
  );
  assert.deepEqual(
    detectProviderDrift(base({ provider_status: "VOIDED", has_refund: true })),
    { drifted: false, reason: "already_refunded_in_oraya" },
  );
});

test("only confirmed card payments are examined", () => {
  assert.equal(detectProviderDrift(base({ transaction_type: "refund", provider_status: "VOIDED" })).drifted, false);
  assert.equal(detectProviderDrift(base({ transaction_type: "reversal", provider_status: "VOIDED" })).drifted, false);
  assert.equal(detectProviderDrift(base({ provider: "manual", provider_status: "VOIDED" })).drifted, false);
  assert.equal(detectProviderDrift(base({ status: "reversed", provider_status: "VOIDED" })).drifted, false);
  assert.equal(detectProviderDrift(base({ status: "refunded", provider_status: "VOIDED" })).drifted, false);
});

test("the correction explains itself in the ledger", () => {
  const note = describeDriftCorrection("VOIDED");
  assert.match(note, /never received/i);
  assert.match(note, /original entry is kept/i);
});
