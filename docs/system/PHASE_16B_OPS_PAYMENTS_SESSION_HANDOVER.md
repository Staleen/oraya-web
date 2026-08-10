# Phase 16B — Ops Payments session handover (for Claude)

**Date:** 2026-08-10 / 2026-08-11 (EEST)  
**Owner:** David Hourany  
**Handoff from:** Cursor Cloud Agent session (Ops Payments mess → production desk + live BC triage)  
**Canonical product mission:** [PHASE_16B_OPS_PAYMENTS_PRODUCTION_MISSION.md](PHASE_16B_OPS_PAYMENTS_PRODUCTION_MISSION.md)  
**Refund ops:** [REFUND_RUNBOOK.md](REFUND_RUNBOOK.md)  
**Source of truth:** [PROJECT_STATE.md](../../PROJECT_STATE.md) — Phase 15 locked; Phase 16 money work continues.

---

## 1. Why this handover exists

David’s Ops → Payments page was unusable during live NetCommerce/CyberSource activation:
- Cancelled payment links stuck forever (no delete)
- “Provider readiness and reconciliation” was bank jargon
- Ambiguous `$1` attempts + unfinished refunds with no owner actions
- Mistaken **Reverse** on a card receipt hid refund UX
- Live refund release failed due to a ledger immutability bug

This session shipped a production Ops money desk, live BC triage of the `$1` activation mess, and hotfixes so Release/Record refund can work.

**Not claimed:** “payments system complete” or “activation mess already cleared in production.” Operator SQL + BC voids + DM fix with NetCommerce remain.

---

## 2. Merged PRs this arc (newest last)

| PR | Title | Status |
|---|---|---|
| [#128](https://github.com/Staleen/oraya-web/pull/128) | Stop requesting response MLE on `/pts/v2/payments` | Merged (pre/session context) |
| [#129](https://github.com/Staleen/oraya-web/pull/129) | Plaintext `/pts/v2/payments` by default (fix 401) | Merged |
| [#130](https://github.com/Staleen/oraya-web/pull/130) | Success redirect after verified card approval | Merged |
| [#131](https://github.com/Staleen/oraya-web/pull/131) | One-click Ops card refund (claim-before-provider) | Merged |
| [#132](https://github.com/Staleen/oraya-web/pull/132) | Refund card still available after mistaken Reverse | Merged |
| [#133](https://github.com/Staleen/oraya-web/pull/133) | Production-grade Ops Payments desk | Merged |
| [#134](https://github.com/Staleen/oraya-web/pull/134) | Search, purge unused closed, dismiss events | Merged |
| [#135](https://github.com/Staleen/oraya-web/pull/135) | Unblock Release refund lock (immutability hotfix) | Merged |

`master` tip at handoff time included #135 (`cc29551` family).

---

## 3. What the Ops Payments page is now

### Information architecture
- Tabs: **Collect money** vs **Website settings**
- Lists: **Collecting** / **Collected** / **Closed**
- Search: guest / villa / email / description
- Optional settlement totals toggle
- Closed → **Clear N unused** (bulk delete safe links only)

### Money actions
| Action | Meaning |
|---|---|
| **Copy link** | Only while link is payable |
| **Record receipt** | Cash/manual already received |
| **Cancel / Delete** | Cancel active; delete closed with no ledger + no open attempts |
| **Refund card** | Owner; claim → CyberSource → confirm |
| **Resolve refund** | Record BC refund id **or** Release if BC shows no refund |
| **Reverse** | Manual/cash bookkeeping only (API + SQL hard-locked) |
| **No charge in BC / Charge already in Oraya** | Owner resolve stuck payment attempts |
| **Dismiss** | Ignore unfinished provider events |

### Money-safety rules (do not reverse)
1. Never destroy ledger history.
2. Never retry card charge/refund after ambiguous gateway outcome until BC checked.
3. Reverse ≠ refund; Reverse never returns card money.
4. Claim-before-provider for card refunds.
5. Delete/purge only with zero `payment_transactions` and no in-flight attempts.

---

## 4. Live CyberSource findings (authoritative for the stuck `$1`s)

Export used: `TransactionSearchResults` from  
`C:\Users\David\AppData\Local\Oraya\CyberSource\production-2026-08-09`  
(also uploaded in-session as `TransactionSearchResults_06e4.json`).

### Key rows

| Request ID | Merchant ref | Amount | Outcome |
|---|---|---|---|
| `7863958223886680704897` | `oraya-att-8b5bd95c-…` | $1.00 | Auth **Success**, DM **Reject 481**, Settlement **Not Run** |
| `7863969294066269704890` | `oraya-att-dc5055d8-…` | $1.00 | Auth **Success**, DM **Reject 481**, Settlement **Not Run** |
| `7863994790856587104899` | `oraya-rfnd-99ba8ae6-msns4glt` | — | **Credit Failed** `DINVALIDDATA` / reason **102** |

BC detail for DC5055D8 (`7863969294066269704890`) confirms:
- Reason code **481** — Decision Manager REJECT
- Auth approval code present (`059070`)
- Settlement not sent
- BC recommends void/auth reverse if not settled — **not** Settle, **not** Refund

### Implications
- Money was **authorized**, not captured/settled.
- Oraya “Refund card” failed because refund/credit is the wrong instrument for unsettled auth → `102 INVALIDDATA`.
- Correct BC action: **Authorization Reversal / Void**.
- Root cause of repeated activation weirdness: **Decision Manager rejecting** merchant `06385000` (needs NetCommerce).

---

## 5. SQL David must run (human Supabase) — checklist

Run in Supabase SQL editor if not already applied. Paste full scripts from repo files (David prefers inline paste; do not only cite paths in chat).

| Script | Purpose | Status at handoff |
|---|---|---|
| `sql/phase-16b-provider-refund.sql` | Claim/confirm/fail/record refund RPCs | Likely applied (refund UI exists); verify if Release still 503 “function does not exist” |
| `sql/phase-16b-provider-refund-reversed-recovery.sql` | Allow claim on `reversed` card receipts | Likely applied (#132 era) |
| `sql/phase-16b-reverse-manual-only.sql` | Hard-lock Reverse to `provider=manual` | Confirm applied |
| **`sql/phase-16b-provider-refund-settle-protect.sql`** | **Critical for Release/Record** — allow pending refund settle fields past immutability trigger | **Must be applied** — this was why Release failed with “Could not release that refund attempt” |

### Why settle-protect is required
`oraya_protect_payment_transaction_facts` blocked:
- Fail path updating `notes`
- Confirm/record updating `provider_reference` / settlement fields  

Hotfix softens protect **only** for refund `pending → confirmed|failed` (and failed→pending re-claim).

---

## 6. Operator next steps (David’s current stuck state)

### A. Unblock Oraya unfinished refund (payment `7863958223886680704897`)
1. Ensure settle-protect SQL applied.
2. Ops → Collect money → **Resolve refund**.
3. **No refund in Business Center** (BC credit failed 102 — no refund id).
4. Note e.g. `credit failed 102 DINVALIDDATA — no refund`.
5. **Release refund lock**.
6. Do **not** Refund card again on this auth.

### B. Business Center — void the unsettled auths
For each of:
- `7863969294066269704890` (DC5055D8)
- `7863958223886680704897` (8b5bd95c)

On the BC transaction page: **Authorization Reversal** (void).  
Do **not** Settle. Do **not** Refund.

### C. Clear Oraya attention attempts
After void (or if confirmed no capture):
- Ambiguous/stuck attempt → **No charge in BC** with note that auth was voided / DM reject / settlement not run.
- Only use **Charge already in Oraya** if a matching Received receipt already exists for that payment id.

### D. NetCommerce follow-up (outside Oraya code)
Ask NetCommerce to fix Decision Manager for `06385000` / `creditlibanais_dm_acct` so live tests are not rejected with **481** after successful auth.

---

## 7. Key code surfaces

| Area | Path |
|---|---|
| Ops UI | `components/ops/PaymentWorkspace.tsx` |
| Ops page tabs | `app/ops/payments/page.tsx` |
| List/create links | `app/api/ops/payments/requests/route.ts` |
| Cancel/delete link | `app/api/ops/payments/requests/[id]/route.ts` |
| Purge unused closed | `app/api/ops/payments/requests/purge-closed/route.ts` |
| Attempt resolve | `app/api/ops/payments/attempts/[id]/route.ts` |
| Event dismiss | `app/api/ops/payments/events/[id]/route.ts` |
| Card refund API | `app/api/ops/payments/transactions/[id]/refund/route.ts` |
| Reverse API | `app/api/ops/payments/transactions/[id]/reverse/route.ts` |
| Ledger helpers | `lib/payments/ledger-server.ts`, `lib/payments/provider-refund.ts` |
| CyberSource client | `lib/payments/credit-libanais.ts` |
| Contract tests | `scripts/payment-ops-reconciliation.test.mjs` |

---

## 8. Known gaps / recommended Claude follow-ups

### P0 — finish live cleanup (ops + config, not necessarily code)
1. Confirm settle-protect SQL applied; Release refund lock succeeds.
2. Void both `$1` auths in BC.
3. Clear Oraya attention rows.
4. Escalate DM 481 to NetCommerce.

### P0/P1 — product code (recommended next implementation)
1. **Void / auth-reversal path** for “Auth success + Settlement not run (+ DM reject)”  
   - Do not offer **Refund card** when settlement never ran.  
   - Prefer CyberSource authorization reversal API + Oraya ledger outcome that does not invent a refund.
2. **Classify DM reject (481)** explicitly in completion/webhook paths so Ops shows “DM rejected — void/auth reverse” instead of generic ambiguous.
3. **Booking net-after-refund clarity** — confirm refund RPC does not leave booking UIs looking “fully paid” when only `refund_*` moved (audit from earlier session).
4. Optional: owner-facing copy when refund returns `102` linking to void guidance.

### Out of scope (do not start without instruction)
- Apple Pay enrollment
- Auto-reconcile pulling BC transaction search API
- Guest `/pay` redesign
- Redesigning Phase 15 surfaces

---

## 9. Honest production readiness verdict

| Layer | Verdict |
|---|---|
| Ops Payments desk UX | Production-usable for villa ops (merged #133–#134) |
| Card refund claim/confirm/fail design | Production-safe **after** settle-protect SQL (#135) |
| Live `$1` activation cleanup | **Not done** until void + Release + attention clear |
| Decision Manager / capture path | **Not healthy** — DM 481 rejecting live auths |
| Entire Phase 16B payment system | **Not complete** — wallets, Apple Pay, etc. remain gated |

---

## 10. Claude operating constraints for this handoff

- Read `PROJECT_STATE.md` first; Phase 15 locked.
- Prefer one feature branch / one PR unless instructed otherwise.
- Money paths: claim-before-provider, no double refund, no delete with history.
- When David must run SQL: paste the **full script inline** in chat (he gets angry at path-only answers).
- Do not redesign the Ops desk; extend it.
- Treat CyberSource BC as source of truth for whether money moved; Oraya ledger follows.

---

## 11. Suggested first Claude prompt

> Continue Phase 16B Ops payments handover in `docs/system/PHASE_16B_OPS_PAYMENTS_SESSION_HANDOVER.md`. Confirm settle-protect SQL is applied and Release works for `7863958223886680704897`. Then implement: (1) do not offer Refund card when CyberSource settlement never ran / DM 481 unsettled auth; (2) add owner-safe Authorization Reversal (void) path with ledger outcome; (3) map reason 481 to clear Ops copy. Keep money-safety; paste any required SQL inline.

---

## 12. Session timeline (compressed)

1. User: Payments page messy — no delete; readiness/reconciliation confusing.  
2. Cleanup desk → #133 (lists, attention language, delete).  
3. Mission + production desk (resolve attempt, release refund, tabs, reverse lock) → same #133 arc.  
4. CI contract tests updated for new copy.  
5. P2 polish → #134 (search, purge, dismiss, settlement toggle).  
6. BC export triage: both `$1`s auth+DM reject+no settlement; refund failed 102.  
7. User Release refund lock failed → root cause immutability trigger → #135 settle-protect SQL.  
8. BC detail for DC5055D8 confirms void/auth reverse, not settle/refund.  
9. This handover document.
