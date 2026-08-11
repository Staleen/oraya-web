# Phase 16B — Money → Confirmation → Guest Notification: audit and completion mission

**Date:** 2026-08-11
**Author:** Claude (Phase 16B executing agent, per DECISIONS 2026-08-10)
**Audit basis:** `origin/master` @ `cc29551` (post PR #135) + read-only queries against live Supabase `nxsdgjtqrhturlojtjlb`
**Supersedes as active mission:** [PHASE_16B_OPS_PAYMENTS_PRODUCTION_MISSION.md](PHASE_16B_OPS_PAYMENTS_PRODUCTION_MISSION.md) — every P0/P1/P2 item there is DONE; that mission is closed.
**Reads with:** [PHASE_16B_OPS_PAYMENTS_SESSION_HANDOVER.md](PHASE_16B_OPS_PAYMENTS_SESSION_HANDOVER.md) (PR #136), [PHASE_16B_CARD_PRODUCTION_ACTIVATION_MISSION.md](PHASE_16B_CARD_PRODUCTION_ACTIVATION_MISSION.md), [AGENT_RULES.md](AGENT_RULES.md)

---

## 0. Why this document exists

The operator's stated mental model was:

> "Payment confirms the booking, and then the webhook sends the confirmation email and the WhatsApp."

**That is not what the code does — in any path.** This document states exactly how it works today, judges each link as correct or defective, and lays out the mission that finishes the money → confirmation → notification chain.

Every claim in Section 1–3 is grounded in a named file/line or a live query. Nothing here is aspiration.

---

## 1. How it actually works today (as-is)

The system has **two independent halves that never call each other.**

### Half A — Confirmation (availability decision). No money awareness whatsoever.

Three authoritative writers set `bookings.status = 'confirmed'`:

| Writer | Path | Trigger |
|---|---|---|
| Ops desk | `app/api/ops/bookings/[id]/route.ts:797` | Staff clicks Approve |
| Legacy admin | `app/api/admin/bookings/[id]/route.ts:520` | Admin clicks Confirm |
| One-click token | `app/api/booking-action/route.ts:50` | Owner clicks the link in the request email |

All three: check availability conflict → conditional `update … .eq("status","pending")` (row-count verified, exclusion-constraint safe) → call the single guest dispatcher.

`lib/booking-guest-dispatch.ts::dispatchBookingStatusGuestMessages` then does, in order:

1. **Confirmation email** — `sendEventConfirmationEmail` for a confirmed event inquiry, else `sendBookingEmail(status)`. Failure logged, never thrown.
2. **WhatsApp Arrival Guide** — `dispatchConfirmedStayWhatsAppNotification` (Phase 16C, WhatChimp Architecture A, template `oraya_arrival_guide_confirmed`), fail-closed, at-most-once via atomic claim on `bookings.whatsapp_confirmation_sent_at`. Gates: confirmed + not event-inquiry + webhook URL configured + production env + recipient phone + stay not over + reference/URL mint.

**Neither the email nor the WhatsApp consults `payment_status`, `amount_paid`, or the ledger. Not once.**

### Half B — Money. Four separate receipt paths, three different notification behaviours.

| # | Path | Writes | Guest email? | WhatsApp? |
|---|---|---|---|---|
| B1 | `app/api/payments/unified-checkout-complete/route.ts` — guest pays the **booking's own** card link | booking `payment_status`, `amount_paid`, `amount_due`, `payment_link_status='paid'`, `payment_reference` | **NO — nothing** | No |
| B2 | `app/api/payments/requests/unified-checkout-complete/route.ts` — guest pays an **Ops payment link** | ledger `payment_transactions` + request state; booking only if linked | Yes — `sendLedgerBookingReceipt` (line 183), **only if `payment.booking_id` is set** | No |
| B3 | `app/api/ops/payments/transactions/route.ts` — staff records cash/Whish/OMT/bank receipt | RPC `oraya_record_manual_payment` | Yes — `sendLedgerBookingReceipt` (line 86), only if `booking_id` given | No |
| B4 | `app/api/payments/webhook/[provider]` → `lib/payments/credit-libanais-webhook-handler.ts` | reconciles the attempt; records ledger payment or updates booking payment fields (line 43 `recordPaymentOnBooking`) | **NO — nothing** | No |

Verified by grep across `app/api/payments/**` and `lib/payments/**`: the only notification symbol anywhere in the money code is `sendLedgerBookingReceipt`, imported in exactly two files (B2, B3).

### The webhook, specifically

`app/api/payments/webhook/[provider]/route.ts` is 9 lines delegating to the handler. The handler's job is **ledger truth and attempt reconciliation only** — signature verification, replay claiming, `payment_provider_events` recording, attempt state machine. It sends the guest nothing. It sends the owner nothing.

So: **the webhook does not send the confirmation email. The webhook does not send the WhatsApp. The webhook has never sent any message to anybody.**

### Live data agrees

| Booking state | Rows | WhatsApp sent |
|---|---|---|
| confirmed + unpaid | 20 | **3** |
| confirmed + paid_in_full | 5 | 0 |
| confirmed + payment_requested | 2 | 1 |
| cancelled (various) | 25 | 2 |
| pending | 5 | 0 |

Three guests received the Arrival Guide WhatsApp having paid nothing. Zero fully-paid guests received it. (The paid rows predate Phase 16C, so their `0` is expected — but the `3` on unpaid rows is the live proof that money is not a gate.) Two paid rows (`818e6210`, `8c63039c`) are `paid_in_full` with `amount_total` NULL — legacy manual rows where "in full" was asserted against no total.

---

## 2. Realistic end-to-end scenario, exactly as it runs today

**Guest requests 3 nights at Villa X, $1,795, deposit $500.**

1. Guest submits the booking form → `bookings` row, `status='pending'`, `payment_status='unpaid'`. Owner gets the request email with one-click links.
2. **Owner clicks Approve** (email link, /ops, or /admin).
   - Availability re-checked, `status → 'confirmed'`.
   - Guest immediately receives the **confirmation email**.
   - Guest immediately receives the **WhatsApp Arrival Guide** with the personalised arrival link.
   - **Money received so far: $0.** Nothing checked it.
3. Owner opens Ops → Payments, creates a payment link for $500 (or uses the booking's request-deposit action, which requires `status='confirmed'` — `app/api/ops/bookings/[id]/route.ts:299`).
4. Guest pays by card.
   - If it's an **Ops payment link** (B2): ledger transaction recorded, and *if the link was attached to the booking*, a "payment received" email goes out. If the operator forgot to attach the booking, **the guest gets nothing and the booking's own payment fields never move.**
   - If it's the **booking's own link** (B1): booking flips to `deposit_paid` / `paid_in_full`, guest is redirected to the success view — **and receives no email at all.**
5. Webhook arrives from CyberSource seconds later → attempt reconciled, ledger/booking made consistent → **silence to everyone**.
6. Balance owing: `sendPaymentReminders` (`lib/payment-reminders.ts:89`) chases only `status='confirmed'` + `payment_status='payment_requested'` bookings.
7. Guest arrives using an Arrival Guide link they got at step 2 — potentially having paid nothing at all.

**Failure variant that matters:** guest completes 3DS, then closes the tab before the browser returns to `unified-checkout-complete`. The webhook (B4) still records the money correctly — good. But the guest receives no receipt, the operator gets no alert, and the only surface that shows it is the Ops ledger if someone looks. The guest, seeing no confirmation of payment, pays again.

---

## 3. Verdict — what is right, what is wrong

| Link in the chain | Verdict | Reasoning |
|---|---|---|
| Confirmation is an availability decision, not a money event | ✅ **Correct — keep** | Dates are the scarce resource, and "booking approval ≠ payment receipt" is a standing Phase 16B non-negotiable. Auto-confirming on money would let anyone with a link seize a date. |
| Single shared guest dispatcher for confirm/cancel | ✅ **Correct** | One copy = no double-messaging. Well factored. |
| WhatsApp at-most-once claim, fail-closed, allow-listed payload | ✅ **Correct** | Genuinely careful work: no PINs, no UUIDs, no payment links, no retry after claim. |
| Webhook = ledger truth only, no side-effect messaging | ⚠️ **Correct as designed, wrong as a whole** | Keeping the verified/replay-safe webhook narrow is right. But since it is the *only* path guaranteed to see the money, the system currently has a guaranteed-truth path with zero ability to inform anyone. |
| B1 (booking card payment) sends no receipt | ❌ **Defect** | Guest pays hundreds of dollars and receives silence. Asymmetric with B2/B3 for no reason. Drives duplicate payments and support load. |
| Receipt email depends on `booking_id` being attached to the link | ❌ **Defect** | A silent operator error (unlinked link) becomes a silent guest experience. |
| Arrival Guide WhatsApp fires with $0 received | ❌ **Business defect** | Arrival details are the deliverable. Shipping them before the deposit removes the guest's reason to pay. Live data shows this has already happened 3×. |
| Nothing notifies the owner when money lands | ❌ **Gap** | The operator learns about money only by opening the desk. No pull, no push. |
| Refund offered on an unsettled auth (DM 481) | ❌ **Defect (known)** | From the Cursor handover: refund is the wrong instrument for an unsettled auth → CyberSource `102 DINVALIDDATA`. Needs auth-reversal/void. |
| `paid_in_full` computable against NULL `amount_total` | ⚠️ **Data-integrity smell** | Two live rows. Current code guards (`amountTotal > 0 && …`), so this is legacy residue, but any UI that says "fully paid" from those rows is asserting something unverifiable. |
| Money-safety core (claim-before-provider, ambiguous never retried, ledger immutability + settle-protect) | ✅ **Correct** | Verified live: `oraya_protect_payment_transaction_facts` carries the `settling_pending_refund` branch; all four refund RPCs exist. |

**Summary judgement:** the money layer is *safe* and the confirmation layer is *safe*, but they are **not connected**, and the connection points that do exist are inconsistent. The system will not lose or double-charge money — it will simply fail to tell anyone what happened, and will hand over arrival details before being paid.

---

## 4. Target behaviour (to-be)

One sentence: **approval stays the owner's availability decision; money becomes an event that (a) always notifies, and (b) unlocks the arrival deliverable.**

```
Guest request → PENDING
      │
      ▼  owner approves (availability only)          ┌─ confirmation email  (immediately, as today)
   CONFIRMED ─────────────────────────────────────── ┤
      │                                              └─ arrival WhatsApp  ── HELD if deposit policy on & unpaid
      ▼  money lands via B1 / B2 / B3 / B4
   money-recorded event (exactly once per transaction)
      ├─ guest receipt email          (all four paths)
      ├─ owner/ops money alert        (all four paths)
      └─ release held arrival WhatsApp, if the booking is confirmed and the deposit threshold is now met
```

Two policy switches, both default-safe:

- `payment_gated_arrival_guide` (settings, default **off** → today's behaviour preserved until David turns it on)
- deposit threshold source: existing `deposit_amount` / `amount_total`, no new pricing concepts

---

## 5. Mission plan

Ordering rule: **operator cleanup first, correctness second, notification third, policy fourth, UI fifth, rehearsal last.** No two implementation tasks touch overlapping files in parallel.

### M0 — Finish the live activation cleanup (operator, no code) — *blocking everything*

| # | Action | Done when |
|---|---|---|
| M0.1 | Ops → Resolve refund on `7863958223886680704897` → "No refund in Business Center" → note `credit failed 102 DINVALIDDATA` → Release | Pending refund `2f605db7` leaves `pending` |
| M0.2 | Business Center: **Authorization Reversal (void)** on `7863969294066269704890` and `7863958223886680704897`. Not Settle. Not Refund. | Both auths voided |
| M0.3 | Ops → clear both attention attempts via "No charge in BC" with the void note | Attention list empty |
| M0.4 | Escalate **Decision Manager reject 481** on merchant `06385000` to NetCommerce | Written reply from NetCommerce |
| M0.5 | Squash-merge PR #136 (docs only) | Handover on master |

Settle-protect SQL is **already applied on live** (verified 2026-08-11) — do not re-run it.

### M1 — Money-truth correctness (code) — one branch, one PR

1. Do **not** offer *Refund card* when the authorisation never settled — read the settlement state, not just the presence of a card receipt.
2. Add an owner-safe **Authorization Reversal (void)** action: CyberSource auth-reversal, claim-before-provider, ledger outcome that records a *reversal*, never invents a refund.
3. Classify **reason 481** explicitly in completion + webhook paths so Ops shows "Decision Manager rejected — void / auth reverse", not generic `ambiguous`.
4. Owner-facing copy when a refund returns `102`, pointing at void.

**Protected:** the plaintext-contract webhook verification merged in `16bd4bc` — signature verification, replay claiming and `payload_encrypted` recording must not be weakened. Existing refund RPCs and the immutability trigger stay as-is.

### M2 — One money-notification spine (code) — depends on M1

1. Create a single `lib/payments/money-event-dispatch.ts`: *"a payment of X was recorded against subject Y"* → guest receipt + owner alert, **at-most-once per `payment_transactions.id` / attempt id**, persisted claim (mirror the `whatsapp_confirmation_sent_at` pattern — a duplicate receipt is worse than a late one).
2. Call it from **all four** paths: B1, B2, B3, and B4 (webhook).
3. Make the receipt work when the payment has **no** `booking_id` (payer email on the request) so an unlinked link is no longer a silent hole.
4. Idempotency must hold when B1 and B4 both see the same money — the guest gets **one** receipt.

**Acceptance:** pay a booking card link → receipt arrives. Kill the browser mid-redirect so only the webhook lands → receipt still arrives, exactly one.

### M3 — Owner/ops money alert — folded into M2's dispatcher

Email (and, if the WhatChimp workflow allows a non-guest recipient, WhatsApp) to the operator on every recorded payment and every failed/ambiguous outcome. Safe fields only: guest name, villa, dates, amount, method, booking reference. **No PAN, no provider secrets, no tokens.**

### M4 — Payment-gated arrival guide (policy) — depends on M2

1. Add setting `payment_gated_arrival_guide`, default **off**.
2. When **on**: at confirmation, if the deposit threshold is unmet, skip the WhatsApp with a new explicit reason `awaiting_deposit` (do **not** consume the at-most-once claim).
3. When money later lands and the booking is confirmed and the threshold is met → the M2 dispatcher releases the held Arrival Guide, still at-most-once.
4. Ops booking view shows "Arrival guide held — awaiting deposit" with a manual **Send anyway** override for the owner.
5. Confirmation email always sends regardless of the switch — only the arrival deliverable is gated.

### M5 — UI truth (code)

1. Ops booking row/detail: one honest state line — *approved?* / *money in vs owed* / *arrival guide sent, held, or skipped* — replacing the current need to cross-read two screens.
2. Guest `/pay` success and the booking view: state what was paid and what remains.
3. Never render "paid in full" from a row whose `amount_total` is NULL — say "payment recorded" instead.
4. Extend the existing desk. Do not redesign it.

### M6 — Rehearsal, real-card window, docs

1. Staging rehearsal of the full chain, including the webhook-only variant.
2. Controlled real-card window with David present (Activation Mission step 6), `payments_live_enabled` on only inside the window.
3. Refund/reconciliation/settlement pass (step 7).
4. Update `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `DECISIONS_LOG.md`, `REFUND_RUNBOOK.md` in the same PRs as the behaviour they describe.

---

## 6. Standing constraints for every task above

- Feature branch only, never direct `master`; minimal diff; no opportunistic refactors.
- `payments_live_enabled` stays **off** outside an approved window.
- Claim-before-provider; unknown outcomes → ambiguous/reconciliation, never auto-retried.
- Reverse ≠ refund; never destroy ledger history.
- No new dependencies without explicit approval; no real `.env` edits; no secrets or PAN in logs, payloads, or docs.
- Migrations are additive and human-run; paste any required SQL **in full, inline** — never a path alone.
- Every task ends with an evidence-based report: files changed, `npx tsc --noEmit` exit code, `npm run build` exit code, focused tests or an explicit "none exist", risks tied to actual checks, out-of-scope list, and human verification steps.
- Business Center is the source of truth for whether money moved; the Oraya ledger follows it.

---

## 7. Open items not in scope here

Apple Pay enrollment · auto-reconcile via BC transaction-search API · guest `/pay` redesign · Phase 15 surfaces · Phase 16D PIN pool.
