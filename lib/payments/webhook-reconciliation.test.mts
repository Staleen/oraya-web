/**
 * Plan 4 Phase 2 (2.1) — verified webhooks are authoritative for payment
 * attempts: confirmed success records the payment and marks the attempt
 * `recorded` (auto-resolving ambiguous states); confirmed decline marks it
 * `failed`; contradictions with terminal states never rewrite history.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/webhook-reconciliation.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  reconcileWebhookEvent,
  type ReconciliationAttempt,
  type ReconciliationDeps,
  type ReconciliationEvent,
} from "./webhook-reconciliation.ts";
import type { AttemptTransitionResult } from "./unified-checkout-completion.ts";

function attempt(overrides: Partial<ReconciliationAttempt> = {}): ReconciliationAttempt {
  return {
    id: "att-1",
    booking_id: "bk-1",
    status: "ambiguous",
    amount: 400,
    currency: "USD",
    idempotency_key: "oraya-att-att-1",
    provider_transaction_id: null,
    ...overrides,
  };
}

function successEvent(overrides: Partial<ReconciliationEvent> = {}): ReconciliationEvent {
  return {
    outcome: "success",
    idempotency_key: "oraya-att-att-1",
    provider_transaction_id: "tx-9",
    event_type: "payments.payments.accept",
    raw_status: "AUTHORIZED",
    ...overrides,
  };
}

type Call = { method: string; args: unknown[] };

function makeDeps(options: {
  attempt: ReconciliationAttempt | null;
  bookingWrite?: "recorded" | "already_paid" | "failed";
  markResult?: AttemptTransitionResult;
}) {
  const calls: Call[] = [];
  const deps: ReconciliationDeps = {
    async findAttempt(ref) {
      calls.push({ method: "findAttempt", args: [ref] });
      return options.attempt;
    },
    async recordPaymentOnBooking(att, ev) {
      calls.push({ method: "recordPaymentOnBooking", args: [att.id, ev.provider_transaction_id] });
      return options.bookingWrite ?? "recorded";
    },
    async markAttempt(attemptId, expectedStatuses, patch) {
      calls.push({ method: "markAttempt", args: [attemptId, expectedStatuses, patch] });
      return options.markResult ?? { ok: true };
    },
    log(message, detail) {
      calls.push({ method: "log", args: [message, detail] });
    },
  };
  return { deps, calls };
}

function callsTo(calls: Call[], method: string) {
  return calls.filter((c) => c.method === method);
}

test("success + ambiguous attempt: records payment and marks attempt recorded (auto-resolves)", async () => {
  const { deps, calls } = makeDeps({ attempt: attempt({ status: "ambiguous" }) });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "recorded", attempt_id: "att-1" });
  assert.equal(callsTo(calls, "recordPaymentOnBooking").length, 1);
  const [markCall] = callsTo(calls, "markAttempt");
  assert.deepEqual(markCall.args, [
    "att-1",
    ["claimed", "authorized", "ambiguous"],
    { status: "recorded", provider_transaction_id: "tx-9" },
  ]);
});

test("success + claimed attempt: same authoritative path", async () => {
  const { deps } = makeDeps({ attempt: attempt({ status: "claimed" }) });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "recorded", attempt_id: "att-1" });
});

test("success + booking already paid: attempt still marked recorded (idempotent)", async () => {
  const { deps, calls } = makeDeps({
    attempt: attempt({ status: "authorized" }),
    bookingWrite: "already_paid",
  });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "recorded", attempt_id: "att-1" });
  assert.equal(callsTo(calls, "markAttempt").length, 1);
});

test("success + attempt already recorded: idempotent no-op", async () => {
  const { deps, calls } = makeDeps({ attempt: attempt({ status: "recorded" }) });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "already_final", attempt_id: "att-1", status: "recorded" });
  assert.equal(callsTo(calls, "recordPaymentOnBooking").length, 0);
  assert.equal(callsTo(calls, "markAttempt").length, 0);
});

test("success + attempt marked failed: conflict logged, NO state change", async () => {
  const { deps, calls } = makeDeps({ attempt: attempt({ status: "failed" }) });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "conflict", attempt_id: "att-1" });
  assert.equal(callsTo(calls, "recordPaymentOnBooking").length, 0);
  assert.equal(callsTo(calls, "markAttempt").length, 0);
  const logs = callsTo(calls, "log").map((c) => String(c.args[0]));
  assert.ok(logs.some((m) => m.includes("RECONCILIATION REQUIRED")));
});

test("success but booking write fails: claimed attempt becomes ambiguous, outcome is error", async () => {
  const { deps, calls } = makeDeps({
    attempt: attempt({ status: "claimed" }),
    bookingWrite: "failed",
  });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "error", attempt_id: "att-1" });
  const [markCall] = callsTo(calls, "markAttempt");
  assert.deepEqual(markCall.args, [
    "att-1",
    ["claimed", "authorized"],
    { status: "ambiguous", provider_transaction_id: "tx-9" },
  ]);
});

test("decline + in-flight attempt: marked failed (claim released)", async () => {
  for (const status of ["claimed", "authorized", "ambiguous"] as const) {
    const { deps, calls } = makeDeps({ attempt: attempt({ status }) });
    const outcome = await reconcileWebhookEvent(
      deps,
      successEvent({ outcome: "failure", event_type: "payments.payments.reject" }),
    );
    assert.deepEqual(outcome, { kind: "marked_failed", attempt_id: "att-1" }, status);
    const [markCall] = callsTo(calls, "markAttempt");
    assert.deepEqual(markCall.args[1], ["claimed", "authorized", "ambiguous"]);
    assert.equal((markCall.args[2] as { status: string }).status, "failed");
    assert.equal(callsTo(calls, "recordPaymentOnBooking").length, 0);
  }
});

test("decline + attempt already recorded as paid: conflict logged, NO state change", async () => {
  const { deps, calls } = makeDeps({ attempt: attempt({ status: "recorded" }) });
  const outcome = await reconcileWebhookEvent(
    deps,
    successEvent({ outcome: "failure" }),
  );
  assert.deepEqual(outcome, { kind: "conflict", attempt_id: "att-1" });
  assert.equal(callsTo(calls, "markAttempt").length, 0);
});

test("stale failure webhook cannot regress an attempt that became recorded", async () => {
  const { deps, calls } = makeDeps({
    attempt: attempt({ status: "claimed" }),
    markResult: { ok: false, reason: "conflict", current_status: "recorded" },
  });
  const outcome = await reconcileWebhookEvent(
    deps,
    successEvent({ outcome: "failure", event_type: "payments.payments.reject" }),
  );
  assert.deepEqual(outcome, { kind: "conflict", attempt_id: "att-1" });
  assert.equal(callsTo(calls, "recordPaymentOnBooking").length, 0);
  const [markCall] = callsTo(calls, "markAttempt");
  assert.deepEqual(markCall.args[1], ["claimed", "authorized", "ambiguous"]);
});

test("stale success webhook observes a concurrent recorded winner idempotently", async () => {
  const { deps } = makeDeps({
    attempt: attempt({ status: "authorized" }),
    bookingWrite: "already_paid",
    markResult: { ok: false, reason: "conflict", current_status: "recorded" },
  });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "already_final", attempt_id: "att-1", status: "recorded" });
});

test("no matching attempt: nothing changes", async () => {
  const { deps, calls } = makeDeps({ attempt: null });
  const outcome = await reconcileWebhookEvent(deps, successEvent());
  assert.deepEqual(outcome, { kind: "no_attempt" });
  assert.equal(callsTo(calls, "markAttempt").length, 0);
  assert.equal(callsTo(calls, "recordPaymentOnBooking").length, 0);
});

test("unknown outcome or missing references: ignored without lookups", async () => {
  const { deps: d1, calls: c1 } = makeDeps({ attempt: attempt() });
  const o1 = await reconcileWebhookEvent(d1, successEvent({ outcome: "unknown" }));
  assert.deepEqual(o1, { kind: "ignored", reason: "unknown_outcome" });
  assert.equal(callsTo(c1, "findAttempt").length, 0);

  const { deps: d2, calls: c2 } = makeDeps({ attempt: attempt() });
  const o2 = await reconcileWebhookEvent(
    d2,
    successEvent({ idempotency_key: null, provider_transaction_id: null }),
  );
  assert.deepEqual(o2, { kind: "ignored", reason: "no_reference" });
  assert.equal(callsTo(c2, "findAttempt").length, 0);
});
