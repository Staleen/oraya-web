/**
 * W7 slices 3–5 — the 3-D Secure attempt lifecycle, end to end, with stubs.
 *
 * No provider is called anywhere in this file. Every dangerous interleaving the
 * plan names is exercised here:
 *
 *   · park a challenge instead of failing it
 *   · abandonment, and the TTL reaper releasing the lock
 *   · a reaped attempt REFUSING to validate — no provider call at all
 *   · a double post-back — the second one does nothing
 *   · DECISION_SKIP on both call bodies
 *   · with 3-D Secure off: nothing renders, nothing transitions, and the
 *     request body is byte-identical to today's
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/step-up-completion.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IN_FLIGHT_ATTEMPT_STATUSES,
  isAllowedAttemptTransition,
  runUnifiedCheckoutCompletion,
  type CompletionDeps,
  type CompletionInput,
  type NewPaymentAttempt,
  type PaymentAttemptStatus,
  type PaymentAttemptStore,
  type ProviderAuthorizationResult,
} from "./unified-checkout-completion.ts";
import { buildTransientTokenPaymentRequest } from "./transient-token-payment-request.ts";
import { isStepUpExpired, stepUpDeadlineIso } from "./step-up.ts";
import { readPayerAuthenticationResult, readStepUpChallenge } from "./payer-authentication.ts";

// ── stubs ───────────────────────────────────────────────────────────────────

type StoredAttempt = NewPaymentAttempt & {
  status: PaymentAttemptStatus;
  authentication_transaction_id?: string | null;
  step_up_expires_at?: string | null;
};

const IN_FLIGHT = [...IN_FLIGHT_ATTEMPT_STATUSES];

function makeFakeStore() {
  const rows: StoredAttempt[] = [];
  const store: PaymentAttemptStore = {
    async claimAttempt(attempt) {
      const blocking = rows.find(
        (row) => IN_FLIGHT.includes(row.status) && row.booking_id === attempt.booking_id,
      );
      if (blocking) return { ok: false, reason: "conflict" };
      rows.push({ ...attempt });
      return { ok: true };
    },
    async findBlockingAttempt(subject) {
      const blocking = rows.find(
        (row) => IN_FLIGHT.includes(row.status) && row.booking_id === subject.booking_id,
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

const NOW = new Date("2026-08-13T12:00:00.000Z");

/** The enrolment response for a card whose issuer wants to challenge. */
const CHALLENGE: ProviderAuthorizationResult = {
  ok: true,
  approved: false,
  // Slice 1 classifies PENDING_AUTHENTICATION as retry-safe, so a runnable
  // challenge arrives at the core as `declined`. The park branch must win.
  outcome: "declined",
  status: "PENDING_AUTHENTICATION",
  transaction_id: null,
  reference: "corr-1|PENDING_AUTHENTICATION",
  message: "challenge",
  challenge_required: true,
  step_up: {
    url: "https://acs.example-bank.test/step-up",
    accessToken: "step-up-jwt",
    authenticationTransactionId: "auth-txn-1",
  },
};

const APPROVED: ProviderAuthorizationResult = {
  ok: true,
  approved: true,
  outcome: "approved",
  status: "AUTHORIZED",
  transaction_id: "txn-1",
  reference: "txn-1",
  message: "approved",
};

/**
 * The provider counter WRAPS whatever authorize the test supplies, rather than
 * being replaced by it.
 *
 * Written the naive way first, and it made the single most important assertion
 * in this file — "the provider is never called for a released attempt" — pass
 * for the wrong reason: an override simply replaced the counting stub, so the
 * count was zero whether or not the provider would have been called. A test
 * that cannot fail is not evidence.
 */
function makeDeps(
  store: PaymentAttemptStore,
  overrides: Partial<CompletionDeps> = {},
): CompletionDeps & { providerCalls: number } {
  const state = { providerCalls: 0 };
  const inner = overrides.authorize ?? (async () => CHALLENGE);
  const { authorize: _ignored, ...rest } = overrides;
  const deps: CompletionDeps = {
    store,
    async recordApprovedPayment() {
      return { ok: true, matched: 1 };
    },
    stepUpDeadlineIso: () => stepUpDeadlineIso(NOW),
    log() {},
    ...rest,
    async authorize(merchantReference) {
      state.providerCalls += 1;
      return inner(merchantReference);
    },
  };
  // defineProperty, not Object.assign: assign would copy the getter's VALUE
  // once (zero) and the counter would read zero forever.
  return Object.defineProperty(deps, "providerCalls", {
    get: () => state.providerCalls,
    enumerable: true,
  }) as CompletionDeps & { providerCalls: number };
}

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

// ── slice 3: the state machine ──────────────────────────────────────────────

test("every transition into and out of the parked state, and the two that are terminal", () => {
  assert.equal(isAllowedAttemptTransition("claimed", "pending_authentication"), true);
  for (const to of ["claimed", "authorized", "recorded", "failed", "ambiguous"] as const) {
    assert.equal(isAllowedAttemptTransition("pending_authentication", to), true, `pending -> ${to}`);
  }
  // The untouched invariant: nothing leaves a terminal state, including into
  // the new one.
  assert.equal(isAllowedAttemptTransition("recorded", "pending_authentication"), false);
  assert.equal(isAllowedAttemptTransition("failed", "pending_authentication"), false);
});

test("a parked challenge blocks a second payment", () => {
  assert.ok(IN_FLIGHT_ATTEMPT_STATUSES.includes("pending_authentication"));
});

test("a challenge parks the attempt instead of failing it, and holds no money", async () => {
  const { store, rows } = makeFakeStore();
  const deps = makeDeps(store);
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());

  assert.equal(outcome.kind, "step_up_required");
  assert.equal(rows[0].status, "pending_authentication");
  assert.equal(rows[0].authentication_transaction_id, "auth-txn-1");
  assert.equal(rows[0].step_up_expires_at, "2026-08-13T12:15:00.000Z");
  // Call 1 creates no payment resource: nothing to void, nothing to refund.
  assert.equal(rows[0].provider_transaction_id ?? null, null);
  if (outcome.kind === "step_up_required") {
    assert.equal(outcome.step_up.url, CHALLENGE.step_up!.url);
    assert.equal(outcome.step_up.accessToken, CHALLENGE.step_up!.accessToken);
    // The authentication id is NOT handed to the browser.
    assert.ok(!("authenticationTransactionId" in outcome.step_up));
  }
});

test("a second payment cannot start while the guest is at their bank", async () => {
  const { store } = makeFakeStore();
  await runUnifiedCheckoutCompletion(makeDeps(store), makeInput());

  const second = makeDeps(store);
  const outcome = await runUnifiedCheckoutCompletion(
    second,
    makeInput({ attempt_id: "22222222-2222-4222-8222-222222222222" }),
  );
  assert.equal(outcome.kind, "already_processing");
  assert.equal(second.providerCalls, 0);
});

// ── the TTL reaper ──────────────────────────────────────────────────────────

test("an abandoned challenge is released at the deadline, and does not become a permanent lock", async () => {
  const { store, rows } = makeFakeStore();
  await runUnifiedCheckoutCompletion(makeDeps(store), makeInput());
  assert.equal(rows[0].status, "pending_authentication");

  // The reaper, as the store implements it: expired + CAS out of parked.
  const reap = async () => {
    let released = 0;
    for (const row of rows) {
      if (row.status !== "pending_authentication") continue;
      if (!isStepUpExpired(row.step_up_expires_at, new Date("2026-08-13T12:20:00.000Z"))) continue;
      const result = await store.transitionAttempt(row.id, ["pending_authentication"], { status: "failed" });
      if (result.ok) released += 1;
    }
    return released;
  };

  const retry = makeDeps(store, { authorize: async () => APPROVED, releaseExpiredStepUps: reap });
  const outcome = await runUnifiedCheckoutCompletion(
    retry,
    makeInput({ attempt_id: "33333333-3333-4333-8333-333333333333" }),
  );

  assert.equal(rows[0].status, "failed", "the abandoned challenge was released");
  assert.equal(outcome.kind, "approved_recorded", "and the guest's next payment went through");
});

test("the reaper never touches a challenge that is still inside its window", async () => {
  const { store, rows } = makeFakeStore();
  await runUnifiedCheckoutCompletion(makeDeps(store), makeInput());
  const result = await store.transitionAttempt(rows[0].id, ["pending_authentication"], { status: "failed" });
  // (guarded by the caller's expiry check — proven here at the store level)
  assert.equal(isStepUpExpired(rows[0].step_up_expires_at, new Date("2026-08-13T12:05:00.000Z")), false);
  assert.equal(result.ok, true); // the CAS itself is unconditional on time...
  // ...which is exactly why the reaper filters on the stored deadline first.
});

// ── slice 5: the two sharpest risks ─────────────────────────────────────────

test("a REAPED attempt refuses to validate, and the provider is never called", async () => {
  const { store, rows } = makeFakeStore();
  await runUnifiedCheckoutCompletion(makeDeps(store), makeInput());

  // The reaper wins the race; the guest's post-back arrives afterwards.
  await store.transitionAttempt(rows[0].id, ["pending_authentication"], { status: "failed" });

  const late = makeDeps(store, { authorize: async () => APPROVED });
  const outcome = await runUnifiedCheckoutCompletion(
    late,
    makeInput({ resume_step_up: { authentication_transaction_id: "auth-txn-1" } }),
  );

  assert.equal(outcome.kind, "step_up_expired");
  assert.equal(late.providerCalls, 0, "MONEY: a released attempt must never reach the provider");
  assert.equal(rows[0].status, "failed", "and the terminal state is untouched");
});

test("a double post-back validates once — the second does nothing", async () => {
  const { store, rows } = makeFakeStore();
  await runUnifiedCheckoutCompletion(makeDeps(store), makeInput());

  const first = makeDeps(store, { authorize: async () => APPROVED });
  const firstOutcome = await runUnifiedCheckoutCompletion(
    first,
    makeInput({ resume_step_up: { authentication_transaction_id: "auth-txn-1" } }),
  );
  assert.equal(firstOutcome.kind, "approved_recorded");
  assert.equal(first.providerCalls, 1);
  assert.equal(rows[0].status, "recorded");

  const second = makeDeps(store, { authorize: async () => APPROVED });
  const secondOutcome = await runUnifiedCheckoutCompletion(
    second,
    makeInput({ resume_step_up: { authentication_transaction_id: "auth-txn-1" } }),
  );
  assert.equal(secondOutcome.kind, "step_up_expired");
  assert.equal(second.providerCalls, 0, "MONEY: no second authorization");
  assert.equal(rows[0].status, "recorded");
});

test("resuming reuses the same attempt, so call 2 reconciles to call 1's operation", async () => {
  const { store, rows } = makeFakeStore();
  await runUnifiedCheckoutCompletion(makeDeps(store), makeInput());
  const references: string[] = [];
  await runUnifiedCheckoutCompletion(
    makeDeps(store, {
      authorize: async (reference) => {
        references.push(reference);
        return APPROVED;
      },
    }),
    makeInput({ resume_step_up: { authentication_transaction_id: "auth-txn-1" } }),
  );
  assert.equal(rows.length, 1, "no second attempt row was created");
  assert.deepEqual(references, ["oraya-att-11111111-1111-4111-8111-111111111111"]);
});

test("a challenge that cannot be parked refuses honestly rather than stranding the guest", async () => {
  const { store } = makeFakeStore();
  const deps = makeDeps(store, {
    store: {
      ...store,
      async transitionAttempt(id, expected, patch) {
        if (patch.status === "pending_authentication") {
          return { ok: false, reason: "error", current_status: null };
        }
        return store.transitionAttempt(id, expected, patch);
      },
    },
  });
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());
  assert.equal(outcome.kind, "declined", "falls back to slice 1's honest refusal");
});

// ── slice 4: DECISION_SKIP on both calls ────────────────────────────────────

test("DECISION_SKIP rides on BOTH the enrolment and the validation body", () => {
  const base = {
    booking_id: "booking-1",
    provider_session_id: "oraya_session-1",
    transient_token: "tt",
    amount_due: 400,
    currency: "USD" as const,
    payer_authentication: "required" as const,
  };

  const call1 = buildTransientTokenPaymentRequest({
    ...base,
    payer_authentication_phase: "enrolment",
    step_up_return_url: "https://www.stayoraya.com/api/payments/3ds-return/tok",
  });
  const call2 = buildTransientTokenPaymentRequest({
    ...base,
    payer_authentication_phase: "validation",
    authentication_transaction_id: "auth-txn-1",
  });

  assert.deepEqual(call1.processingInformation.actionList, ["DECISION_SKIP", "CONSUMER_AUTHENTICATION"]);
  assert.deepEqual(call2.processingInformation.actionList, [
    "DECISION_SKIP",
    "VALIDATE_CONSUMER_AUTHENTICATION",
  ]);

  // MONEY: call 2 is the one that authorizes. Without DECISION_SKIP it goes
  // into the Decision Manager that rejects every issuer-approved authorization
  // on this merchant with 481 — a build that passes a challenge test and then
  // declines every real payment.
  assert.ok(call2.processingInformation.actionList!.includes("DECISION_SKIP"));

  // The two calls are threaded, and each carries only its own half.
  assert.equal(
    (call1 as { consumerAuthenticationInformation?: { returnUrl?: string } }).consumerAuthenticationInformation
      ?.returnUrl,
    "https://www.stayoraya.com/api/payments/3ds-return/tok",
  );
  assert.equal(
    (call2 as { consumerAuthenticationInformation?: { authenticationTransactionId?: string } })
      .consumerAuthenticationInformation?.authenticationTransactionId,
    "auth-txn-1",
  );
});

test("the enrolment response gives up its access token and authentication id", () => {
  const result = readPayerAuthenticationResult({
    status: "PENDING_AUTHENTICATION",
    consumerAuthenticationInformation: {
      accessToken: "step-up-jwt",
      stepUpUrl: "https://acs.example-bank.test/step-up",
      authenticationTransactionId: "auth-txn-1",
    },
  });
  assert.equal(result.accessToken, "step-up-jwt");
  assert.equal(result.authenticationTransactionId, "auth-txn-1");

  const challenge = readStepUpChallenge(result);
  assert.deepEqual(challenge, {
    stepUpUrl: "https://acs.example-bank.test/step-up",
    accessToken: "step-up-jwt",
    authenticationTransactionId: "auth-txn-1",
  });
});

test("a challenge missing any part is not runnable, and is refused rather than parked", () => {
  for (const info of [
    { stepUpUrl: "https://acs.test/s", accessToken: "jwt" }, // no transaction id
    { stepUpUrl: "https://acs.test/s", authenticationTransactionId: "a" }, // no token
    { accessToken: "jwt", authenticationTransactionId: "a" }, // no url
  ]) {
    const result = readPayerAuthenticationResult({
      status: "PENDING_AUTHENTICATION",
      consumerAuthenticationInformation: info,
    });
    assert.equal(readStepUpChallenge(result), null);
  }
});

// ── THE DARK PATH ───────────────────────────────────────────────────────────

test("DARK: with payer_authentication off the request body is byte-identical to today's", () => {
  const base = {
    booking_id: "booking-1",
    provider_session_id: "oraya_session-1",
    transient_token: "tt",
    amount_due: 400,
    currency: "USD" as const,
  };

  // What the live setting produces today.
  const live = JSON.stringify(buildTransientTokenPaymentRequest({ ...base, payer_authentication: "off" }));

  // The same call after W7, including every new field being supplied. If any
  // of them leaked into the body while 3DS is off, this fails.
  const afterW7 = JSON.stringify(
    buildTransientTokenPaymentRequest({
      ...base,
      payer_authentication: "off",
      payer_authentication_phase: "validation",
      step_up_return_url: "https://www.stayoraya.com/api/payments/3ds-return/tok",
      authentication_transaction_id: "auth-txn-1",
    }),
  );

  // And the body of a caller that never mentions 3DS at all.
  const untouched = JSON.stringify(buildTransientTokenPaymentRequest(base));

  assert.equal(afterW7, live);
  assert.equal(untouched, live);
  assert.deepEqual(JSON.parse(live).processingInformation.actionList, ["DECISION_SKIP"]);
  assert.ok(!live.includes("consumerAuthenticationInformation"));
  assert.ok(!live.includes("3ds-return"));
  assert.ok(!live.includes("auth-txn-1"));
});

test("DARK: with 3-D Secure off the attempt lifecycle is claimed -> recorded, and nothing parks", async () => {
  const { store, rows } = makeFakeStore();
  // With the mode off the adapter never populates `step_up` — that gate lives
  // in credit-libanais.ts and is asserted there; here the core is shown to
  // park nothing without it.
  const offResponse: ProviderAuthorizationResult = { ...APPROVED };
  const deps = makeDeps(store, { authorize: async () => offResponse });
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());

  assert.equal(outcome.kind, "approved_recorded");
  assert.equal(rows[0].status, "recorded");
  assert.equal(rows[0].step_up_expires_at ?? null, null);
  assert.equal(rows[0].authentication_transaction_id ?? null, null);
});

test("DARK: a bare PENDING_AUTHENTICATION with no runnable challenge still fails cleanly", async () => {
  // Slice 1's behaviour, preserved: a challenge Oraya cannot run releases the
  // claim and tells the guest the truth. It must NOT park.
  const { store, rows } = makeFakeStore();
  const bare: ProviderAuthorizationResult = {
    ...CHALLENGE,
    step_up: undefined,
  };
  const deps = makeDeps(store, { authorize: async () => bare });
  const outcome = await runUnifiedCheckoutCompletion(deps, makeInput());

  assert.equal(outcome.kind, "declined");
  assert.equal(rows[0].status, "failed", "claim released for a genuine retry");
});
