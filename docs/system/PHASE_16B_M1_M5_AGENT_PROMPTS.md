# Phase 16B — dispatchable coding-agent prompts (M1 → M5)

**Date:** 2026-08-11
**Mission:** [PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md](PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md)
**Base:** `master` @ `7604a1f` (PR #136 merged)

Each prompt below is copy-paste ready and follows [AGENT_HANDOFF_TEMPLATE.md](AGENT_HANDOFF_TEMPLATE.md).

---

## Before dispatching anything — two hard prerequisites

**1. Do not reuse `C:\Users\David\Documents\Codex\2026-08-07\...\oraya-web-phase16b`.**
Its working tree is corrupted: files on disk are *older* than the commit its own HEAD points at (`lib/payments/credit-libanais.ts` is missing exports that HEAD's version exports; 20+ files show phantom modifications). Git cannot replace files there because the filesystem denies `unlink`. Any agent working in that folder compiles against stale code and will produce confident, wrong results.

Start every agent from a **fresh clone**:

```bash
git clone https://github.com/Staleen/oraya-web.git oraya-web-fresh
cd oraya-web-fresh && npm ci
```

**2. Run these in order, one at a time.** M2 depends on M1's classification work; M4 depends on M2's dispatcher; M5 depends on M4's states. M1 and M2 both touch `lib/payments/` — never in parallel.

---

## Sequencing

| Task | Depends on | Touches |
|---|---|---|
| M1 — void / auth-reversal + reason 481 | — | `lib/payments/`, `app/api/ops/payments/transactions/`, `components/ops/` |
| M2 — money-event dispatcher (guest receipt + owner alert) | M1 merged | `lib/payments/`, all four completion paths |
| M4 — payment-gated arrival guide | M2 merged | `lib/whatsapp/`, `lib/booking-guest-dispatch.ts`, settings |
| M5 — UI truth | M4 merged | `components/ops/`, `app/pay/`, booking views |

M3 (owner alert) is folded into M2. M0 is operator work — no agent.

---

# M1 — Void / authorization reversal + reason 481 classification

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md       — current state and non-negotiable constraints
2. /docs/system/CURRENT_PHASE.md       — what is in scope right now
3. /docs/system/AGENT_RULES.md         — how you must behave (mandatory)
4. /docs/system/ARCHITECTURE.md        — system shape
5. /docs/system/KNOWN_BUGS.md          — open issues to be aware of
6. /docs/system/DECISIONS_LOG.md       — why constraints exist
7. /docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md — the mission (section M1)
8. /docs/system/PHASE_16B_OPS_PAYMENTS_SESSION_HANDOVER.md — live CyberSource findings
9. /docs/system/REFUND_RUNBOOK.md      — operator-facing refund procedure

In your first response, list which of those files you read. If you skipped any, stop and explain why.

# Task
Make Oraya offer authorization reversal (void) instead of refund when a CyberSource authorization was approved but never settled, and classify Decision Manager reject 481 explicitly so Ops shows an actionable instruction instead of a generic ambiguous state.

Context you cannot infer from the repo:
- Live production evidence (merchant 06385000): two $1 authorizations returned Auth SUCCESS + Decision Manager REJECT 481 + Settlement "Not Run". A refund attempt against one of them failed with CyberSource reason 102 DINVALIDDATA, because a credit/refund is the wrong instrument for an unsettled authorization. Business Center's own guidance for these rows is Authorization Reversal, not Settle and not Refund.
- Decision Manager rejecting live authorizations for this merchant is an open provider-side issue with NetCommerce. Your job is to make Oraya represent that state correctly and offer the correct action — not to work around Decision Manager.
- The webhook plaintext-contract behaviour merged in 16bd4bc is deliberate: this org's registry has payloadEncryption=false, so CyberSource sends signed plaintext for this event. Signature verification, replay claiming and payload_encrypted recording must not be weakened.

# Rules (in addition to AGENT_RULES.md)
- Production logic OK.
- Claim-before-provider for any new provider call, exactly as the existing refund path does. An unknown or timed-out outcome becomes ambiguous/reconciliation — never an automatic retry, never an assumed success.
- A reversal is not a refund. Record it as its own ledger outcome. Do not write a refund row for it and do not reuse refund provider references.
- Never destroy or rewrite ledger history. The immutability trigger and its settle-protect exception stay as they are — sql/phase-16b-provider-refund-settle-protect.sql is ALREADY APPLIED on live; do not re-issue or modify it.
- Reverse (manual/cash bookkeeping) is a separate existing concept hard-locked to provider=manual. Do not merge it with provider authorization reversal and do not relax that lock.
- payments_live_enabled stays off. Do not add code that enables it.
- No secrets, no PAN, no full provider payloads in logs, errors, or docs.
- Do not edit any real .env file. Do not invent credentials.
- Do not push to master. Feature branch + PR. Minimal diff, no opportunistic refactors.
- If any required schema change is needed, write it as an additive SQL file for a human to run and state so explicitly — do not apply migrations yourself.

# Scope
- In scope: lib/payments/ (credit-libanais client, ledger helpers, webhook/completion classification), app/api/ops/payments/transactions/, components/ops/PaymentWorkspace.tsx, sql/ (new additive file only if required), docs/system/ (DECISIONS_LOG.md, REFUND_RUNBOOK.md, KNOWN_BUGS.md as behaviour changes).
- Out of scope: booking confirmation paths (app/api/ops/bookings/, app/api/admin/bookings/, app/api/booking-action/), lib/whatsapp/, lib/booking-guest-dispatch.ts, guest /pay redesign, Apple Pay enrollment, any Phase 15 surface.
- Schema changes: additive only, in a new sql/ file, human-run. Forbidden inline.
- New dependencies: forbidden.

# Acceptance criteria
1. Ops does not offer "Refund card" for a card receipt whose authorization never settled; it offers the void/authorization-reversal action instead, with copy that says why.
2. A reason-481 outcome surfaces in Ops as a Decision Manager rejection with the void instruction — not as a generic ambiguous attempt.
3. Voiding writes a distinct, auditable ledger outcome that does not present as a refund anywhere in the UI or the ledger.
4. A refund that returns 102 gives the operator copy that points at void rather than inviting a retry.
5. Existing refund behaviour for genuinely settled captures is unchanged.

# Verification required (run these and paste output)
- `npx tsc --noEmit`
- `npm run build`
- `node --test` on the payment test files that exist (scripts/payment-ops-reconciliation.test.mjs and lib/payments/*.test.mts), plus a new focused test for the settled-vs-unsettled decision and the 481 classification.

# Final report format (mandatory — see AGENT_RULES.md §8)
## Files changed
- path (created | modified | deleted) — one-line reason
## Build / typecheck
- `npx tsc --noEmit`: <exit code> — <relevant output or "clean">
- `npm run build`:    <exit code> — <relevant output or "clean">
## Tests
- <command>: <exit code> — <pass/fail count or "no tests for this surface">
## Risks
- <bullet list, or "no risks identified after <specific check>">
## Out of scope / not done
- <bullet list, or "n/a">
## Verification the human should run
- <one or two specific click-paths in Ops → Payments>
```

---

# M2 — One money-event dispatcher (guest receipt + owner alert, all four paths)

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md
2. /docs/system/CURRENT_PHASE.md
3. /docs/system/AGENT_RULES.md
4. /docs/system/ARCHITECTURE.md
5. /docs/system/KNOWN_BUGS.md
6. /docs/system/DECISIONS_LOG.md
7. /docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md — the mission (sections 1, 2, M2, M3)

In your first response, list which of those files you read. If you skipped any, stop and explain why.

# Task
Introduce a single "money was recorded" dispatcher that sends the guest a receipt and the operator an alert exactly once per payment, and call it from all four payment paths — including the webhook, which today notifies nobody.

Context you cannot infer from the repo:
- Audited 2026-08-11 against master. Today: app/api/payments/unified-checkout-complete (the booking's own card link) sends the guest NOTHING; app/api/payments/requests/unified-checkout-complete sends a receipt only when the payment request has a booking_id; app/api/ops/payments/transactions sends a receipt; the CyberSource webhook handler sends nothing at all. The only notification symbol in the whole money layer is sendLedgerBookingReceipt, imported in exactly two files.
- The webhook is the only path guaranteed to observe the money — a guest who closes the tab after 3DS never reaches the completion route. So the webhook must be able to notify, without becoming a place where a duplicate message can be produced when both paths see the same payment.
- The at-most-once pattern to mirror already exists in this repo: lib/whatsapp/confirmed-stay-notification.ts claims bookings.whatsapp_confirmation_sent_at atomically before its first POST. A duplicate guest message is worse than a late one.

# Rules (in addition to AGENT_RULES.md)
- Production logic OK.
- Exactly-once per payment, enforced by a persisted atomic claim keyed on the payment identity (payment_transactions.id or the attempt/idempotency key) — never by in-memory state and never by "did we already send" read-then-write without a conditional update.
- A notification failure must never roll back, block, or fail a payment. Log and continue, exactly as the confirmation dispatcher does today.
- Do not change any booking status. This task sends messages about money; it does not confirm, cancel, or approve anything.
- The receipt must work when the payment has no booking_id — use the payer contact on the payment request. An unlinked payment link must stop being a silent hole.
- Operator alert carries safe fields only: guest name, villa, dates, amount, method, booking reference. No PAN, no provider secrets, no tokens, no full provider payloads.
- Do not weaken webhook signature verification, replay claiming, or payload_encrypted recording (16bd4bc contract).
- payments_live_enabled stays off. No real .env edits. No invented credentials.
- Do not push to master. Feature branch + PR. Minimal diff, no opportunistic refactors.
- Any schema change is additive, in a new sql/ file, human-run, and called out explicitly in your report.

# Scope
- In scope: new lib/payments/money-event-dispatch.ts (or equivalent single module), lib/payments/ledger-receipt.ts, the four call sites (app/api/payments/unified-checkout-complete/, app/api/payments/requests/unified-checkout-complete/, app/api/ops/payments/transactions/, lib/payments/credit-libanais-webhook-handler.ts), lib/send-*-email.ts only if a template genuinely needs a new field, sql/ (new additive file if a claim column is required), docs/system/.
- Out of scope: booking confirmation paths, lib/whatsapp/, lib/booking-guest-dispatch.ts, the arrival guide, Ops UI redesign, refund/void logic from M1.
- Schema changes: additive only, human-run.
- New dependencies: forbidden.

# Acceptance criteria
1. A guest paying the booking's own card link receives a receipt. (Today they receive nothing.)
2. A guest paying an Ops payment link with no booking attached receives a receipt.
3. If only the webhook observes the payment (completion route never returns), the receipt is still sent.
4. When both the completion route and the webhook observe the same payment, exactly ONE receipt and ONE operator alert exist. Prove this with a test.
5. A manual cash/Whish/bank receipt recorded in Ops still sends exactly one receipt, as today.
6. Every recorded payment produces an operator alert; failed and ambiguous outcomes produce an operator alert that says so.
7. No booking status changes anywhere in this diff.

# Verification required (run these and paste output)
- `npx tsc --noEmit`
- `npm run build`
- `node --test` including new focused tests for: dual-observation idempotency (completion + webhook), no-booking receipt, and notification-failure-does-not-fail-payment.

# Final report format (mandatory — see AGENT_RULES.md §8)
[same structure as M1]
```

---

# M4 — Payment-gated arrival guide

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md
2. /docs/system/CURRENT_PHASE.md
3. /docs/system/AGENT_RULES.md
4. /docs/system/ARCHITECTURE.md
5. /docs/system/DECISIONS_LOG.md
6. /docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md — the mission (section M4)
7. Any Phase 16C WhatChimp doc in /docs/system/ — the arrival guide contract

In your first response, list which of those files you read. If you skipped any, stop and explain why.

# Task
Add an off-by-default setting that holds the WhatsApp Arrival Guide until the deposit has been received, and release it automatically when the money lands on an already-confirmed booking.

Context you cannot infer from the repo:
- Today the Arrival Guide WhatsApp fires purely on approval and never reads payment state. Live data on 2026-08-11: 20 confirmed bookings were unpaid, and 3 of them had already received the Arrival Guide having paid nothing. The arrival details are the product — shipping them before the deposit removes the guest's reason to pay.
- Booking approval must REMAIN an availability decision. Money must never confirm, approve, or cancel a booking. This is a standing Phase 16B non-negotiable — the gate only affects the arrival deliverable, never the status and never the confirmation email.
- The dispatcher from M2 is the release trigger. The existing at-most-once claim on bookings.whatsapp_confirmation_sent_at is the mechanism to preserve.

# Rules (in addition to AGENT_RULES.md)
- Production logic OK.
- New setting defaults to OFF, so merging this changes nothing until David turns it on.
- When the guide is held, do NOT consume the at-most-once claim — a held guide must still be sendable later exactly once.
- The confirmation email always sends regardless of the setting or payment state.
- Skips must be explicit and observable: add a distinct reason code for "awaiting deposit" alongside the existing skip reasons; never fail silently.
- The WhatsApp payload allow-list is unchanged: no PINs, no gate/door codes, no booking UUIDs, no payment links, no secrets.
- Do not change booking status logic, availability checks, or the confirmation writers' contracts.
- Do not push to master. Feature branch + PR. Minimal diff. Additive, human-run SQL only.
- New dependencies: forbidden.

# Scope
- In scope: lib/whatsapp/confirmed-stay-notification.ts, lib/booking-guest-dispatch.ts, the M2 dispatcher (release hook), settings storage + Ops settings surface for the new switch, app/api/ops/bookings/ only as needed for the manual override action, docs/system/.
- Out of scope: the confirmation email templates, availability logic, payment recording logic, Apple Pay, Phase 16D access codes.
- Schema changes: additive only, human-run.

# Acceptance criteria
1. Setting off (default): behaviour is byte-for-byte today's behaviour. Prove it with a test.
2. Setting on + confirmed + deposit unmet: guide is held with reason "awaiting deposit", claim NOT consumed, confirmation email still sent.
3. Setting on + money lands later on a confirmed booking meeting the threshold: guide is released automatically, exactly once.
4. Setting on + deposit already met at approval time: guide sends immediately as today.
5. Ops shows "Arrival guide held — awaiting deposit" and offers the owner a manual Send anyway override that also respects at-most-once.
6. No path lets money change booking status.

# Verification required (run these and paste output)
- `npx tsc --noEmit`
- `npm run build`
- `node --test` including new focused tests for all five acceptance states above.

# Final report format (mandatory — see AGENT_RULES.md §8)
[same structure as M1]
```

---

# M5 — UI truth

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md
2. /docs/system/CURRENT_PHASE.md
3. /docs/system/AGENT_RULES.md
4. /docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md — the mission (section M5)
5. /docs/system/PHASE_16B_OPS_PAYMENTS_PRODUCTION_MISSION.md — the desk this extends (closed mission, do not redo it)

In your first response, list which of those files you read. If you skipped any, stop and explain why.

# Task
Make one honest "where does this stay stand" state visible in Ops and to the guest, so approval status, money in versus owed, and arrival-guide state can be read without cross-referencing two screens.

Context you cannot infer from the repo:
- Two live rows are payment_status=paid_in_full with amount_total NULL (legacy manual receipts). Any UI that renders "fully paid" from those rows is asserting something the data cannot support.
- The Ops Payments desk shipped in PRs #133–#134 is production-usable and its mission is closed. Extend it. Do not redesign it and do not reopen its settled UX decisions.

# Rules (in addition to AGENT_RULES.md)
- Presentation logic OK. No new money-moving behaviour, no new provider calls, no status writes in this task.
- Never render "paid in full" from a row whose amount_total is NULL or zero — say "payment recorded" instead.
- Reuse the existing desk's components, language, and money-safety copy. No new design system.
- Do not push to master. Feature branch + PR. Minimal diff, no opportunistic refactors.
- New dependencies: forbidden. Schema changes: forbidden in this task.

# Scope
- In scope: components/ops/ (booking row/detail state line), app/ops/ views, app/pay/[token] success state, the guest booking view's payment summary.
- Out of scope: any lib/payments/ money logic, webhook handling, confirmation writers, the Ops Payments desk's existing information architecture.

# Acceptance criteria
1. An Ops booking row/detail shows: approved or not, money in versus owed, and arrival guide sent / held / skipped — in one place.
2. Guest /pay success and the booking view state what was paid and what remains.
3. No surface claims "paid in full" for a NULL-total row.
4. Existing Ops Payments desk behaviour and copy are unchanged except where this task explicitly adds the state line.

# Verification required (run these and paste output)
- `npx tsc --noEmit`
- `npm run build`
- `node --test` for any touched contract tests (scripts/payment-ops-reconciliation.test.mjs asserts Ops copy — update it deliberately, and say so, if copy changes).

# Final report format (mandatory — see AGENT_RULES.md §8)
[same structure as M1]
```

---

## Reviewing each agent's report before approval

Reject the report and ask for a revision if any of these are true:

- It did not list the docs it read.
- Build/typecheck exit codes are claimed rather than pasted.
- "No risks identified" appears without naming the specific check that produced that conclusion.
- It touched a path outside its declared scope.
- It applied SQL itself instead of writing an additive file for a human to run.
- It claims a money-path behaviour works without a test that exercises the failure ordering (provider timeout, duplicate observation, zero-row update).

Agent completion is not approval. The sequence stays: prompt approved → agent dispatched → evidence reviewed → human preview/production check → approve → merge.
