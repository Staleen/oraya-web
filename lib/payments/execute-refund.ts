/**
 * Phase 16B — the one card-refund execution sequence.
 *
 * Extracted verbatim from the "provider" mode of
 * app/api/ops/payments/transactions/[id]/refund/route.ts so a second caller
 * (declining a stay the guest already paid for) can return card money without
 * re-implementing claim-before-provider. The behaviour is deliberately
 * unchanged: this module moved the logic, it did not improve it.
 *
 * Contract:
 *  1. The ledger claim ALWAYS happens before the provider is called. A pending
 *     claim is what blocks a concurrent second refund of the same payment.
 *  2. The provider is NEVER called again after an ambiguous outcome. The
 *     pending claim is left open on purpose — it is the retry lock.
 *  3. An approved refund that cannot be recorded is `ambiguous`, never a
 *     failure: the money moved at the bank even though Oraya's ledger did not
 *     hear about it.
 *  4. Self-reconciliation against the provider is attempted before ambiguity
 *     is surfaced to anyone.
 *  5. REFUNDS ONLY. An authorization that never settled is the void
 *     instrument's job (`requires_void`); this function reports that state back
 *     and lets the caller decide. See DECISIONS_LOG 2026-08-11 "Unsettled card
 *     authorizations are voided, never refunded".
 *
 * This module never writes booking status, never sends a message, and never
 * produces operator-facing prose. Callers own auth, copy and HTTP status codes.
 * The result is a data union so an unattended caller can act on it — there is
 * no NextResponse and no human-readable sentence anywhere in the return type.
 *
 * Dependencies are injected (prior art: lib/payments/unified-checkout-completion.ts)
 * so node:test can exercise every branch. Relative .ts imports so node:test can
 * load this module (repo test convention).
 */

import { roundMoney } from "../money.ts";
import { remainingRefundableAmount, validateRefundAmount } from "./provider-refund.ts";
import type { CardSettlementState } from "./provider-settlement.ts";

export type RefundCurrency = "USD" | "LBP";

/** The payment_transactions columns this sequence reads. */
export type RefundPaymentRow = {
  id: string;
  transaction_type: string;
  status: string;
  amount: number;
  currency: RefundCurrency;
  provider: string;
  provider_reference: string | null;
};

export type PriorRefundRow = {
  id: string;
  amount: number;
  status: string;
};

export type RefundClaim = {
  refund_transaction_id: string;
  already_pending: boolean;
  blocked_ambiguous: boolean;
};

export type RefundClaimResult =
  | { ok: true; result: RefundClaim }
  | { ok: false; error?: string | null };

export type RefundLedgerWriteResult =
  | { ok: true; result: unknown }
  | { ok: false; error?: string | null };

export type ProviderRefundResponse =
  | { ok: true; outcome: "approved"; status: string; refund_id: string; reference: string }
  | {
      ok: false;
      outcome: "declined" | "ambiguous";
      status: string | null;
      refund_id: string | null;
      message: string;
      correlation_id?: string | null;
    };

export type SettlementAssessment = {
  ok: boolean;
  state: CardSettlementState;
  provider_status: string | null;
  reason_code: string | null;
  decision_manager_reject: boolean;
};

export type RefundReconcileOutcome =
  | { ok: true; refund_id: string }
  | { ok: false; reason: string };

/**
 * A thrown provider-configuration failure, recognised by the caller (which
 * owns the concrete error class) rather than by this module.
 */
export type ProviderConfigurationFailure = { status_code: number; message: string };

export type CardRefundDeps = {
  loadPayment(
    payment_transaction_id: string,
  ): Promise<{ ok: true; row: RefundPaymentRow | null } | { ok: false; error?: string | null }>;
  loadPriorRefunds(
    payment_transaction_id: string,
  ): Promise<{ ok: true; rows: PriorRefundRow[] } | { ok: false; error?: string | null }>;
  getSettlement(input: { payment_id: string }): Promise<SettlementAssessment>;
  claimRefund(input: {
    payment_transaction_id: string;
    amount: number;
    idempotency_key: string;
    staff_id: string | null;
    notes?: string | null;
  }): Promise<RefundClaimResult>;
  refundAtProvider(input: {
    payment_id: string;
    amount: number;
    currency: RefundCurrency;
    merchant_reference: string;
  }): Promise<ProviderRefundResponse>;
  confirmRefund(input: {
    refund_transaction_id: string;
    provider_reference: string;
    verified_source?: "provider" | "operator";
  }): Promise<RefundLedgerWriteResult>;
  failRefund(input: {
    refund_transaction_id: string;
    reason?: string | null;
  }): Promise<RefundLedgerWriteResult>;
  reconcileRefund(input: {
    refund_id: string | null;
    merchant_reference: string;
    amount: number;
    currency: RefundCurrency;
  }): Promise<RefundReconcileOutcome>;
  /** Returns the configuration failure when `error` is one, else null. */
  readProviderConfigurationFailure(error: unknown): ProviderConfigurationFailure | null;
  log?(message: string, detail?: unknown): void;
};

export type CardRefundInput = {
  payment_transaction_id: string;
  /** Validated inside, against the remaining refundable amount. */
  amount: number;
  /** Caller-supplied; also sent to the provider as the merchant reference. */
  idempotency_key: string;
  staff_id: string | null;
  notes?: string;
};

/** Where an unproven outcome was reached. Each one is a distinct retry story. */
export type RefundAmbiguousStage =
  /** A claim was already open; the provider was never called this time. */
  | "claim_pending"
  /** The provider approved, but the ledger could not record it. */
  | "record_failed"
  /** The provider answered something unverifiable, and self-reconcile failed. */
  | "provider_unverified"
  /** The provider call threw, and self-reconcile failed. */
  | "provider_unreachable";

export type RefundExecution =
  | {
      kind: "refunded";
      amount: number;
      currency: RefundCurrency;
      provider_reference: string;
      result: unknown;
      /** True when the provider answer was unverifiable and self-reconcile proved it. */
      reconciled: boolean;
      settlement_state: CardSettlementState;
    }
  | {
      kind: "idempotent";
      amount: number;
      currency: RefundCurrency;
      settlement_state: CardSettlementState;
    }
  | {
      kind: "not_refundable";
      reason: "not_found" | "wrong_state" | "unsupported_instrument";
    }
  | {
      kind: "nothing_remaining";
      /** `at_claim` means the ledger rejected it, not the pre-check. */
      detected: "before_claim" | "at_claim";
      remaining: number;
      has_pending_refund: boolean;
      currency: RefundCurrency;
      /** null when the settlement check had not run yet. */
      settlement_state: CardSettlementState | null;
    }
  | {
      kind: "invalid_amount";
      reason: string;
      remaining: number;
      currency: RefundCurrency;
    }
  | {
      kind: "requires_void";
      settlement_state: "authorized_only" | "reversed";
      provider_status: string | null;
      reason_code: string | null;
      decision_manager_reject: boolean;
    }
  | {
      kind: "declined";
      settlement_state: CardSettlementState;
      provider_status: string | null;
      /** The provider's own words. Callers turn this into operator copy. */
      message: string;
    }
  | {
      kind: "ambiguous";
      stage: RefundAmbiguousStage;
      settlement_state: CardSettlementState;
      /** The claim deliberately left open. Nothing may retry against it. */
      refund_transaction_id: string;
      idempotency_key: string;
      provider_status: string | null;
      provider_reference: string | null;
      correlation_id: string | null;
      message: string | null;
    }
  | {
      kind: "provider_not_configured";
      settlement_state: CardSettlementState;
      status_code: number;
    }
  | {
      kind: "ledger_unavailable";
      reason:
        | "payment_read_failed"
        | "prior_refunds_read_failed"
        | "sql_missing"
        | "claim_failed";
      /** null when the settlement check had not run yet. */
      settlement_state: CardSettlementState | null;
    };

/**
 * An unverifiable refund response used to end with the operator being sent to
 * Business Center to copy a reference by hand. Oraya holds the API
 * credentials, so it asks the provider itself first. Only a proven credit of
 * the exact amount confirms the ledger; anything else falls back to the manual
 * path unchanged.
 */
async function tryReconcileAmbiguousRefund(
  deps: CardRefundDeps,
  input: {
    refund_transaction_id: string;
    refund_id: string | null;
    idempotency_key: string;
    amount: number;
    currency: RefundCurrency;
  },
): Promise<{ provider_reference: string; result: unknown } | null> {
  const reconciled = await deps.reconcileRefund({
    refund_id: input.refund_id,
    merchant_reference: input.idempotency_key,
    amount: input.amount,
    currency: input.currency,
  });
  if (!reconciled.ok) {
    deps.log?.("self-reconciliation did not prove the refund", { reason: reconciled.reason });
    return null;
  }
  const confirmed = await deps.confirmRefund({
    refund_transaction_id: input.refund_transaction_id,
    provider_reference: reconciled.refund_id,
    verified_source: "provider",
  });
  if (!confirmed.ok) {
    deps.log?.("reconciled refund could not be recorded", { error: confirmed.error });
    return null;
  }
  return { provider_reference: reconciled.refund_id, result: confirmed.result };
}

/**
 * The refund execution sequence. Pure orchestration over injected ports —
 * every branch is reachable from a test.
 */
export async function runCardRefund(
  input: CardRefundInput,
  deps: CardRefundDeps,
): Promise<RefundExecution> {
  const loaded = await deps.loadPayment(input.payment_transaction_id);
  if (!loaded.ok) {
    return { kind: "ledger_unavailable", reason: "payment_read_failed", settlement_state: null };
  }
  const txn = loaded.row;
  if (!txn) return { kind: "not_refundable", reason: "not_found" };

  // Include 'reversed': Ops "Reverse" is ledger-only and does not return card
  // money. A reversed card receipt with a CyberSource id must still be refundable.
  if (
    txn.transaction_type !== "payment" ||
    !["confirmed", "refunded", "reversed"].includes(txn.status)
  ) {
    return { kind: "not_refundable", reason: "wrong_state" };
  }
  if (txn.provider !== "credit_libanais" || !txn.provider_reference?.trim()) {
    return { kind: "not_refundable", reason: "unsupported_instrument" };
  }
  const providerPaymentId = txn.provider_reference;

  const prior = await deps.loadPriorRefunds(txn.id);
  if (!prior.ok) {
    return {
      kind: "ledger_unavailable",
      reason: "prior_refunds_read_failed",
      settlement_state: null,
    };
  }
  const alreadyReserved = roundMoney(
    prior.rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const remaining = remainingRefundableAmount({
    payment_amount: Number(txn.amount),
    already_refunded: alreadyReserved,
  });
  const hasPending = prior.rows.some((row) => row.status === "pending");

  if (remaining <= 0) {
    return {
      kind: "nothing_remaining",
      detected: "before_claim",
      remaining,
      has_pending_refund: hasPending,
      currency: txn.currency,
      settlement_state: null,
    };
  }

  const amountCheck = validateRefundAmount({ amount: input.amount, remaining });
  if (!amountCheck.ok) {
    return {
      kind: "invalid_amount",
      reason: amountCheck.reason,
      remaining,
      currency: txn.currency,
    };
  }
  const amount = amountCheck.amount;

  // ── Settlement gate: a credit against an unsettled authorization is the
  //    wrong instrument and fails at CyberSource with reason 102. Ask the
  //    provider what actually happened BEFORE claiming or calling the bank.
  //    An unreadable answer leaves today's behaviour untouched (fail-open to
  //    the existing refund path); only a proven unsettled auth is refused.
  let settlementState: CardSettlementState = "unknown";
  try {
    const assessment = await deps.getSettlement({ payment_id: providerPaymentId.trim() });
    settlementState = assessment.state;
    if (assessment.state === "authorized_only" || assessment.state === "reversed") {
      return {
        kind: "requires_void",
        settlement_state: assessment.state,
        provider_status: assessment.provider_status,
        reason_code: assessment.reason_code,
        decision_manager_reject: assessment.decision_manager_reject,
      };
    }
  } catch (error) {
    if (!deps.readProviderConfigurationFailure(error)) {
      deps.log?.("settlement check failed", error);
    }
  }

  // ── Provider path: claim first, then call the bank ─────────────────────────
  const claimed = await deps.claimRefund({
    payment_transaction_id: txn.id,
    amount,
    idempotency_key: input.idempotency_key,
    staff_id: input.staff_id,
    notes: input.notes ?? null,
  });
  if (!claimed.ok) {
    const msg = claimed.error ?? "";
    if (msg.includes("already_confirmed")) {
      return {
        kind: "idempotent",
        amount,
        currency: txn.currency,
        settlement_state: settlementState,
      };
    }
    if (msg.includes("refund_exceeds_payment")) {
      return {
        kind: "nothing_remaining",
        detected: "at_claim",
        remaining,
        has_pending_refund: hasPending,
        currency: txn.currency,
        settlement_state: settlementState,
      };
    }
    if (msg.includes("function") && msg.includes("does not exist")) {
      return { kind: "ledger_unavailable", reason: "sql_missing", settlement_state: settlementState };
    }
    return { kind: "ledger_unavailable", reason: "claim_failed", settlement_state: settlementState };
  }

  const refundTransactionId = claimed.result.refund_transaction_id;

  if (claimed.result.blocked_ambiguous || claimed.result.already_pending) {
    // Pending claim means a prior provider attempt may already have moved money.
    return {
      kind: "ambiguous",
      stage: "claim_pending",
      settlement_state: settlementState,
      refund_transaction_id: refundTransactionId,
      idempotency_key: input.idempotency_key,
      provider_status: null,
      provider_reference: null,
      correlation_id: null,
      message: null,
    };
  }

  try {
    const refund = await deps.refundAtProvider({
      payment_id: providerPaymentId,
      amount,
      currency: txn.currency,
      merchant_reference: input.idempotency_key,
    });

    if (refund.outcome === "approved") {
      const confirmed = await deps.confirmRefund({
        refund_transaction_id: refundTransactionId,
        provider_reference: refund.reference,
        verified_source: "provider",
      });
      if (!confirmed.ok) {
        return {
          kind: "ambiguous",
          stage: "record_failed",
          settlement_state: settlementState,
          refund_transaction_id: refundTransactionId,
          idempotency_key: input.idempotency_key,
          provider_status: null,
          provider_reference: refund.reference,
          correlation_id: null,
          message: null,
        };
      }
      return {
        kind: "refunded",
        amount,
        currency: txn.currency,
        provider_reference: refund.reference,
        result: confirmed.result,
        reconciled: false,
        settlement_state: settlementState,
      };
    }

    if (refund.outcome === "declined") {
      await deps.failRefund({
        refund_transaction_id: refundTransactionId,
        reason: refund.message,
      });
      return {
        kind: "declined",
        settlement_state: settlementState,
        provider_status: refund.status,
        message: refund.message,
      };
    }

    // Ambiguous — ask the provider directly before troubling a human.
    const reconciled = await tryReconcileAmbiguousRefund(deps, {
      refund_transaction_id: refundTransactionId,
      refund_id: refund.refund_id,
      idempotency_key: input.idempotency_key,
      amount,
      currency: txn.currency,
    });
    if (reconciled) {
      return {
        kind: "refunded",
        amount,
        currency: txn.currency,
        provider_reference: reconciled.provider_reference,
        result: reconciled.result,
        reconciled: true,
        settlement_state: settlementState,
      };
    }

    // Still unproven — keep the pending claim so nothing is retried.
    return {
      kind: "ambiguous",
      stage: "provider_unverified",
      settlement_state: settlementState,
      refund_transaction_id: refundTransactionId,
      idempotency_key: input.idempotency_key,
      provider_status: refund.status,
      provider_reference: refund.refund_id,
      correlation_id: refund.correlation_id ?? null,
      message: refund.message,
    };
  } catch (error) {
    const configurationFailure = deps.readProviderConfigurationFailure(error);
    if (configurationFailure) {
      await deps.failRefund({
        refund_transaction_id: refundTransactionId,
        reason: configurationFailure.message,
      });
      return {
        kind: "provider_not_configured",
        settlement_state: settlementState,
        status_code: configurationFailure.status_code,
      };
    }
    deps.log?.("provider call failed", error);
    // Timeout / network after claim: money may have moved. This is exactly the
    // case worth asking the provider about rather than a human.
    const reconciled = await tryReconcileAmbiguousRefund(deps, {
      refund_transaction_id: refundTransactionId,
      refund_id: null,
      idempotency_key: input.idempotency_key,
      amount,
      currency: txn.currency,
    });
    if (reconciled) {
      return {
        kind: "refunded",
        amount,
        currency: txn.currency,
        provider_reference: reconciled.provider_reference,
        result: reconciled.result,
        reconciled: true,
        settlement_state: settlementState,
      };
    }
    return {
      kind: "ambiguous",
      stage: "provider_unreachable",
      settlement_state: settlementState,
      refund_transaction_id: refundTransactionId,
      idempotency_key: input.idempotency_key,
      provider_status: null,
      provider_reference: null,
      correlation_id: null,
      message: null,
    };
  }
}

const PAYMENT_COLUMNS =
  "id, payment_request_id, booking_id, transaction_type, status, amount, currency, provider, provider_reference";

/**
 * Production wiring. Imported lazily so this module stays loadable by
 * node:test — the server-only Supabase and provider modules are never
 * evaluated unless a real refund is executed.
 */
export async function createServerCardRefundDeps(): Promise<CardRefundDeps> {
  const [{ supabaseAdmin }, creditLibanais, ledgerServer, provider] = await Promise.all([
    import("../supabase-admin.ts"),
    import("./credit-libanais.ts"),
    import("./ledger-server.ts"),
    import("./provider.ts"),
  ]);

  return {
    async loadPayment(paymentTransactionId) {
      const { data, error } = await supabaseAdmin
        .from("payment_transactions")
        .select(PAYMENT_COLUMNS)
        .eq("id", paymentTransactionId)
        .maybeSingle<RefundPaymentRow>();
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const, row: data ?? null };
    },
    async loadPriorRefunds(paymentTransactionId) {
      const { data, error } = await supabaseAdmin
        .from("payment_transactions")
        .select("id, amount, status")
        .eq("reverses_transaction_id", paymentTransactionId)
        .eq("transaction_type", "refund")
        .in("status", ["confirmed", "pending"]);
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const, rows: (data ?? []) as PriorRefundRow[] };
    },
    getSettlement: (settlementInput) =>
      creditLibanais.getCreditLibanaisPaymentSettlement(settlementInput),
    claimRefund: (claimInput) => ledgerServer.claimProviderRefund(claimInput),
    refundAtProvider: (refundInput) => creditLibanais.refundCreditLibanaisPayment(refundInput),
    confirmRefund: (confirmInput) => ledgerServer.confirmProviderRefund(confirmInput),
    failRefund: (failInput) => ledgerServer.failProviderRefund(failInput),
    reconcileRefund: (reconcileInput) =>
      creditLibanais.reconcileAmbiguousCreditLibanaisRefund(reconcileInput),
    readProviderConfigurationFailure(error) {
      return error instanceof provider.PaymentProviderConfigurationError
        ? { status_code: error.statusCode, message: error.message }
        : null;
    },
    log(message, detail) {
      console.error(`[payments/execute-refund] ${message}`, detail ?? {});
    },
  };
}

/**
 * The one entry point a server caller needs: refund a card payment with the
 * full claim-before-provider contract, and get back a data union to act on.
 */
export async function executeCardRefund(input: CardRefundInput): Promise<RefundExecution> {
  const deps = await createServerCardRefundDeps();
  return runCardRefund(input, deps);
}
