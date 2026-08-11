import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPolledReconciliationEvent,
  classifyPolledPayment,
  isAttemptStaleEnough,
  isPollableAttemptStatus,
} from "./attempt-poll.ts";

/**
 * The webhook this merchant account offers fires only for Unified Checkout's
 * complete method, which Oraya does not use. These gates decide what a polled
 * reconciliation may conclude in its place.
 */

test("an approved payment whose amount verifies is a success", () => {
  for (const status of ["AUTHORIZED", "CAPTURED", "SETTLED", "TRANSMITTED"]) {
    assert.equal(
      classifyPolledPayment({ provider_status: status, amount_verified: true }),
      "success",
      status,
    );
  }
});

test("an approved payment whose amount cannot be verified is never a success", () => {
  assert.equal(
    classifyPolledPayment({ provider_status: "AUTHORIZED", amount_verified: false }),
    "unknown",
  );
});

test("explicit refusals release the attempt", () => {
  for (const status of ["DECLINED", "INVALID_REQUEST", "VOIDED", "REVERSED", "CANCELLED"]) {
    assert.equal(
      classifyPolledPayment({ provider_status: status, amount_verified: false }),
      "failure",
      status,
    );
  }
});

test("silence or an unrecognised status changes nothing", () => {
  for (const status of [null, "", "  ", "SOMETHING_NEW", "PENDING_REVIEW"]) {
    assert.equal(
      classifyPolledPayment({ provider_status: status, amount_verified: true }),
      "unknown",
      String(status),
    );
  }
});

test("only in-flight attempts are ever polled", () => {
  for (const status of ["claimed", "authorized", "ambiguous"]) {
    assert.equal(isPollableAttemptStatus(status), true, status);
  }
  // Terminal states have already been decided and must never be re-examined.
  for (const status of ["recorded", "failed", null, undefined, ""]) {
    assert.equal(isPollableAttemptStatus(status), false, String(status));
  }
});

test("a fresh attempt is left alone so polling cannot race the guest's redirect", () => {
  const now = Date.parse("2026-08-11T12:00:00Z");
  assert.equal(
    isAttemptStaleEnough({ created_at: "2026-08-11T11:59:30Z", now }),
    false,
  );
  assert.equal(
    isAttemptStaleEnough({ created_at: "2026-08-11T11:45:00Z", now }),
    true,
  );
  // An unreadable timestamp is never assumed stale.
  assert.equal(isAttemptStaleEnough({ created_at: null, now }), false);
  assert.equal(isAttemptStaleEnough({ created_at: "not a date", now }), false);
});

test("the polled event is tagged so it is never mistaken for a provider delivery", () => {
  const event = buildPolledReconciliationEvent({
    idempotency_key: "oraya-att-abc",
    provider_transaction_id: "786469",
    provider_status: "AUTHORIZED",
    amount_verified: true,
  });
  assert.equal(event.outcome, "success");
  assert.equal(event.event_type, "oraya.polled.transactionresults");
  assert.equal(event.idempotency_key, "oraya-att-abc");
  assert.equal(event.provider_transaction_id, "786469");
  assert.equal(event.raw_status, "AUTHORIZED");
});
