/**
 * Plan 3 Phase 3 (KNOWN_BUGS #14) — pure orchestration core for the Unified
 * Checkout completion route's durable idempotency contract.
 *
 * Contract:
 *  1. An attempt row is claimed BEFORE the provider is called; the partial
 *     unique index (one in-flight attempt per booking) makes the claim atomic
 *     — a concurrent second request gets a conflict and NEVER reaches the
 *     provider (no double charge).
 *  2. A deterministic merchant reference derived from the attempt id is sent
 *     to the provider (clientReferenceInformation.code), so any retry can be
 *     reconciled against exactly one provider operation.
 *  3. Provider identifiers are persisted onto the attempt row immediately
 *     after the call, before the booking is touched.
 *  4. The approved booking update is row-count verified by the caller; zero
 *     matched rows marks the attempt `ambiguous` and the outcome is an
 *     explicit reconciliation-required error — NEVER success.
 *  5. Terminal states: `recorded` (success), `failed` (decline — releases the
 *     claim so the guest can retry), `ambiguous` (timeout/unknown/zero-row —
 *     blocks new attempts until manually reconciled; see
 *     sql/plan3-payment-attempts.sql for the runbook).
 *
 * Prior art: lib/payments/webhook-set-paid.ts (remediation 1.6).
 * Relative .ts imports so node:test can load this module (repo test convention).
 */

export type PaymentAttemptStatus =
  | "claimed"
  | "authorized"
  | "recorded"
  | "failed"
  | "ambiguous";

export type NewPaymentAttempt = {
  id: string;
  booking_id: string;
  provider_session_id: string;
  idempotency_key: string;
  status: "claimed";
  amount: number;
  currency: string;
};

export type AttemptClaimResult =
  /** Row inserted; this request owns the only in-flight attempt. */
  | { ok: true }
  /** Unique-violation: another attempt is in flight for this booking. */
  | { ok: false; reason: "conflict" }
  /** The payment_attempts table does not exist yet (pre-migration). */
  | { ok: false; reason: "unavailable" }
  /** Any other storage failure. */
  | { ok: false; reason: "error" };

export type PaymentAttemptStore = {
  claimAttempt(attempt: NewPaymentAttempt): Promise<AttemptClaimResult>;
  /** The most recent in-flight (claimed/authorized/ambiguous) attempt, if any. */
  findBlockingAttempt(
    bookingId: string,
  ): Promise<{ id: string; status: PaymentAttemptStatus } | null>;
  updateAttempt(
    attemptId: string,
    patch: {
      status?: PaymentAttemptStatus;
      provider_request_id?: string | null;
      provider_transaction_id?: string | null;
      provider_reference?: string | null;
    },
  ): Promise<{ ok: boolean }>;
};

export type ProviderAuthorizationResult = {
  ok: boolean;
  approved: boolean;
  status: string | null;
  transaction_id: string | null;
  reference: string;
  message: string;
};

export type CompletionDeps = {
  store: PaymentAttemptStore;
  /** Calls the provider. A throw is treated as an unknown outcome (ambiguous). */
  authorize(merchantReference: string): Promise<ProviderAuthorizationResult>;
  /**
   * Applies the approved-payment booking update. MUST be conditional
   * (payment_link_status still active + same provider session) and MUST
   * return the matched-row count via `.select("id")`.
   */
  recordApprovedPayment(
    provider: ProviderAuthorizationResult,
  ): Promise<{ ok: true; matched: number } | { ok: false }>;
  /** Best-effort booking touch on a decline (payment_last_at). May no-op. */
  touchDeclined?(): Promise<void>;
  log(message: string, detail?: Record<string, unknown>): void;
};

export type CompletionInput = {
  attempt_id: string;
  booking_id: string;
  provider_session_id: string;
  amount: number;
  currency: string;
};

export type CompletionOutcome =
  | { kind: "store_unavailable" }
  | { kind: "store_error" }
  | { kind: "already_processing" }
  | { kind: "blocked_ambiguous" }
  | { kind: "declined"; provider: ProviderAuthorizationResult }
  | { kind: "provider_unknown"; attempt_id: string }
  | { kind: "approved_recorded"; provider: ProviderAuthorizationResult }
  | { kind: "approved_unrecorded"; attempt_id: string; provider: ProviderAuthorizationResult };

/**
 * Deterministic merchant reference for one attempt — sent to CyberSource as
 * clientReferenceInformation.code (max 50 chars; "oraya-att-" + uuid = 46).
 * Same attempt id ⇒ same reference, always.
 */
export function deriveMerchantReference(attemptId: string): string {
  const normalized = attemptId.trim().toLowerCase();
  if (!normalized) {
    throw new Error("deriveMerchantReference requires a non-empty attempt id");
  }
  return `oraya-att-${normalized}`;
}

export async function runUnifiedCheckoutCompletion(
  deps: CompletionDeps,
  input: CompletionInput,
): Promise<CompletionOutcome> {
  const merchantReference = deriveMerchantReference(input.attempt_id);

  // 1. Atomic claim BEFORE the provider call. A conflict means another
  //    attempt is in flight — the provider is NOT called.
  const claim = await deps.store.claimAttempt({
    id: input.attempt_id,
    booking_id: input.booking_id,
    provider_session_id: input.provider_session_id,
    idempotency_key: merchantReference,
    status: "claimed",
    amount: input.amount,
    currency: input.currency,
  });

  if (!claim.ok) {
    if (claim.reason === "unavailable") {
      // Fail closed: without the ledger there is no idempotency guarantee,
      // so checkout completion refuses rather than falling back to the
      // unguarded path.
      deps.log("payment_attempts table unavailable — failing closed (run sql/plan3-payment-attempts.sql)", {
        booking_id: input.booking_id,
      });
      return { kind: "store_unavailable" };
    }
    if (claim.reason === "error") {
      return { kind: "store_error" };
    }
    const blocking = await deps.store.findBlockingAttempt(input.booking_id);
    if (blocking?.status === "ambiguous") {
      deps.log("attempt blocked by ambiguous prior attempt — manual reconciliation required", {
        booking_id: input.booking_id,
        blocking_attempt_id: blocking.id,
      });
      return { kind: "blocked_ambiguous" };
    }
    return { kind: "already_processing" };
  }

  // 2. Provider call. A throw (timeout / network / unknown) marks the attempt
  //    ambiguous: the guest MAY have been charged, so new attempts are
  //    blocked until a human reconciles against the provider.
  let provider: ProviderAuthorizationResult;
  try {
    provider = await deps.authorize(merchantReference);
  } catch (error) {
    deps.log("provider call outcome unknown — attempt marked ambiguous, reconciliation required", {
      booking_id: input.booking_id,
      attempt_id: input.attempt_id,
      idempotency_key: merchantReference,
      error: error instanceof Error ? error.message : String(error),
    });
    await deps.store.updateAttempt(input.attempt_id, { status: "ambiguous" });
    return { kind: "provider_unknown", attempt_id: input.attempt_id };
  }

  // 3. Persist provider identifiers immediately, before the booking write.
  const providerIds = {
    provider_request_id: provider.transaction_id,
    provider_transaction_id: provider.transaction_id,
    provider_reference: provider.reference,
  };

  if (!provider.approved) {
    // Decline is terminal for this attempt and releases the claim (failed is
    // outside the partial unique index) so the guest can retry.
    const marked = await deps.store.updateAttempt(input.attempt_id, {
      status: "failed",
      ...providerIds,
    });
    if (!marked.ok) {
      deps.log("failed to mark declined attempt as failed — claim may linger", {
        attempt_id: input.attempt_id,
      });
    }
    if (deps.touchDeclined) {
      try {
        await deps.touchDeclined();
      } catch {
        // best-effort only
      }
    }
    return { kind: "declined", provider };
  }

  const authorizedMark = await deps.store.updateAttempt(input.attempt_id, {
    status: "authorized",
    ...providerIds,
  });
  if (!authorizedMark.ok) {
    deps.log("failed to persist provider ids on authorized attempt (continuing to booking write)", {
      attempt_id: input.attempt_id,
      provider_transaction_id: provider.transaction_id,
    });
  }

  // 4. Row-count-verified booking update. Zero rows after an approved charge
  //    means a concurrent transition won (or state drifted) — the charge
  //    stands but the booking was NOT updated by us: ambiguous, loud, and
  //    NEVER a success response.
  const recorded = await deps.recordApprovedPayment(provider);
  if (recorded.ok && recorded.matched === 1) {
    const recordedMark = await deps.store.updateAttempt(input.attempt_id, { status: "recorded" });
    if (!recordedMark.ok) {
      deps.log("payment recorded on booking but attempt row could not be marked recorded", {
        attempt_id: input.attempt_id,
      });
    }
    return { kind: "approved_recorded", provider };
  }

  deps.log(
    "RECONCILIATION REQUIRED: approved charge but booking update matched no row (or failed) — attempt marked ambiguous",
    {
      booking_id: input.booking_id,
      attempt_id: input.attempt_id,
      idempotency_key: merchantReference,
      provider_transaction_id: provider.transaction_id,
      matched: recorded.ok ? recorded.matched : "update_error",
    },
  );
  await deps.store.updateAttempt(input.attempt_id, { status: "ambiguous", ...providerIds });
  return { kind: "approved_unrecorded", attempt_id: input.attempt_id, provider };
}
