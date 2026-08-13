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
  | "ambiguous"
  /**
   * W7 slice 3 — parked at the cardholder's bank, mid 3-D Secure challenge.
   *
   * Call 1 authorized NOTHING, so an attempt sitting here holds no money: the
   * TTL reaper may release it to `failed` without anything to reverse. It is
   * still a BLOCKING state, so the guest cannot open a second payment while a
   * challenge is open.
   *
   * Unreachable while `payer_authentication` is `off` — the enrolment call that
   * produces it is never made.
   */
  | "pending_authentication";

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
  /**
   * W7 slice 3. Threads call 1 to call 2. Stored on Oraya's own row so the
   * post-back never has to be believed about it.
   */
  authentication_transaction_id?: string | null;
  /**
   * A hard deadline instant, not a query-time interval: the reaper and a late
   * post-back must agree on exactly one expiry, and a compare-and-set on this
   * row is what makes them agree.
   */
  step_up_expires_at?: string | null;
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
  claimed: ["authorized", "recorded", "failed", "ambiguous", "pending_authentication"],
  /**
   * `pending_authentication -> claimed` is the guarded hand-back that lets call
   * 2 run, and it is the whole defence against W7 §3.2.
   *
   * The post-back does not authorize anything itself: it compare-and-sets the
   * row back to `claimed` FIRST, and only a winning CAS may call the provider.
   * A reaped attempt is already `failed` and `failed` leads nowhere, so the CAS
   * loses and no provider call is made. A duplicate post-back loses for the
   * same reason. Handing back to `claimed` rather than staying parked also
   * takes the row out of the reaper's reach while call 2 is in flight.
   *
   * (The plan lists the terminal exits only; this adds the in-flight one it
   * implies — "move the attempt OUT of pending_authentication before calling
   * the provider" needs somewhere non-terminal to move it to.)
   */
  pending_authentication: ["claimed", "authorized", "recorded", "failed", "ambiguous"],
  authorized: ["recorded", "failed", "ambiguous"],
  ambiguous: ["recorded", "failed"],
  recorded: [],
  failed: [],
};

/**
 * Attempts that block a second payment on the same subject. A parked challenge
 * counts: the guest is at their bank, not free to start again.
 */
export const IN_FLIGHT_ATTEMPT_STATUSES: readonly PaymentAttemptStatus[] = [
  "claimed",
  "authorized",
  "ambiguous",
  "pending_authentication",
];

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
  /**
   * The bank wants to verify the cardholder on its own screen (3-D Secure
   * step-up) and Oraya has no such screen yet. A `declined` outcome carrying
   * this flag is NOT a bank decline: nothing was authorized and nothing was
   * charged, so the guest is told to try another card rather than to argue with
   * their bank. Optional — callers that never request 3DS simply omit it.
   */
  challenge_required?: boolean;
  /**
   * W7 slice 4 — a challenge Oraya can actually run: the bank's screen URL, the
   * JWT the browser posts to it, and the id that threads call 1 to call 2.
   * Present only from the ENROLMENT call, and only while 3DS is `required`.
   */
  step_up?: {
    url: string;
    accessToken: string;
    authenticationTransactionId: string;
  };
};

/**
 * Classifies the provider response without treating a merely non-approved
 * response as a decline. The adapter supplies explicit allow-lists; missing
 * statuses and unverified approvals stay unknown.
 *
 * Explicit retry-safe statuses (DECLINED, INVALID_REQUEST, …) release the
 * claim even on non-2xx HTTP, because CyberSource returns HTTP 400 for
 * validation failures that never created a payment resource. Bare HTTP
 * errors with no parseable status stay unknown.
 */
export function classifyProviderAuthorizationOutcome(input: {
  response_ok: boolean;
  status: string | null;
  approved_statuses: readonly string[];
  retry_safe_decline_statuses: readonly string[];
  approval_verified: boolean;
}): ProviderAuthorizationOutcome {
  if (input.status && input.retry_safe_decline_statuses.includes(input.status)) {
    return "declined";
  }
  if (!input.response_ok || !input.status) return "unknown";
  if (input.approved_statuses.includes(input.status)) {
    return input.approval_verified ? "approved" : "unknown";
  }
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
  /**
   * W7 slice 3 — the hard deadline stamped on a parked challenge. Injected so
   * the reaper and its tests share one definition of "expired" and so no clock
   * lives inside this pure core. Defaults to the shared 15-minute window.
   */
  stepUpDeadlineIso(): string;
  /**
   * W7 slice 3 — the TTL reaper, called ONLY when a claim was refused by a
   * parked challenge. Returns how many it released.
   *
   * This is what stops an abandoned bank screen from becoming the permanent
   * lock slice 1 just fixed: the guest comes back, their old challenge is past
   * its deadline, it is released, and their new payment goes through on the
   * same request. Never called on an ordinary payment, so the dark path does
   * not gain a single query.
   */
  releaseExpiredStepUps?(): Promise<number>;
  log(message: string, detail?: Record<string, unknown>): void;
};

export type CompletionInput = {
  attempt_id: string;
  booking_id: string | null;
  payment_request_id?: string | null;
  provider_session_id: string;
  amount: number;
  currency: string;
  /**
   * W7 slice 5 — resume a 3-D Secure challenge instead of starting a payment.
   *
   * Set only when a parked attempt exists for this subject. `attempt_id` must
   * be that attempt, so the deterministic merchant reference is unchanged and
   * call 2 reconciles to the same provider operation as call 1.
   *
   * Absent on every ordinary payment, and unreachable while 3DS is off.
   */
  resume_step_up?: {
    /** Read from Oraya's attempt row. NEVER from the bank's post-back. */
    authentication_transaction_id: string;
  } | null;
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
  | { kind: "approved_unrecorded"; attempt_id: string; provider: ProviderAuthorizationResult }
  /**
   * W7 slice 5 — the issuer wants to challenge the cardholder, and Oraya has
   * everything needed to run it. The attempt is parked in
   * `pending_authentication`; NOTHING has been authorized.
   */
  | {
      kind: "step_up_required";
      attempt_id: string;
      step_up: { url: string; accessToken: string };
    }
  /**
   * The challenge window closed before the post-back arrived — reaped, already
   * validated, or won by a concurrent post-back. **The provider was not
   * called.** No charge, no ambiguity: the guest starts again.
   */
  | { kind: "step_up_expired" };

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

  /*
   * 0. W7 §3.2 — the guard that stops a reaped attempt from taking money.
   *
   * Resuming a challenge does NOT claim a new attempt; it compare-and-sets the
   * parked one back to `claimed`. Everything dangerous is decided here, before
   * the provider exists in this function:
   *
   *   · the reaper already released it   -> row is `failed`, CAS loses
   *   · a second post-back arrived       -> row is no longer parked, CAS loses
   *   · the guest already completed      -> row is `recorded`, CAS loses
   *
   * A losing CAS returns `step_up_expired` and the provider is never called —
   * no charge against an attempt Oraya has written off, and no ambiguity.
   */
  if (input.resume_step_up) {
    const resumed = await deps.store.transitionAttempt(
      input.attempt_id,
      ["pending_authentication"],
      { status: "claimed" },
    );
    if (!resumed.ok) {
      deps.log("3-D Secure challenge could not be resumed — the provider was NOT called", {
        attempt_id: input.attempt_id,
        current_status: resumed.reason === "conflict" ? resumed.current_status : null,
      });
      return { kind: "step_up_expired" };
    }
    return runProviderPhase(deps, input, merchantReference);
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
    /*
     * W7 slice 3 — an abandoned bank screen must not become a permanent lock.
     *
     * The guest closed the tab, the SMS never came, the phone died: the old
     * attempt is still parked and it is blocking this one. Release it if its
     * deadline has passed (call 1 authorized nothing, so there is nothing to
     * reverse) and let this payment through on the same request rather than
     * making the guest fail once to heal the ledger.
     *
     * Only reachable from a claim conflict, so an ordinary payment never runs
     * this — and with 3DS off there is nothing to find.
     */
    if (blocking?.status === "pending_authentication" && deps.releaseExpiredStepUps) {
      const released = await deps.releaseExpiredStepUps();
      if (released > 0) {
        const retry = await deps.store.claimAttempt({
          id: input.attempt_id,
          booking_id: input.booking_id,
          payment_request_id: input.payment_request_id ?? null,
          provider_session_id: input.provider_session_id,
          idempotency_key: merchantReference,
          status: "claimed",
          amount: input.amount,
          currency: input.currency,
        });
        if (retry.ok) return runProviderPhase(deps, input, merchantReference);
      }
      deps.log("payment blocked by a 3-D Secure challenge that is still open", {
        blocking_attempt_id: blocking.id,
      });
    }
    return { kind: "already_processing" };
  }

  return runProviderPhase(deps, input, merchantReference);
}

/**
 * Everything from the provider call onward. Shared by an ordinary payment and
 * by a resumed 3-D Secure challenge, so call 2 travels the exact same
 * classification, persistence and row-count-verified booking path as call 1 —
 * there is no second, weaker way to record money.
 *
 * On entry the attempt is `claimed` and is this request's to move.
 */
async function runProviderPhase(
  deps: CompletionDeps,
  input: CompletionInput,
  merchantReference: string,
): Promise<CompletionOutcome> {
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
  // When there is no payment id, keep the status (if any) in
  // provider_request_id so ops can see why the attempt failed without Vercel.
  const providerIds = {
    provider_request_id: provider.transaction_id ?? provider.status,
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

  /*
   * W7 slice 5 — park the attempt instead of failing it.
   *
   * This MUST come before the decline branch: `PENDING_AUTHENTICATION` is
   * classified retry-safe (slice 1), so a runnable challenge arrives here as
   * `declined`. Without this branch it would release the claim and tell a guest
   * standing in front of their bank's screen that the payment was refused.
   *
   * `provider.step_up` is only ever populated by the enrolment call while the
   * mode is `required`, so with 3DS off this branch cannot be entered.
   *
   * Nothing was authorized by call 1 — parking holds no money.
   */
  if (provider.step_up) {
    const parked = await deps.store.transitionAttempt(input.attempt_id, ["claimed"], {
      status: "pending_authentication",
      authentication_transaction_id: provider.step_up.authenticationTransactionId,
      step_up_expires_at: deps.stepUpDeadlineIso(),
      // Deliberately no provider ids: call 1 created no payment resource.
    });
    if (!parked.ok) {
      // Could not park it. Say nothing about a challenge the guest cannot be
      // brought back from — fall through to the honest slice-1 refusal.
      deps.log("could not park a 3-D Secure challenge — refusing instead of stranding the guest", {
        attempt_id: input.attempt_id,
        current_status: parked.reason === "conflict" ? parked.current_status : null,
      });
    } else {
      return {
        kind: "step_up_required",
        attempt_id: input.attempt_id,
        // The authentication id is NOT handed to the browser: it lives on the
        // attempt row, and call 2 reads it from there.
        step_up: { url: provider.step_up.url, accessToken: provider.step_up.accessToken },
      };
    }
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
