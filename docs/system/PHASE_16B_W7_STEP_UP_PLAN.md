# Phase 16B W7 — 3-D Secure step-up: what shipped, and what a challenge screen needs

**Date:** 2026-08-13
**Author:** Claude (W7 slices 1–2 executing agent)
**Branch:** `claude/w7-slices-1-2`
**Mission item:** [PHASE_16B_PRODUCTION_GRADE_MISSION.md](PHASE_16B_PRODUCTION_GRADE_MISSION.md) §W7
**Scope of the shipping PR:** slices 1 and 2 only. Slices 3–6 (the step-up screen itself) were deferred by the owner on 2026-08-12 and are **specified here, not built.**

---

## 0. Why W7 exists

`DECISION_SKIP` turned Decision Manager off on merchant `06385000` (DECISIONS_LOG 2026-08-11) because DM rejected every issuer-approved authorization with reason 481. That was the right call — it is the only reason cards work at all — but it means **3-D Secure is now the only fraud control Oraya has**, and it is not authenticating: the live transactions on 2026-08-11 returned `ECI 7` with an empty `XID` and `CAVV`.

The acceptance test for W7 as a whole is unchanged: **a live transaction returns `ECI 5` with a populated CAVV.** Slices 1–2 do not achieve that. They remove the two things that made attempting it unsafe.

---

## 1. What slices 1–2 changed

### Slice 1 — reason 475 is retry-safe, not ambiguous

CyberSource answers a 3-D Secure step-up with status `PENDING_AUTHENTICATION` (reason **475**). It stops **before** authorizing: no payment resource is created, no hold is placed, no money moves.

Oraya classified that status as `unknown`, which marks the attempt `ambiguous`. An `ambiguous` attempt is a blocking attempt ([payment-attempts-store.ts:59](../../lib/payments/payment-attempts-store.ts)) and only `recorded` or `failed` may follow it, so **a guest whose bank merely asked a question was locked out of paying Oraya permanently**, pending manual reconciliation of a payment that never existed. Turning 3DS on without fixing this would have converted every challenged guest into a support ticket.

`PENDING_AUTHENTICATION` now sits with the other non-charge statuses in `RETRY_SAFE_PROVIDER_PAYMENT_STATUSES`, so the outcome classifies `declined`, the attempt goes `claimed → failed`, and the claim is released for a genuine retry.

Two consequences worth stating plainly:

- **It is not a decline, and the guest is not told it is one.** `ProviderAuthorizationResult` gained an optional `challenge_required` flag, set from the authorization response (`PENDING_AUTHENTICATION`, or a `stepUpUrl`). Both completion routes branch their guest copy on it, because both write their own wording rather than echoing `provider.message`. A challenged guest is told their bank wants to verify the payment, that nothing was charged, and to try another card or message Oraya — not "payment was not approved", which would send them to their bank about a perfectly good card.
- **Nothing is voided on a 475.** `credit-libanais.ts` forces the payer-authentication decision to `proceed` whenever the outcome is not `approved`, so the strict-3DS reversal path cannot fire here. Correct: there is no authorization to reverse.

### Slice 2 — `frictionless_only` is retired

The mode promised "never blocks a guest": take the liability shift when the issuer verifies silently, and continue **without** it when the issuer wants a challenge. The second half is not deliverable. `PENDING_AUTHENTICATION` is not an authorization Oraya can choose to accept — there is nothing to continue with. A challenged guest was turned away in that mode exactly as in `required`; the mode changed only the wording of the refusal while telling the operator nobody would ever be stopped.

It is retired in two places, deliberately not one:

- **Save time** — `validatePayerAuthenticationSetting` refuses it with an explicit message naming what to choose instead. This is the anti-silent-downgrade half.
- **Runtime** — `resolveEffectivePayerAuthenticationMode` maps it to `off`, so a legacy or hand-edited `settings` row can never activate it. It resolves to `off` rather than `required` because `required` would start refusing real cards on a setting nobody deliberately chose.

**The mapping is deliberately NOT inside `parsePayerAuthenticationMode`.** The save path parses before it validates ([app/api/ops/setup/site/route.ts:119-127](../../app/api/ops/setup/site/route.ts)), so downgrading at parse time would mean the validator never sees the value: the operator picks a setting, sees no objection, and silently gets a different one. That is the exact failure mode of KNOWN_BUGS #20, on the same payment surface.

**Known gap, deliberately out of scope:** `app/ops/**` was out of scope for this PR, so the Ops → Setup → Site dropdown still offers "On, silent only" and `describeChanges()` still has a sentence for it. The save is refused with a clear message, so nothing is silent — but the option should be removed from [app/ops/site/page.tsx](../../app/ops/site/page.tsx) the next time that file is legitimately in scope.

**Live impact: none.** The stored production value of `card_checkout_behaviour.payer_authentication` is `off` (verified read-only against live Supabase, 2026-08-13). No row anywhere holds `frictionless_only`.

### What slices 1–2 do NOT do

They do not make 3DS authenticate. With `off` (today) nothing changes at all. With `required`, a challenged guest is now turned away **cleanly and honestly** instead of being locked out — which is the precondition for slices 3–6, not a substitute for them.

---

## 2. The step-up contract (slices 3–6, not built)

### 2.1 It is two calls, not one

This is the single most important fact, and the reason a step-up cannot be bolted onto the existing single-call path.

| | Call | `actionList` | Purpose |
|---|---|---|---|
| 1 | `POST /pts/v2/payments` | `["DECISION_SKIP", "CONSUMER_AUTHENTICATION"]` | Enrolment check. Either authenticates silently, or returns `PENDING_AUTHENTICATION` + a step-up URL + an access token. **Does not authorize.** |
| 2 | `POST /pts/v2/payments` | `["DECISION_SKIP", "VALIDATE_CONSUMER_AUTHENTICATION"]` | After the cardholder finishes the bank's challenge: validates the result and **authorizes in the same call**. |

The two calls are threaded by **`consumerAuthenticationInformation.authenticationTransactionId`**, returned by call 1 and sent back on call 2. Losing it means the challenge cannot be validated and the payment cannot complete.

`DECISION_SKIP` **must ride on both calls.** Omitting it from call 2 sends the authorization — the one that actually moves money — straight into the Decision Manager that rejects everything with 481. This is the easiest way to build something that appears to work in a challenge test and then declines every real payment.

Slice 1 already guarantees that a call-1 challenge which is never validated leaves no charge and no lock. That property must survive: **call 2 is the only call that authorizes.**

### 2.2 The return URL is baked into the step-up JWT

Call 1 returns a step-up URL and an `accessToken` (a JWT). The browser POSTs that JWT to the step-up URL inside an iframe; the bank runs its challenge; the bank then POSTs the result back to a **return URL that is a claim inside the JWT Oraya requested** — it is not a parameter the browser can choose at post-back time.

Consequences:

- The return URL must be an absolute Oraya URL on the canonical origin, minted server-side. It cannot be derived from a request header on the way back.
- The current production redirect means the effective checkout host is `www.stayoraya.com` (PROJECT_STATE / CURRENT_PHASE). The return URL must match the host that actually serves checkout, or the bank's post-back lands nowhere.
- It follows that a **new route** is needed — the post-back is a browser-driven `POST` from a third party, not a fetch from Oraya's own page.

### 2.3 A new attempt state: `pending_authentication`

The existing five-state ledger cannot express "waiting for a human at their bank". Today an attempt is either in flight, terminal, or ambiguous, and slice 1 deliberately makes a challenge `failed` because Oraya cannot wait.

Slices 3–6 need a sixth state, `pending_authentication`, with:

- **Allowed transitions:** `claimed → pending_authentication`, then `pending_authentication → authorized | recorded | failed | ambiguous`. Nothing may leave `recorded` or `failed`; that invariant is untouched.
- **Blocking:** it joins `["claimed","authorized","ambiguous"]` in `findBlockingAttempt`, so a guest cannot open a second payment while one challenge is open.
- **Stored with it:** the `authenticationTransactionId` and a hard deadline. This is additive; the migration stays additive and human-run per the standing constraints.
- **A TTL reaper.** Bank challenge pages get abandoned constantly — the guest closes the tab, the SMS never arrives, the phone dies. Without a reaper every abandonment is a permanent lock, which is the bug slice 1 just fixed, reintroduced in a new state. The reaper moves expired `pending_authentication` attempts to `failed` (no money moved on call 1, so the claim is genuinely safe to release) after a TTL comfortably longer than a real challenge — 15 minutes is the working figure, and it must exceed the capture-context TTL of 20 minutes only if the session is re-minted; otherwise the guest gets a dead form.

---

## 3. The two sharpest risks

### 3.1 Never trust the browser's post-back

The bank's result arrives at Oraya **through the guest's browser**. It is attacker-controlled input, from a page Oraya does not own, on a route that by construction cannot require an Oraya session.

- The post-back is a **trigger, not evidence.** Nothing in it may be treated as proof that authentication succeeded. It says "go look", and Oraya looks by making call 2 server-side with the `authenticationTransactionId` **read from Oraya's own attempt row**, never from the post-back body.
- The route must resolve the attempt from a value it minted itself (the attempt id, or a signed token — the existing `booking_action_token` HMAC pattern is the house precedent), and must not accept an attempt id supplied as a bare parameter, or one guest can drive another guest's payment.
- Amount and currency stay server-authoritative on call 2, as they already are on the single-call path.
- The post-back may arrive **twice** (browser retry, double submit, guest refreshing the bank's success page). The compare-and-set transition out of `pending_authentication` is what makes the second one a no-op; it must be a guarded transition, not a read-then-write.

This is the same principle already written down for success redirects — "browser returns remain informational" — applied to a POST that is much easier to mistake for authority because it carries a payload.

### 3.2 A reaped attempt can still come back and validate

The nastiest interleaving, and it is not hypothetical: the reaper fires at the TTL, the attempt goes `failed`, the claim is released — and **then** the guest finally finishes the challenge and the post-back arrives.

If call 2 runs at that point it authorizes a payment against an attempt Oraya has already written off, and the guest may by then have started (or completed) a second payment on the released claim. That is a double charge produced by Oraya's own bookkeeping.

The rule: **call 2 is made only after a compare-and-set that moves the attempt out of `pending_authentication`.** If the CAS fails — because the reaper already moved it to `failed`, or because a concurrent post-back won — the provider is **not called at all**, and the guest is told the verification window expired and to start again. No provider call, no charge, no ambiguity.

The reaper is also why the TTL must be a stored deadline on the row rather than a query-time interval: the reaper and the post-back must agree on exactly one expiry instant, and CAS on the row is what makes them agree.

---

## 4. Slice map

| Slice | Work | Status |
|---|---|---|
| 1 | Reason 475 retry-safe; `challenge_required` guest copy on both completion routes | **Shipped** |
| 2 | Retire `frictionless_only` (save-time refusal + runtime resolution) | **Shipped** |
| 3 | `pending_authentication` attempt state + additive migration + TTL deadline + reaper | **Shipped 2026-08-13** (`claude/w7-step-up`) |
| 4 | Call 1 / call 2 split, threaded by `authenticationTransactionId`, `DECISION_SKIP` on both | **Shipped 2026-08-13** |
| 5 | Step-up iframe page + post-back route (untrusted input; CAS before call 2) | **Shipped 2026-08-13** |
| 6 | The real-card window: switch 3DS on, prove `ECI 5` + CAVV, switch back | Owner's — not built |

Slices 3–5 landed together, as required: 3 without 5 is a state nothing writes,
and 5 without a reaper is the permanent lock this document exists to prevent. The
reaper moved from slice 6 into slice 3 with them, so nothing shipped that could
strand a guest.

**What shipped, and what it deliberately does not do:**

- **The TTL is 15 minutes**, and it sits INSIDE the 20-minute capture-context
  window rather than outside it. Call 2 re-presents the transient token that the
  capture context minted, so a step-up window longer than the context would hand
  the guest a challenge they can finish and a token that can no longer pay with
  it. The residual case — a guest who idles on the card form before submitting,
  pushing call 1 late enough that the deadline outlives the context — fails as a
  retry-safe non-charge, never a lock and never a charge.
- **`pending_authentication -> claimed` was added** to the transition list this
  document specified. "Move the attempt out of `pending_authentication` before
  calling the provider" needs a non-terminal destination; `claimed` is the state
  that already means "in flight with the provider", and handing the row back to
  it also takes it out of the reaper's reach while call 2 runs.
- **The post-back route calls nothing and decides nothing.** It verifies an HMAC
  token Oraya minted, reaps expired challenges, and posts one fixed message to
  the parent window. It never parses the body, so there is no field in it that a
  later change could mistake for authority. The parent then asks the completion
  route to look, and call 2's server-side response is the only evidence.
- **Ops visibility of open challenges is NOT built** — `app/ops/**` was out of
  scope. Until it exists, `select … where status = 'pending_authentication'`
  (the migration's operator notes) is how an operator sees them. In practice the
  reaper clears them within 15 minutes.
- **Everything is dark.** The mode is `off` in production; the enrolment action
  is not sent, the request body is byte-identical to today's (pinned by a test),
  the step-up branch in the adapter is gated on the effective mode being
  `required`, and the new attempt state is unreachable.

## 5. Standing constraints that apply to slices 3–6

Unchanged from the mission: feature branch only; claim-before-provider; unknown outcomes stay ambiguous and are never auto-retried; migrations additive and human-run; no secrets or PAN anywhere; Business Center is the source of truth for whether money moved. Strict 3DS remains save-time-incompatible with immediate capture — a step-up narrows that constraint but does not remove it, because the `not_authenticated` verdict still lands after capture.
