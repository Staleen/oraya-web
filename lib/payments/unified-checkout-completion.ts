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
  booking_id: string | null;
  payment_request_id?: string | null;
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

export type PaymentAttemptPatch = {
  status: PaymentAttemptStatus;
  provider_request_id?: string | null;
  provider_transaction_id?: string | null;
  provider_reference?: string | null;
};

export type AttemptTransitionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "conflict";
      current_status: PaymentAttemptStatus | null;
    }
  | { ok: false; reason: "error"; current_status: null };

const ALLOWED_ATTEMPT_TRANSITIONS: Readonly<
  Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]>
> = {
  claimed: ["authorized", "recorded", "failed", "ambiguous"],
  authorized: ["recorded", "failed", "ambiguous"],
  ambiguous: ["recorded", "failed"],
  recorded: [],
  failed: [],
};

/** Durable state-ordering rule shared by the real store and its tests. */
export function isAllowedAttemptTransition(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): boolean {
  return ALLOWED_ATTEMPT_TRANSITIONS[from].includes(to);
}

export type PaymentAttemptStore = {
  claimAttempt(attempt: NewPaymentAttempt): Promise<AttemptClaimResult>;
  /** The most recent in-flight (claimed/authorized/ambiguous) attempt, if any. */
  findBlockingAttempt(
    subject: { booking_id: string | null; payment_request_id: string | null },
  ): Promise<{ id: string; status: PaymentAttemptStatus } | null>;
  transitionAttempt(
    attemptId: string,
    expectedStatuses: readonly PaymentAttemptStatus[],
    patch: PaymentAttemptPatch,
  ): Promise<AttemptTransitionResult>;
};

export type ProviderAuthorizationOutcome = "approved" | "declined" | "unknown";

export type ProviderAuthorizationResult = {
  ok: boolean;
  approved: boolean;
  outcome: ProviderAuthorizationOutcome;
  status: string | null;
  transaction_id: string | null;
  reference: string;
  message: string;
};

/**
 * Classifies the provider response without treating a merely non-approved
 * response as a decline. The adapter supplies explicit allow-lists; HTTP
 * errors, missing/unknown statuses, and unverified approvals stay unknown.
 */
export function classifyProviderAuthorizationOutcome(input: {
  response_ok: boolean;
  status: string | null;
  approved_statuses: readonly string[];
  retry_safe_decline_statuses: readonly string[];
  approval_verified: boolean;
}): ProviderAuthorizationOutcome {
  if (!input.response_ok || !input.status) return "unknown";
  if (input.approved_statuses.includes(input.status)) {
    return input.approval_verified ? "approved" : "unknown";
  }
  if (input.retry_safe_decline_statuses.includes(input.status)) return "declined";
  return "unknown";
}

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
  booking_id: string | null;
  payment_request_id?: string | null;
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
  | { kind: "already_recorded"; provider?: ProviderAuthorizationResult }
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
  const subject = {
    booking_id: input.booking_id,
    payment_request_id: input.payment_request_id ?? null,
  };
  if (!subject.booking_id && !subject.payment_request_id) {
    deps.log("payment attempt has no booking or payment-request subject");
    return { kind: "store_error" };
  }

  // 1. Atomic claim BEFORE the provider call. A conflict means another
  //    attempt is in flight — the provider is NOT called.
  const claim = await deps.store.claimAttempt({
    id: input.attempt_id,
    booking_id: input.booking_id,
    payment_request_id: input.payment_request_id ?? null,
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
    const blocking = await deps.store.findBlockingAttempt(subject);
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
    const ambiguousMark = await deps.store.transitionAttempt(
      input.attempt_id,
      ["claimed"],
      { status: "ambiguous" },
    );
    if (!ambiguousMark.ok && ambiguousMark.current_status === "recorded") {
      return { kind: "already_recorded" };
    }
    return { kind: "provider_unknown", attempt_id: input.attempt_id };
  }

  // 3. Persist provider identifiers immediately, before the booking write.
  const providerIds = {
    provider_request_id: provider.transaction_id,
    provider_transaction_id: provider.transaction_id,
    provider_reference: provider.reference,
  };

  if (provider.outcome === "unknown") {
    const marked = await deps.store.transitionAttempt(input.attempt_id, ["claimed"], {
      status: "ambiguous",
      ...providerIds,
    });
    if (!marked.ok && marked.current_status === "recorded") {
      return { kind: "already_recorded", provider };
    }
    deps.log("provider returned an unproven outcome - attempt blocked for reconciliation", {
      attempt_id: input.attempt_id,
      provider_status: provider.status,
      http_ok: provider.ok,
    });
    return { kind: "provider_unknown", attempt_id: input.attempt_id };
  }

  if (provider.outcome === "declined") {
    // Only an explicitly classified, retry-safe terminal decline releases the
    // claim. Every unproven non-approval takes the ambiguous path above.
    const marked = await deps.store.transitionAttempt(input.attempt_id, ["claimed"], {
      status: "failed",
      ...providerIds,
    });
    if (!marked.ok) {
      if (marked.current_status === "recorded") {
        return { kind: "already_recorded", provider };
      }
      if (marked.current_status !== "failed") {
        deps.log("failed to persist retry-safe decline - retry remains blocked", {
          attempt_id: input.attempt_id,
          current_status: marked.current_status,
        });
        return { kind: "provider_unknown", attempt_id: input.attempt_id };
      }
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

  const authorizedMark = await deps.store.transitionAttempt(input.attempt_id, ["claimed"], {
    status: "authorized",
    ...providerIds,
  });
  if (!authorizedMark.ok) {
    if (authorizedMark.current_status === "recorded") {
      return { kind: "already_recorded", provider };
    }
    deps.log("approved response could not advance the attempt to authorized", {
      attempt_id: input.attempt_id,
      provider_transaction_id: provider.transaction_id,
      current_status: authorizedMark.current_status,
    });
    return { kind: "approved_unrecorded", attempt_id: input.attempt_id, provider };
  }

  // 4. Row-count-verified booking update. Zero rows after an approved charge
  //    means a concurrent transition won (or state drifted) — the charge
  //    stands but the booking was NOT updated by us: ambiguous, loud, and
  //    NEVER a success response.
  const recorded = await deps.recordApprovedPayment(provider);
  if (recorded.ok && recorded.matched === 1) {
    const recordedMark = await deps.store.transitionAttempt(
      input.attempt_id,
      ["authorized"],
      { status: "recorded" },
    );
    if (!recordedMark.ok) {
      if (recordedMark.current_status === "recorded") {
        return { kind: "already_recorded", provider };
      }
      deps.log("payment recorded on booking but attempt row could not be marked recorded", {
        attempt_id: input.attempt_id,
        current_status: recordedMark.current_status,
      });
      return { kind: "approved_unrecorded", attempt_id: input.attempt_id, provider };
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
  const ambiguousMark = await deps.store.transitionAttempt(
    input.attempt_id,
    ["authorized"],
    { status: "ambiguous", ...providerIds },
  );
  if (!ambiguousMark.ok && ambiguousMark.current_status === "recorded") {
    return { kind: "already_recorded", provider };
  }
  return { kind: "approved_unrecorded", attempt_id: input.attempt_id, provider };
}
