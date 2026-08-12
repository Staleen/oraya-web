/**
 * Phase 16B — the shared card-refund execution sequence.
 *
 * These tests pin the money-safety invariants the Ops route relied on before
 * the sequence was extracted, so a second caller inherits them rather than
 * re-implementing them:
 *   - the ledger claim always happens BEFORE the provider is called
 *   - the provider is never called again after an ambiguous outcome, and the
 *     pending claim is deliberately left open as the retry lock
 *   - an approved refund that cannot be recorded is ambiguous, not a failure
 *   - self-reconciliation is attempted before ambiguity is surfaced
 *   - the sequence never writes booking status, never sends a message, and
 *     never produces operator-facing prose
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/execute-refund.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runCardRefund,
  type CardRefundDeps,
  type CardRefundInput,
  type PriorRefundRow,
  type ProviderRefundResponse,
  type RefundExecution,
  type RefundPaymentRow,
  type SettlementAssessment,
} from "./execute-refund.ts";

const SETTLED_PAYMENT: RefundPaymentRow = {
  id: "txn-1",
  transaction_type: "payment",
  status: "confirmed",
  amount: 240,
  currency: "USD",
  provider: "credit_libanais",
  provider_reference: "7864693288166594704898",
};

const SETTLED: SettlementAssessment = {
  ok: true,
  state: "settled",
  provider_status: "TRANSMITTED",
  reason_code: "100",
  decision_manager_reject: false,
};

const APPROVED: ProviderRefundResponse = {
  ok: true,
  outcome: "approved",
  status: "PENDING",
  refund_id: "7865018110286731403867",
  reference: "7865018110286731403867",
};

const INPUT: CardRefundInput = {
  payment_transaction_id: "txn-1",
  amount: 240,
  idempotency_key: "oraya-rfnd-test",
  staff_id: "staff-1",
  notes: "Card refund via Oraya / NetCommerce",
};

type Harness = {
  deps: CardRefundDeps;
  calls: string[];
  claimCount: number;
  providerCount: number;
};

function harness(
  overrides: Partial<CardRefundDeps> & {
    payment?: RefundPaymentRow | null;
    priorRefunds?: PriorRefundRow[];
  } = {},
): Harness {
  const calls: string[] = [];
  const state = { claimCount: 0, providerCount: 0 };

  const base: CardRefundDeps = {
    async loadPayment() {
      calls.push("loadPayment");
      const row = "payment" in overrides ? (overrides.payment ?? null) : SETTLED_PAYMENT;
      return { ok: true as const, row };
    },
    async loadPriorRefunds() {
      calls.push("loadPriorRefunds");
      return { ok: true as const, rows: overrides.priorRefunds ?? [] };
    },
    async getSettlement() {
      calls.push("getSettlement");
      return SETTLED;
    },
    async claimRefund() {
      calls.push("claimRefund");
      state.claimCount += 1;
      return {
        ok: true as const,
        result: {
          refund_transaction_id: "refund-1",
          already_pending: false,
          blocked_ambiguous: false,
        },
      };
    },
    async refundAtProvider() {
      calls.push("refundAtProvider");
      state.providerCount += 1;
      return APPROVED;
    },
    async confirmRefund() {
      calls.push("confirmRefund");
      return { ok: true as const, result: { refund_transaction_id: "refund-1" } };
    },
    async failRefund() {
      calls.push("failRefund");
      return { ok: true as const, result: { refund_transaction_id: "refund-1" } };
    },
    async reconcileRefund() {
      calls.push("reconcileRefund");
      return { ok: false as const, reason: "not_found" };
    },
    readProviderConfigurationFailure() {
      return null;
    },
    log() {},
  };

  const { payment: _payment, priorRefunds: _priorRefunds, ...depOverrides } = overrides;
  const deps: CardRefundDeps = { ...base, ...depOverrides };

  // Wrap overridden ports so the call order is still recorded.
  for (const key of Object.keys(depOverrides) as (keyof CardRefundDeps)[]) {
    const override = depOverrides[key];
    if (typeof override !== "function" || key === "readProviderConfigurationFailure" || key === "log") {
      continue;
    }
    (deps as Record<string, unknown>)[key] = async (...args: unknown[]) => {
      calls.push(key);
      if (key === "claimRefund") state.claimCount += 1;
      if (key === "refundAtProvider") state.providerCount += 1;
      return (override as (...a: unknown[]) => unknown)(...args);
    };
  }

  return {
    deps,
    calls,
    get claimCount() {
      return state.claimCount;
    },
    get providerCount() {
      return state.providerCount;
    },
  };
}

/** No result variant may carry operator copy — callers own the words. */
function assertNoOperatorProse(result: RefundExecution) {
  const record = result as unknown as Record<string, unknown>;
  for (const forbidden of ["error", "copy", "operatorNote", "title", "action"]) {
    assert.ok(!(forbidden in record), `result must not carry "${forbidden}"`);
  }
  // The only free text allowed is the provider's own message, passed through
  // verbatim — never a sentence this module composed.
  const serialized = JSON.stringify(result);
  for (const phrase of ["Do NOT", "Business Center", "Oraya", "please", "Please"]) {
    assert.ok(!serialized.includes(phrase), `result must not compose copy containing "${phrase}"`);
  }
}

// ── The claim-before-provider contract ───────────────────────────────────────

test("the ledger claim happens before the provider is ever called", async () => {
  const h = harness();
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "refunded");
  const claimIndex = h.calls.indexOf("claimRefund");
  const providerIndex = h.calls.indexOf("refundAtProvider");
  assert.ok(claimIndex >= 0, "claim must run");
  assert.ok(providerIndex >= 0, "provider must run");
  assert.ok(claimIndex < providerIndex, "claim must precede the provider call");
});

test("the settlement check runs before the claim, so an unsettled auth never claims", async () => {
  const h = harness({
    async getSettlement() {
      return {
        ok: true,
        state: "authorized_only",
        provider_status: "AUTHORIZED",
        reason_code: "481",
        decision_manager_reject: true,
      } satisfies SettlementAssessment;
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "requires_void");
  assert.equal(h.claimCount, 0, "an unsettled authorization must never claim");
  assert.equal(h.providerCount, 0, "an unsettled authorization must never reach the bank");
  if (result.kind === "requires_void") {
    assert.equal(result.settlement_state, "authorized_only");
    assert.equal(result.decision_manager_reject, true);
    assert.equal(result.reason_code, "481");
  }
  assertNoOperatorProse(result);
});

test("a claim that is already pending blocks the provider entirely", async () => {
  const h = harness({
    async claimRefund() {
      return {
        ok: true as const,
        result: {
          refund_transaction_id: "refund-open",
          already_pending: true,
          blocked_ambiguous: false,
        },
      };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ambiguous");
  assert.equal(h.providerCount, 0, "a pending claim must not reach the bank");
  if (result.kind === "ambiguous") {
    assert.equal(result.stage, "claim_pending");
    assert.equal(result.refund_transaction_id, "refund-open");
    assert.equal(result.idempotency_key, INPUT.idempotency_key);
  }
  assertNoOperatorProse(result);
});

test("blocked_ambiguous is treated exactly like an open claim", async () => {
  const h = harness({
    async claimRefund() {
      return {
        ok: true as const,
        result: {
          refund_transaction_id: "refund-amb",
          already_pending: false,
          blocked_ambiguous: true,
        },
      };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ambiguous");
  assert.equal(h.providerCount, 0);
});

// ── Ambiguity never retries, and always self-reconciles first ────────────────

test("an unverifiable provider answer self-reconciles before surfacing ambiguity", async () => {
  const h = harness({
    async refundAtProvider() {
      return {
        ok: false as const,
        outcome: "ambiguous" as const,
        status: "UNKNOWN",
        refund_id: "refund-provider-1",
        message: "unverifiable",
        correlation_id: "corr-1",
      };
    },
    async reconcileRefund() {
      return { ok: true as const, refund_id: "proven-refund-1" };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "refunded");
  if (result.kind === "refunded") {
    assert.equal(result.reconciled, true, "must report that it was self-reconciled");
    assert.equal(result.provider_reference, "proven-refund-1");
  }
  assert.ok(
    h.calls.indexOf("reconcileRefund") < h.calls.lastIndexOf("confirmRefund"),
    "reconcile must precede the confirming write",
  );
  assert.equal(h.providerCount, 1, "the provider must never be called twice");
});

test("when self-reconciliation cannot prove the refund, the claim is left open and nothing retries", async () => {
  const h = harness({
    async refundAtProvider() {
      return {
        ok: false as const,
        outcome: "ambiguous" as const,
        status: "UNKNOWN",
        refund_id: "refund-provider-1",
        message: "gateway timeout",
        correlation_id: "corr-9",
      };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assert.equal(result.stage, "provider_unverified");
    assert.equal(result.refund_transaction_id, "refund-1", "the pending claim is the retry lock");
    assert.equal(result.provider_reference, "refund-provider-1");
    assert.equal(result.correlation_id, "corr-9");
    assert.equal(result.message, "gateway timeout", "provider text is passed through verbatim");
  }
  assert.equal(h.providerCount, 1, "the provider must never be called again");
  assert.ok(!h.calls.includes("failRefund"), "an ambiguous outcome must NOT release the claim");
});

test("a provider call that throws reconciles, then stays ambiguous without retrying", async () => {
  const h = harness({
    async refundAtProvider(): Promise<ProviderRefundResponse> {
      throw new Error("socket hang up");
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assert.equal(result.stage, "provider_unreachable");
    assert.equal(result.refund_transaction_id, "refund-1");
  }
  assert.equal(h.providerCount, 1);
  assert.ok(h.calls.includes("reconcileRefund"), "a post-claim throw must ask the provider first");
  assert.ok(!h.calls.includes("failRefund"), "an unreachable provider must NOT release the claim");
});

test("a throw after the claim that self-reconciles is a real refund", async () => {
  const h = harness({
    async refundAtProvider(): Promise<ProviderRefundResponse> {
      throw new Error("socket hang up");
    },
    async reconcileRefund() {
      return { ok: true as const, refund_id: "proven-after-timeout" };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "refunded");
  if (result.kind === "refunded") {
    assert.equal(result.reconciled, true);
    assert.equal(result.provider_reference, "proven-after-timeout");
  }
});

test("an approved refund that cannot be recorded is ambiguous, never a failure", async () => {
  const h = harness({
    async confirmRefund() {
      return { ok: false as const, error: "ledger unavailable" };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ambiguous", "the bank moved money — this is not a failure");
  if (result.kind === "ambiguous") {
    assert.equal(result.stage, "record_failed");
    assert.equal(result.provider_reference, APPROVED.reference);
    assert.equal(result.refund_transaction_id, "refund-1");
  }
  assert.ok(!h.calls.includes("failRefund"), "must not release a claim whose money moved");
});

// ── Declines release the claim and are retryable ─────────────────────────────

test("a clear decline releases the claim and reports the provider's own words", async () => {
  const h = harness({
    async refundAtProvider() {
      return {
        ok: false as const,
        outcome: "declined" as const,
        status: "DECLINED",
        refund_id: null,
        message: "INVALID_REQUEST",
      };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "declined");
  if (result.kind === "declined") {
    assert.equal(result.provider_status, "DECLINED");
    assert.equal(result.message, "INVALID_REQUEST");
    assert.equal(result.settlement_state, "settled");
  }
  assert.ok(h.calls.includes("failRefund"), "a clear decline releases the claim for retry");
});

// ── Settlement state is always reported back ─────────────────────────────────

test("an unreadable settlement check reports 'unknown' and still refunds", async () => {
  const h = harness({
    async getSettlement(): Promise<SettlementAssessment> {
      throw new Error("provider unreachable");
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "refunded", "an unreadable answer must not block the refund");
  if (result.kind === "refunded") {
    assert.equal(
      result.settlement_state,
      "unknown",
      "the next caller must be able to tell 'unknown' from 'settled'",
    );
  }
});

test("every post-settlement variant carries the settlement state it observed", async () => {
  const declined = await runCardRefund(
    INPUT,
    harness({
      async refundAtProvider() {
        return {
          ok: false as const,
          outcome: "declined" as const,
          status: "DECLINED",
          refund_id: null,
          message: "no",
        };
      },
    }).deps,
  );
  assert.equal(declined.kind === "declined" && declined.settlement_state, "settled");

  const ambiguous = await runCardRefund(
    INPUT,
    harness({
      async refundAtProvider() {
        return {
          ok: false as const,
          outcome: "ambiguous" as const,
          status: null,
          refund_id: null,
          message: "unknown",
        };
      },
    }).deps,
  );
  assert.equal(ambiguous.kind === "ambiguous" && ambiguous.settlement_state, "settled");

  const refunded = await runCardRefund(INPUT, harness().deps);
  assert.equal(refunded.kind === "refunded" && refunded.settlement_state, "settled");
});

// ── Amount and eligibility gates ─────────────────────────────────────────────

test("a fully refunded payment stops before the claim", async () => {
  const h = harness({
    priorRefunds: [{ id: "r1", amount: 240, status: "confirmed" }],
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "nothing_remaining");
  if (result.kind === "nothing_remaining") {
    assert.equal(result.detected, "before_claim");
    assert.equal(result.remaining, 0);
    assert.equal(result.has_pending_refund, false);
    assert.equal(result.settlement_state, null, "the settlement check had not run yet");
  }
  assert.equal(h.claimCount, 0);
  assert.equal(h.providerCount, 0);
});

test("an open pending refund is reported so the caller can refuse a second one", async () => {
  const h = harness({
    priorRefunds: [{ id: "r1", amount: 240, status: "pending" }],
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "nothing_remaining");
  if (result.kind === "nothing_remaining") {
    assert.equal(result.has_pending_refund, true);
  }
  assert.equal(h.providerCount, 0);
});

test("a partial prior refund leaves only the remainder refundable", async () => {
  const h = harness({
    priorRefunds: [{ id: "r1", amount: 100, status: "confirmed" }],
  });
  const result = await runCardRefund({ ...INPUT, amount: 200 }, h.deps);

  assert.equal(result.kind, "invalid_amount");
  if (result.kind === "invalid_amount") {
    assert.equal(result.reason, "refund_exceeds_payment");
    assert.equal(result.remaining, 140);
    assert.equal(result.currency, "USD");
  }
  assert.equal(h.claimCount, 0, "an over-refund must never claim");
});

test("a non-positive amount is rejected before the claim", async () => {
  const h = harness();
  const result = await runCardRefund({ ...INPUT, amount: 0 }, h.deps);

  assert.equal(result.kind, "invalid_amount");
  if (result.kind === "invalid_amount") {
    assert.equal(result.reason, "invalid_amount");
  }
  assert.equal(h.claimCount, 0);
});

test("a NaN amount is rejected rather than sent to the bank", async () => {
  const h = harness();
  const result = await runCardRefund({ ...INPUT, amount: Number("not-a-number") }, h.deps);

  assert.equal(result.kind, "invalid_amount");
  assert.equal(h.providerCount, 0);
});

// ── Ineligible instruments ───────────────────────────────────────────────────

test("a missing payment is not refundable", async () => {
  const h = harness({ payment: null });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "not_refundable");
  if (result.kind === "not_refundable") assert.equal(result.reason, "not_found");
  assert.equal(h.claimCount, 0);
});

test("a manual (non-card) receipt is not refundable through this path", async () => {
  const h = harness({
    payment: { ...SETTLED_PAYMENT, provider: "manual" },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "not_refundable");
  if (result.kind === "not_refundable") assert.equal(result.reason, "unsupported_instrument");
});

test("a card receipt with no provider reference is not refundable", async () => {
  const h = harness({
    payment: { ...SETTLED_PAYMENT, provider_reference: "   " },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "not_refundable");
  if (result.kind === "not_refundable") assert.equal(result.reason, "unsupported_instrument");
});

test("a reversed card receipt is still refundable (Reverse is ledger-only)", async () => {
  const h = harness({
    payment: { ...SETTLED_PAYMENT, status: "reversed" },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "refunded");
});

test("a draft or non-payment row is not refundable", async () => {
  const h = harness({
    payment: { ...SETTLED_PAYMENT, transaction_type: "refund" },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "not_refundable");
  if (result.kind === "not_refundable") assert.equal(result.reason, "wrong_state");
});

// ── Ledger and provider configuration failures ───────────────────────────────

test("an already-confirmed claim is idempotent, not an error", async () => {
  const h = harness({
    async claimRefund() {
      return { ok: false as const, error: "already_confirmed" };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "idempotent");
  if (result.kind === "idempotent") {
    assert.equal(result.amount, 240);
    assert.equal(result.currency, "USD");
  }
  assert.equal(h.providerCount, 0);
});

test("a claim rejected for exceeding the payment reports at_claim", async () => {
  const h = harness({
    async claimRefund() {
      return { ok: false as const, error: "refund_exceeds_payment" };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "nothing_remaining");
  if (result.kind === "nothing_remaining") {
    assert.equal(result.detected, "at_claim");
    assert.equal(result.settlement_state, "settled", "the settlement check had already run");
  }
  assert.equal(h.providerCount, 0);
});

test("a missing refund RPC is reported as sql_missing, not a generic failure", async () => {
  const h = harness({
    async claimRefund() {
      return {
        ok: false as const,
        error: 'function oraya_claim_provider_refund(...) does not exist',
      };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ledger_unavailable");
  if (result.kind === "ledger_unavailable") assert.equal(result.reason, "sql_missing");
  assert.equal(h.providerCount, 0);
});

test("any other claim failure never reaches the bank", async () => {
  const h = harness({
    async claimRefund() {
      return { ok: false as const, error: "deadlock detected" };
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "ledger_unavailable");
  if (result.kind === "ledger_unavailable") assert.equal(result.reason, "claim_failed");
  assert.equal(h.providerCount, 0);
});

test("a read failure never claims and never calls the bank", async () => {
  const paymentRead = await runCardRefund(
    INPUT,
    harness({
      async loadPayment() {
        return { ok: false as const, error: "connection reset" };
      },
    }).deps,
  );
  assert.equal(paymentRead.kind, "ledger_unavailable");
  if (paymentRead.kind === "ledger_unavailable") {
    assert.equal(paymentRead.reason, "payment_read_failed");
  }

  const priorRead = await runCardRefund(
    INPUT,
    harness({
      async loadPriorRefunds() {
        return { ok: false as const, error: "connection reset" };
      },
    }).deps,
  );
  assert.equal(priorRead.kind, "ledger_unavailable");
  if (priorRead.kind === "ledger_unavailable") {
    assert.equal(priorRead.reason, "prior_refunds_read_failed");
  }
});

test("an unconfigured provider releases the claim and reports its status code", async () => {
  class ConfigError extends Error {
    statusCode = 503;
  }
  const h = harness({
    async refundAtProvider(): Promise<ProviderRefundResponse> {
      throw new ConfigError("Card provider is not configured.");
    },
    readProviderConfigurationFailure(error: unknown) {
      return error instanceof ConfigError
        ? { status_code: error.statusCode, message: error.message }
        : null;
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "provider_not_configured");
  if (result.kind === "provider_not_configured") {
    assert.equal(result.status_code, 503);
    assert.equal(result.settlement_state, "settled");
  }
  assert.ok(h.calls.includes("failRefund"), "no money moved — the claim is released");
  assert.ok(!h.calls.includes("reconcileRefund"), "a configuration error needs no reconciliation");
});

test("a settlement check that throws a configuration error is not logged as a surprise", async () => {
  class ConfigError extends Error {
    statusCode = 503;
  }
  const logged: string[] = [];
  const h = harness({
    async getSettlement(): Promise<SettlementAssessment> {
      throw new ConfigError("not configured");
    },
    readProviderConfigurationFailure(error: unknown) {
      return error instanceof ConfigError
        ? { status_code: error.statusCode, message: error.message }
        : null;
    },
    log(message: string) {
      logged.push(message);
    },
  });
  const result = await runCardRefund(INPUT, h.deps);

  assert.equal(result.kind, "refunded", "settlement failure must fail open to the refund path");
  assert.ok(
    !logged.includes("settlement check failed"),
    "a known configuration gap is not an unexpected settlement failure",
  );
});

// ── Structural guarantees ────────────────────────────────────────────────────

test("the dependency surface cannot write booking status or send a message", () => {
  const h = harness();
  const ports = Object.keys(h.deps).sort();

  assert.deepEqual(ports, [
    "claimRefund",
    "confirmRefund",
    "failRefund",
    "getSettlement",
    "loadPayment",
    "loadPriorRefunds",
    "log",
    "readProviderConfigurationFailure",
    "reconcileRefund",
    "refundAtProvider",
  ]);

  for (const port of ports) {
    assert.ok(
      !/booking|email|whatsapp|notify|message|confirmStay/i.test(port),
      `"${port}" would let this module reach beyond the ledger and the provider`,
    );
  }
});

test("no failure variant carries operator-facing prose", async () => {
  const variants: RefundExecution[] = [
    await runCardRefund(INPUT, harness({ payment: null }).deps),
    await runCardRefund(
      INPUT,
      harness({ priorRefunds: [{ id: "r", amount: 240, status: "pending" }] }).deps,
    ),
    await runCardRefund({ ...INPUT, amount: 0 }, harness().deps),
    await runCardRefund(
      INPUT,
      harness({
        async getSettlement() {
          return {
            ok: true,
            state: "authorized_only",
            provider_status: "AUTHORIZED",
            reason_code: "481",
            decision_manager_reject: true,
          } satisfies SettlementAssessment;
        },
      }).deps,
    ),
    await runCardRefund(
      INPUT,
      harness({
        async claimRefund() {
          return { ok: false as const, error: "deadlock detected" };
        },
      }).deps,
    ),
    await runCardRefund(
      INPUT,
      harness({
        async confirmRefund() {
          return { ok: false as const, error: "ledger unavailable" };
        },
      }).deps,
    ),
  ];

  for (const variant of variants) {
    assertNoOperatorProse(variant);
  }
});
