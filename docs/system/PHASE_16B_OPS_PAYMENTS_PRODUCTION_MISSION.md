# Phase 16B — Ops Payments production page mission

**Owner:** David Hourany  
**Surface:** Ops → Payments  
**Goal:** a production-grade money desk — clear, actionable, money-safe. No bank jargon without a next step. No stuck links or stuck attempts without an owner action.

**Status:** COMPLETE for P0 + P1 on `cursor/ops-payments-cleanup-43cc` (PR #133). P2 deferred.

---

## Problem

The Ops Payments page became an engineer console during live NetCommerce activation:
- Cancelled test links piled up with no delete
- “Provider readiness and reconciliation” used opaque bank language
- Ambiguous `$1` attempts and unfinished refunds alarmed without buttons
- Paid links never left the collect queue
- Ledger collect work sat above website payment settings with no separation

David cannot run the villa from that screen.

---

## Non-negotiables (money safety)

1. Never destroy ledger history.
2. Never retry a card charge/refund after an ambiguous gateway outcome until Business Center is checked.
3. Reverse is **cash/manual bookkeeping only** — never a card refund.
4. Owner-gated actions that change provider attempt/refund blocking state require a reason.
5. Delete a payment link only when it has **no** `payment_transactions` and **no** in-flight attempts.

---

## Mission checklist

### P0 — unblock stuck money (ship first)

| # | Item | Done when | Status |
|---|---|---|---|
| P0.1 | **Resolve unclear charge** — owner can mark attempt failed (BC: no charge) or cleared (BC charged + Oraya already has matching receipt) | Attention row has buttons; guest retry unblocks when failed | DONE |
| P0.2 | **Release unfinished refund** — owner can fail a pending refund claim when BC confirms money did **not** return | Resolve refund offers “No refund in Business Center” | DONE |
| P0.3 | **Manual-only reverse** — API (+ SQL) refuse reverse unless `provider = manual` | Card reverse impossible even via crafted POST | DONE |
| P0.4 | **Safe delete** — refuse delete while open attempts still attached to the request | No orphaning of attention context | DONE |

### P1 — production-clear Ops UX

| # | Item | Done when | Status |
|---|---|---|---|
| P1.1 | Split lists: **Collecting** / **Collected** / **Closed** | Paid tests not mixed into active collect queue | DONE |
| P1.2 | Request cards show amount, paid, remaining, refunded | Owner sees money state without opening BC | DONE |
| P1.3 | Attention rows name the guest/link and offer primary CTAs | No wall of text without buttons | DONE |
| P1.4 | Confirm Cancel / Delete; Copy link only while payable | Fewer accidents / dead actions | DONE |
| P1.5 | Quiet fresh `claimed` attempts (&lt; 10 min) | Live checkout does not look like an incident | DONE |
| P1.6 | Page tabs: **Collect money** vs **Website settings** | One job per view | DONE |
| P1.7 | Runbook covers ambiguous **charges** and refund release | Docs match the UI | DONE |

### P2 — polish (follow-up branch)

| # | Item | Status |
|---|---|---|
| P2.1 | Search by guest / villa / email / description | DONE |
| P2.2 | Optional settlement totals toggle | DONE |
| P2.3 | Bulk clear unused closed links | DONE |
| P2.4 | Dismiss unfinished provider events (`ignored`) | DONE |
| P2.5 | Auto-reconcile from Business Center API | OUT OF SCOPE |

---

## Acceptance (David can)

1. Create a link → copy → send → see it under Collecting.
2. Cancel a test link → it leaves the main list → Delete removes it if unused.
3. See Collected paid links separately from active collection.
4. When an unclear `$1` attempt appears: open BC → **No charge** or **Charge already recorded** → attention clears.
5. When a refund is stuck pending: **Record BC refund** or **No refund happened** → can retry only after no-refund release.
6. Never confuse Reverse (cash) with Refund card.
7. Change website payment mode under **Website settings** without scrolling past the ledger.

---

## Out of scope

- Guest `/pay` redesign
- Apple Pay enrollment
- Changing CyberSource credentials
- Booking-admin legacy refund fields (keep; prefer Ops Refund card)
