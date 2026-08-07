/**
 * Plan 3 Phase 3 (KNOWN_BUGS #14) — unified-checkout completion idempotency.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/unified-checkout-completion.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyProviderAuthorizationOutcome,
  deriveMerchantReference,
  isAllowedAttemptTransition,
  runUnifiedCheckoutCompletion,
  type CompletionDeps,
  type CompletionInput,
  type NewPaymentAttempt,
  type PaymentAttemptStatus,
  type PaymentAttemptStore,
  type ProviderAuthorizationResult,
} from "./unified-checkout-completion.ts";

type StoredAttempt = NewPaymentAttempt & {
  status: PaymentAttemptStatus;
  provider_request_id?: string | null;
  provider_transaction_id?: string | null;
  provider_reference?: string | null;
};

const IN_FLIGHT: PaymentAttemptStatus[] = ["claimed", "authorized", "ambiguous"];

/**
 * In-memory store that enforces the same semantics as the partial unique
 * index in sql/plan3-payment-attempts.sql: at most one in-flight attempt
 * (claimed | authorized | ambiguous) per booking.
 */
function makeFakeStore(options: { unavailable?: boolean } = {}) {
  const rows: StoredAttempt[] = [];
  const store: PaymentAttemptStore = {
    async claimAttempt(attempt) {
      if (options.unavailable) return { ok: false, reason: "unavailable" };
      const blocking = rows.find(
        (row) => row.booking_id === attempt.booking_id && IN_FLIGHT.includes(row.status),
      );
      if (blocking) return { ok: false, reason: "conflict" };
      rows.push({ ...attempt });
      return { ok: true };
    },
    async findBlockingAttempt(bookingId) {
      const blocking = rows.find(
        (row) => row.booking_id === bookingId && IN_FLIGHT.includes(row.status),
      );
      return blocking ? { id: blocking.id, status: blocking.status } : null;
    },
    async transitionAttempt(attemptId, expectedStatuses, patch) {
      const row = rows.find((candidate) => candidate.id === attemptId);
      if (!row) return { ok: false, reason: "conflict", current_status: null };
      if (!expectedStatuses.includes(row.status)) {
        return { ok: false, reason: "conflict", current_status: row.status };
      }
      if (!isAllowedAttemptTransition(row.status, patch.status)) {
        return { ok: false, reason: "error", current_status: null };
      }
      Object.assign(row, patch);
      return { ok: true };
    },
  };
  return { store, rows };
}

const APPROVED: ProviderAuthorizationResult = {
  ok: true,
  approved: true,
  outcome: "approved",
  status: "AUTHORIZED",
  transaction_id: "txn-1",
  reference: "txn-1",
  message: "approved",
};

const DECLINED: ProviderAuthorizationResult = {
  ok: true,
  approved: false,
  outcome: "declined",
  status: "DECLINED",
  transaction_id: "txn-declined",
  reference: "txn-declined",
  message: "declined",
};

const UNKNOWN: ProviderAuthorizationResult = {
  ok: false,
  approved: false,
  outcome: "unknown",
  status: null,
  transaction_id: null,
  reference: "oraya_session-1",
  message: "unknown",
};

function makeInput(overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    attempt_id: "11111111-1111-4111-8111-111111111111",
    booking_id: "booking-1",
    provider_session_id: "oraya_session-1",
    amount: 400,
    currency: "USD",
    ...overrides,
  };
}

function makeDeps(
  store: PaymentAttemptStore,
  overrides: Partial<CompletionDeps> = {},
): CompletionDeps & { providerCalls: string[]; recordCalls: number } {
  const state = { providerCalls: [] as string[], recordCalls: 0 };
  const deps: CompletionDeps = {
    store,
    async authorize(merchantReference) {
      state.providerCalls.push(merchantReference);
      return APPROVED;
    },
    async recordApprovedPayment() {
      state.recordCalls += 1;
      return { ok: true, matched: 1 };
    },
    log() {},
    ...overrides,
  };
  return Object.assign(deps, state);
}

test("merchant reference is deterministic per attempt id and provider-safe", () => {
  const a = deriveMerchantReference("ABC-123");
  const b = deriveMerchantReference("abc-123");
  assert.equal(a, "oraya-att-abc-123");
  assert.equal(a, b);
  // uuid-sized ids stay within CyberSource's 50-char clientReferenceInformation.code limit
  assert.ok(deriveMerchantReference("11111111-1111-4111-8111-111111111111").length <= 50);
  assert.notEqual(deriveMerchantReference("attempt-1"), deriveMerchantReference("attempt-2"));
  assert.throws(() => deriveMerchantReference("  "));
});

test("provider response classification only releases retry on an explicit terminal decline", () => {
  const classify = (overrides: Partial<Parameters<typeof classifyProviderAuthorizationOutcome>[0]> = {}) =>
    classifyProviderAuthorizationOutcome({
      response_ok: true,
      status: "AUTHORIZED",
      approved_statuses: ["AUTHORIZED", "CAPTURED"],
      retry_safe_decline_statuses: ["DECLINED"],
      approval_verified: true,
      ...overrides,
    });

  assert.equal(classify(), "approved");
  assert.equal(classify({ status: "DECLINED", approval_verified: false }), "declined");
  assert.equal(classify({ response_ok: false, status: "DECLINED" }), "unknown", "HTTP errors stay unknown");
  assert.equal(classify({ status: null }), "unknown", "missing/malformed payload stays unknown");
  assert.equal(classify({ status: "PENDING", approval_verified: false }), "unknown");
  assert.equal(classify({ status: "REVIEW", approval_verified: false }), "unknown");
  assert.equal(
    classify({ status: "AUTHORIZED", approval_verified: false }),
    "unknown",
    "an apparent approval with unverifiable amount/currency stays unknown",
  );
});

test("recorded is terminal in the attempt transition graph", () => {
  for (const next of ["authorized", "failed", "ambiguous"] as const) {
    assert.equal(isAllowedAttemptTransition("recorded", next), false, next);
  }
});

test("happy path: claim → authorize → row-count-verified record → recorded", async () => {
  const { store, rows } = makeFakeStore();
  const deps = makeDeps(store);
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());
  assert.equal(outcome.kind, "approved_recorded");
  assert.equal(deps.providerCalls.length, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "recorded");
  assert.equal(rows[0].idempotency_key, deriveMerchantReference(makeInput().attempt_id));
  // provider identifiers persisted onto the attempt row
  assert.equal(rows[0].provider_transaction_id, "txn-1");
  assert.equal(rows[0].provider_reference, "txn-1");
});

test("concurrent double completion: second claim conflicts, provider called exactly once", async () => {
  const { store, rows } = makeFakeStore();
  const deps = makeDeps(store, {
    // Hold the provider call open until both requests have tried to claim.
    authorize: async (merchantReference) => {
      deps.providerCalls.push(merchantReference);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return APPROVED;
    },
  });
  const first = runUnifiedCheckoutCompletion(deps, makeInput({ attempt_id: "attempt-a" }));
  const second = runUnifiedCheckoutCompletion(deps, makeInput({ attempt_id: "attempt-b" }));
  const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

  assert.equal(firstOutcome.kind, "approved_recorded");
  assert.equal(secondOutcome.kind, "already_processing");
  assert.equal(deps.providerCalls.length, 1, "provider must be called exactly once");
  assert.equal(rows.length, 1, "loser must not insert an attempt row");
});

test("webhook records first: browser return preserves recorded and does not add the charge twice", async () => {
  const { store, rows } = makeFakeStore();
  let webhookBookingWrites = 0;
  let browserBookingWrites = 0;
  const deps = makeDeps(store, {
    authorize: async (merchantReference) => {
      deps.providerCalls.push(merchantReference);
      webhookBookingWrites += 1;
      const marked = await store.transitionAttempt("attempt-a", ["claimed"], {
        status: "recorded",
        provider_transaction_id: "txn-1",
        provider_reference: "txn-1",
      });
      assert.equal(marked.ok, true, "verified webhook must win while the browser awaits the provider");
      return APPROVED;
    },
    recordApprovedPayment: async () => {
      browserBookingWrites += 1;
      return { ok: true, matched: 1 };
    },
  });

  const outcome = await runUnifiedCheckoutCompletion(
    deps,
    makeInput({ attempt_id: "attempt-a" }),
  );

  assert.equal(outcome.kind, "already_recorded");
  assert.equal(rows[0].status, "recorded");
  assert.equal(webhookBookingWrites, 1);
  assert.equal(browserBookingWrites, 0, "browser must not record the already-webhook-recorded charge");
});

test("zero-row booking update after approval → ambiguous, NOT success", async () => {
  const { store, rows } = makeFakeStore();
  const deps = makeDeps(store, {
    recordApprovedPayment: async () => ({ ok: true, matched: 0 }),
  });
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());
  assert.equal(outcome.kind, "approved_unrecorded");
  assert.equal(rows[0].status, "ambiguous");
});

test("booking update error after approval → ambiguous, NOT success", async () => {
  const { store, rows } = makeFakeStore();
  const deps = makeDeps(store, {
    recordApprovedPayment: async () => ({ ok: false }),
  });
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());
  assert.equal(outcome.kind, "approved_unrecorded");
  assert.equal(rows[0].status, "ambiguous");
});

test("decline marks the attempt failed (claim released) and a retry succeeds with a NEW attempt row", async () => {
  const { store, rows } = makeFakeStore();
  let touched = 0;
  const declineDeps = makeDeps(store, {
    authorize: async () => DECLINED,
    touchDeclined: async () => {
      touched += 1;
    },
  });
  const declined = await runUnifiedCheckoutCompletion(declineDeps, makeInput({ attempt_id: "attempt-a" }));
  assert.equal(declined.kind, "declined");
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].provider_transaction_id, "txn-declined");
  assert.equal(touched, 1);

  const retryDeps = makeDeps(store);
  const retry = await runUnifiedCheckoutCompletion(retryDeps, makeInput({ attempt_id: "attempt-b" }));
  assert.equal(retry.kind, "approved_recorded");
  assert.equal(rows.length, 2, "retry must create a NEW attempt row");
  assert.equal(rows[1].id, "attempt-b");
  assert.equal(rows[1].status, "recorded");
  assert.notEqual(rows[0].idempotency_key, rows[1].idempotency_key);
});

test("HTTP/malformed/pending/unverified provider result becomes ambiguous and blocks retry", async () => {
  const { store, rows } = makeFakeStore();
  const unknownDeps = makeDeps(store, { authorize: async () => UNKNOWN });
  const outcome = await runUnifiedCheckoutCompletion(
    unknownDeps,
    makeInput({ attempt_id: "attempt-a" }),
  );
  assert.equal(outcome.kind, "provider_unknown");
  assert.equal(rows[0].status, "ambiguous");

  const retryDeps = makeDeps(store);
  const retry = await runUnifiedCheckoutCompletion(
    retryDeps,
    makeInput({ attempt_id: "attempt-b" }),
  );
  assert.equal(retry.kind, "blocked_ambiguous");
  assert.equal(retryDeps.providerCalls.length, 0);
});

test("provider timeout/unknown outcome → ambiguous; further attempts are BLOCKED until reconciled", async () => {
  const { store, rows } = makeFakeStore();
  const timeoutDeps = makeDeps(store, {
    authorize: async () => {
      throw new Error("fetch timed out");
    },
  });
  const unknown = await runUnifiedCheckoutCompletion(timeoutDeps, makeInput({ attempt_id: "attempt-a" }));
  assert.equal(unknown.kind, "provider_unknown");
  assert.equal(rows[0].status, "ambiguous");

  const retryDeps = makeDeps(store);
  const blocked = await runUnifiedCheckoutCompletion(retryDeps, makeInput({ attempt_id: "attempt-b" }));
  assert.equal(blocked.kind, "blocked_ambiguous");
  assert.equal(retryDeps.providerCalls.length, 0, "provider must NOT be called while ambiguous blocks");
  assert.equal(rows.length, 1);
});

test("missing payment_attempts table fails closed BEFORE the provider is touched", async () => {
  const { store } = makeFakeStore({ unavailable: true });
  const deps = makeDeps(store);
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());
  assert.equal(outcome.kind, "store_unavailable");
  assert.equal(deps.providerCalls.length, 0);
});

test("in-flight claimed attempt blocks as already_processing (not ambiguous wording)", async () => {
  const { store, rows } = makeFakeStore();
  rows.push({
    id: "attempt-a",
    booking_id: "booking-1",
    provider_session_id: "oraya_session-1",
    idempotency_key: deriveMerchantReference("attempt-a"),
    status: "claimed",
    amount: 400,
    currency: "USD",
  });
  const deps = makeDeps(store);
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput({ attempt_id: "attempt-b" }));
  assert.equal(outcome.kind, "already_processing");
  assert.equal(deps.providerCalls.length, 0);
});
