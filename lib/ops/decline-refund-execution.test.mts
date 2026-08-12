/**
 * Declining a paid stay returns the guest's money.
 *
 * These tests pin the guarantees the route relies on:
 *   - the decision half gates the execution half
 *   - `card_manual` (what every live card booking actually stores) is treated
 *     as a card payment, not as an unrefundable rail
 *   - every confirmed charge is refunded NEWEST FIRST, one call each
 *   - execution STOPS at the first non-success and reports what happened
 *   - `requires_void` is reported, never actioned
 *   - the idempotency key is deterministic and fits the 50-character cap
 *   - nothing here writes booking status, retries, or throws
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/ops/decline-refund-execution.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideDeclineRefundForBooking,
  declineRefundIdempotencyKey,
  normalizeBookingPaymentMethod,
  runDeclineRefund,
  type DeclineRefundCharge,
  type DeclineRefundDeps,
  type DeclineRefundExecutionInput,
} from "./decline-refund-execution.ts";
import type { CardRefundInput, RefundExecution } from "../payments/execute-refund.ts";

const PAID_CARD_BOOKING: DeclineRefundExecutionInput = {
  booking_id: "booking-1",
  amount_paid: 270,
  refund_amount: null,
  refund_status: null,
  payment_method: "card_manual",
  payment_provider: "credit_libanais",
  staff_id: "staff-1",
};

function charge(id: string, amount: number, effective_at: string): DeclineRefundCharge {
  return { payment_transaction_id: id, amount, currency: "USD", effective_at };
}

function refunded(amount: number): RefundExecution {
  return {
    kind: "refunded",
    amount,
    currency: "USD",
    provider_reference: `ref-${amount}`,
    result: {},
    reconciled: false,
    settlement_state: "settled",
  };
}

type Harness = {
  deps: DeclineRefundDeps;
  calls: CardRefundInput[];
  logs: string[];
};

function harness(
  overrides: {
    charges?: DeclineRefundCharge[];
    loadFails?: boolean;
    execute?: (input: CardRefundInput, index: number) => RefundExecution;
  } = {},
): Harness {
  const calls: CardRefundInput[] = [];
  const logs: string[] = [];
  const deps: DeclineRefundDeps = {
    async loadCardCharges() {
      if (overrides.loadFails) return { ok: false as const, error: "connection reset" };
      return { ok: true as const, charges: overrides.charges ?? [charge("txn-1", 270, "2026-08-12T10:00:00Z")] };
    },
    async executeRefund(input) {
      const index = calls.length;
      calls.push(input);
      return overrides.execute ? overrides.execute(input, index) : refunded(input.amount);
    },
    // Deterministic stand-in for sha256; the real wiring injects node:crypto.
    hash: (value) => {
      let h = 0n;
      for (const ch of value) h = (h * 131n + BigInt(ch.charCodeAt(0))) % (1n << 128n);
      return h.toString(16).padStart(32, "0");
    },
    log: (message) => logs.push(message),
  };
  return { deps, calls, logs };
}

// ── The two halves actually fit ──────────────────────────────────────────────

test("card_manual is what a live card booking stores, and it must refund", () => {
  assert.equal(normalizeBookingPaymentMethod("card_manual"), "card");
  assert.equal(normalizeBookingPaymentMethod("card"), "card");
  assert.equal(normalizeBookingPaymentMethod("apple_pay"), "apple_pay");
  assert.equal(normalizeBookingPaymentMethod("CARD_MANUAL"), "card");
  // Rails Oraya cannot reverse itself stay unrefundable.
  assert.equal(normalizeBookingPaymentMethod("cash"), "cash");
  assert.equal(normalizeBookingPaymentMethod("bank_transfer"), "bank_transfer");
  assert.equal(normalizeBookingPaymentMethod(null), "");

  const decision = decideDeclineRefundForBooking({
    amount_paid: 270,
    refund_amount: null,
    refund_status: null,
    payment_method: "card_manual",
    payment_provider: "credit_libanais",
  });
  assert.equal(decision.refund, true, "a real live card booking must be refundable");
  if (decision.refund) assert.equal(decision.amount, 270);
});

test("cash is still refused — Oraya cannot return money it never took by card", () => {
  const decision = decideDeclineRefundForBooking({
    amount_paid: 270,
    refund_amount: null,
    refund_status: null,
    payment_method: "cash",
    payment_provider: null,
  });
  assert.equal(decision.refund, false);
  if (!decision.refund) assert.equal(decision.reason, "not_automatically_refundable");
});

// ── The decision gates the execution ─────────────────────────────────────────

test("nothing paid means nothing is attempted", async () => {
  const h = harness();
  const result = await runDeclineRefund({ ...PAID_CARD_BOOKING, amount_paid: 0 }, h.deps);

  assert.equal(result.kind, "not_attempted");
  if (result.kind === "not_attempted") assert.equal(result.reason, "nothing_paid");
  assert.equal(h.calls.length, 0, "the provider must never be called");
});

test("an already-refunded booking is not refunded twice", async () => {
  const h = harness();
  const result = await runDeclineRefund(
    { ...PAID_CARD_BOOKING, refund_amount: 270 },
    h.deps,
  );

  assert.equal(result.kind, "not_attempted");
  if (result.kind === "not_attempted") assert.equal(result.reason, "already_refunded");
  assert.equal(h.calls.length, 0);
});

test("a refund already in flight is left alone, and says so", async () => {
  const h = harness();
  const result = await runDeclineRefund(
    { ...PAID_CARD_BOOKING, refund_status: "pending" },
    h.deps,
  );

  assert.equal(result.kind, "not_attempted");
  if (result.kind === "not_attempted") {
    assert.equal(result.reason, "refund_in_flight");
    assert.ok(result.operator_note, "the operator must be told why");
  }
  assert.equal(h.calls.length, 0);
});

// ── Per charge, newest first ─────────────────────────────────────────────────

test("every confirmed charge is refunded newest first, one call each", async () => {
  const h = harness({
    charges: [
      charge("older", 100, "2026-08-10T09:00:00Z"),
      charge("newest", 170, "2026-08-12T09:00:00Z"),
      charge("middle", 50, "2026-08-11T09:00:00Z"),
    ],
  });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "completed");
  assert.deepEqual(
    h.calls.map((c) => c.payment_transaction_id),
    ["newest", "middle", "older"],
    "newest charge first",
  );
  if (result.kind === "completed") {
    assert.equal(result.refunded_amount, 320);
    assert.equal(result.attempts.length, 3);
  }
});

test("each charge gets its own distinct idempotency key", async () => {
  const h = harness({
    charges: [charge("a", 10, "2026-08-12T09:00:00Z"), charge("b", 20, "2026-08-11T09:00:00Z")],
  });
  await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  const keys = h.calls.map((c) => c.idempotency_key);
  assert.equal(new Set(keys).size, 2, "two charges must not share one key");
  for (const key of keys) {
    assert.ok(key.startsWith("oraya-dcl-"));
    assert.ok(key.length <= 50, `key must fit the 50-char cap, got ${key.length}`);
  }
});

test("the idempotency key is deterministic, so a double-clicked decline cannot double-refund", () => {
  const h = harness();
  const first = declineRefundIdempotencyKey(h.deps.hash, "booking-1", "txn-1");
  const second = declineRefundIdempotencyKey(h.deps.hash, "booking-1", "txn-1");
  assert.equal(first, second);

  assert.notEqual(first, declineRefundIdempotencyKey(h.deps.hash, "booking-1", "txn-2"));
  assert.notEqual(first, declineRefundIdempotencyKey(h.deps.hash, "booking-2", "txn-1"));
  assert.ok(first.length <= 50);
});

// ── Stop at the first non-success ────────────────────────────────────────────

test("execution stops at the first non-success and reports what happened", async () => {
  const declined: RefundExecution = {
    kind: "declined",
    settlement_state: "settled",
    provider_status: "DECLINED",
    message: "INVALID_REQUEST",
  };
  const h = harness({
    charges: [
      charge("newest", 100, "2026-08-12T09:00:00Z"),
      charge("middle", 50, "2026-08-11T09:00:00Z"),
      charge("oldest", 25, "2026-08-10T09:00:00Z"),
    ],
    execute: (_input, index) => (index === 1 ? declined : refunded(100)),
  });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "stopped");
  assert.equal(h.calls.length, 2, "the third charge must NOT be attempted");
  if (result.kind === "stopped") {
    assert.equal(result.stopped_on.payment_transaction_id, "middle");
    assert.equal(result.stopped_on.execution.kind, "declined");
    assert.equal(result.refunded_amount, 100, "what actually went back is recorded");
    assert.equal(result.not_attempted_count, 1);
    assert.equal(result.requires_void, false);
  }
});

test("an ambiguous outcome stops everything and is never retried", async () => {
  const ambiguous: RefundExecution = {
    kind: "ambiguous",
    stage: "provider_unverified",
    settlement_state: "settled",
    refund_transaction_id: "refund-1",
    idempotency_key: "oraya-dcl-x",
    provider_status: null,
    provider_reference: null,
    correlation_id: null,
    message: "timeout",
  };
  const h = harness({
    charges: [charge("a", 100, "2026-08-12T09:00:00Z"), charge("b", 50, "2026-08-11T09:00:00Z")],
    execute: () => ambiguous,
  });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "stopped");
  assert.equal(h.calls.length, 1, "an unproven outcome must not be followed by another call");
  if (result.kind === "stopped") {
    assert.equal(result.refunded_amount, 0);
    assert.equal(result.stopped_on.execution.kind, "ambiguous");
  }
});

test("requires_void is reported, never actioned", async () => {
  const requiresVoid: RefundExecution = {
    kind: "requires_void",
    settlement_state: "authorized_only",
    provider_status: "AUTHORIZED",
    reason_code: "481",
    decision_manager_reject: true,
  };
  const h = harness({ execute: () => requiresVoid });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "stopped");
  if (result.kind === "stopped") {
    assert.equal(result.requires_void, true, "the operator must be pointed at the hold");
    assert.equal(result.refunded_amount, 0);
  }
  // Only the refund port exists — there is no void port to call by accident.
  assert.ok(!("voidAuthorization" in h.deps));
});

test("an idempotent outcome counts as success and does not double-count money", async () => {
  const idempotent: RefundExecution = {
    kind: "idempotent",
    amount: 270,
    currency: "USD",
    settlement_state: "settled",
  };
  const h = harness({ execute: () => idempotent });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "completed");
  if (result.kind === "completed") {
    assert.equal(result.refunded_amount, 0, "already-returned money is not counted again");
    assert.equal(result.attempts[0].execution.kind, "idempotent");
  }
});

// ── The dangerous silences ───────────────────────────────────────────────────

test("a card booking with no confirmed charge on the ledger is surfaced, never silent", async () => {
  const h = harness({ charges: [] });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "no_charges_found");
  if (result.kind === "no_charges_found") assert.equal(result.expected_amount, 270);
  assert.equal(h.calls.length, 0);
});

test("a ledger read failure attempts nothing and reports", async () => {
  const h = harness({ loadFails: true });
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "lookup_failed");
  assert.equal(h.calls.length, 0);
  assert.ok(h.logs.length > 0, "a failure the operator cannot see is the bug this prevents");
});

test("a partially refunded booking refunds only what is still outstanding", async () => {
  const decision = decideDeclineRefundForBooking({
    amount_paid: 270,
    refund_amount: 100,
    refund_status: null,
    payment_method: "card_manual",
    payment_provider: "credit_libanais",
  });
  assert.equal(decision.refund, true);
  if (decision.refund) assert.equal(decision.amount, 170);
});

// ── Structural guarantees ────────────────────────────────────────────────────

test("the dependency surface cannot write booking status or message the guest", () => {
  const h = harness();
  const ports = Object.keys(h.deps).sort();
  assert.deepEqual(ports, ["executeRefund", "hash", "loadCardCharges", "log"]);
  for (const port of ports) {
    assert.ok(
      !/booking|status|email|whatsapp|notify|cancel|void/i.test(port),
      `"${port}" would let this module reach past the refund`,
    );
  }
});

test("a throwing refund never escapes into the decline path", async () => {
  const h = harness({
    charges: [charge("a", 100, "2026-08-12T09:00:00Z"), charge("b", 50, "2026-08-11T09:00:00Z")],
    execute: (_input, index) => {
      if (index === 1) throw new Error("executeCardRefund should never throw, but if it does");
      return refunded(100);
    },
  });

  // The stay is already cancelled by the time this runs. If this ever rejects,
  // the route 500s on a decline that already succeeded.
  const result = await runDeclineRefund(PAID_CARD_BOOKING, h.deps);

  assert.equal(result.kind, "errored");
  if (result.kind === "errored") {
    assert.equal(result.payment_transaction_id, "b");
    assert.equal(result.refunded_amount, 100, "the first refund still stands");
  }
  assert.equal(h.calls.length, 2, "nothing is retried after a throw");
});

test("a throwing charge lookup never escapes either", async () => {
  const deps: DeclineRefundDeps = {
    async loadCardCharges() {
      throw new Error("supabase unreachable");
    },
    async executeRefund() {
      throw new Error("must never be reached");
    },
    hash: (v) => v,
    log: () => {},
  };
  const result = await runDeclineRefund(PAID_CARD_BOOKING, deps);
  assert.equal(result.kind, "lookup_failed");
});
