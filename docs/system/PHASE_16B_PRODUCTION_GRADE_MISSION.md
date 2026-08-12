# Phase 16B — Production-grade mission: everything still broken, in one place

**Date:** 2026-08-11
**Author:** Claude (Phase 16B executing agent)
**Basis:** live Supabase `nxsdgjtqrhturlojtjlb` (read-only), live CyberSource Business Center (merchant `06385000`), and `origin/master` @ `339c5aa`.
**Supersedes as the active plan:** [PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md](PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md) — its M1, M2 and M3 are merged; M4 and M5 survive here as W4 and W5.

Every claim below is grounded in a query, a Business Center record, or a file path. Nothing here is aspiration.

---

## 0. Live state, 2026-08-11

| Fact | Value | Meaning |
|---|---|---|
| `settings.payments_live_enabled` | **`true`** | **Real cards are being charged right now.** |
| `payment_provider_events` rows | **1**, last `2026-08-10 18:51` | The webhook has delivered exactly one event ever — the config test. **No real payment has ever reached it.** |
| Pending refunds | 1 (`$240`, booking `53896156`) | Ledger says a refund is unresolved; the bank already returned the money. |
| Attempts `recorded` with no receipt | 1 | KNOWN_BUGS #18. |
| Confirmed + unpaid bookings | 20 | Legacy; the arrival guide gate (W4) is not built. |
| `payment_notifications` rows | 1 | M2 fired correctly on the first live card payment. |
| `instant_booking_auto_confirm` | unset (off) | W3 is merged-pending; nothing auto-confirms yet. |

**First successful live card payment: 2026-08-11 17:28 UTC**, `$240`, CyberSource `7864693288166594704898`, booking `53896156`. It worked only after `DECISION_SKIP` shipped.

---

## 1. Merged, unverified in production

| Work | Commit | Verified live? |
|---|---|---|
| M1 — void / auth-reversal + 481 classification | `d433bca` | ❌ never exercised |
| M2 — money-event dispatcher | `31a9be8` | ✅ one receipt + one operator alert sent |
| DECISION_SKIP | `a0d9b56` | ✅ proven — it is why payment works |

## 2. Written, **not merged**

Merge in this order; the second rewrites Ops copy the third assumes.

1. `claude/phase-16b-refund-selfreconcile` — refunds reconcile themselves against CyberSource instead of asking the operator to paste a reference.
2. `claude/phase-16b-instant-confirm` — instant booking auto-confirms a fully paid, add-on-free stay. Master switch, default off.
3. `claude/guest-payment-ux` — guests can pay themselves; retires the four-meanings-of-"Payment pending" vocabulary.

---

## 3. The mission

Ordered by what actually threatens money, not by what is most interesting.

### W0 — Stop the bleeding (operator + provider). Blocks everything.

| # | Action | Owner | Done when |
|---|---|---|---|
| W0.1 | Record the pending `$240` refund with BC reference `7864700292896974704899`, then **Reverse** the mistaken `$240` bank-transfer receipt on booking `53896156` | David | Booking reads `240` paid / `240` refunded; no pending refund rows |
| W0.2 | **Fix Decision Manager on `06385000`** — it rejects every issuer-approved authorization with 481. Oraya currently bypasses it entirely with `DECISION_SKIP`, meaning **card payments run with no fraud screening** | NetCommerce | Written confirmation + a live authorization that passes DM |
| W0.3 | Enable the **Transaction Search and Details API** for the merchant. Business Center reports the org is "not enabled to access TransactionManagement/TransactionSearch", which will make refund self-reconciliation (W2) fail closed | NetCommerce | `GET /tss/v2/transactions/{id}` returns 200 |
| W0.4 | Decide KNOWN_BUGS #17 — the ledger asserts a `$1` refund that Business Center says failed | David | Corrected or annotated; never silently rewritten |

### W1 — The webhook has never worked 🔴

**One event in the entire history of the integration, and it was the config test.** The webhook is the only observer guaranteed to see the money: a guest who closes the tab after 3DS never reaches the completion route. Today that guest's payment would be recorded by nothing, notified to nobody, and — once W3 is on — would never auto-confirm.

Everything downstream is built and waiting: M2 notifies from the webhook, W3 auto-confirms from it. Neither has ever fired from a real delivery.

- Diagnose whether the subscription is active, whether deliveries are being attempted and rejected, or whether CyberSource is not sending at all. The 2026-08-10 delivery verified signature and replay-claim correctly, so the *handler* is not the suspect.
- **Acceptance:** kill the browser mid-redirect on a real payment; the payment is recorded, the guest receipt sent, and the booking auto-confirmed if W3 is on — with no browser involvement at all.

### W2 — Refunds and money-return truth

- Merge `claude/phase-16b-refund-selfreconcile`. Depends on W0.3 to actually help; harmless without it.
- Exercise M1 once for real: a card authorization that never settles must offer **Void**, never Refund, and record a reversal that is not a refund anywhere in the ledger or UI.
- ~~**The legacy admin "record payment" path bypasses the ledger's deduplication.**~~ **CLOSED 2026-08-12 by removal.** `PATCH /api/admin/bookings/[id]` now refuses every money-bearing field with `money_path_closed`, and the admin console's Request deposit / Record payment / Record manual refund controls are gone. Ops → Payments already recorded money through the ledger RPCs with an idempotency key and a compare-and-set, so the legacy writer was taken away rather than re-plumbed. Stored history untouched. See DECISIONS_LOG 2026-08-12 and KNOWN_BUGS #23.
- **Acceptance:** no path can record money twice against one booking without an explicit override. **Met for the admin path.** The remaining writers are the ledger RPCs (deduplicated) and the provider completion/webhook paths (attempt-claimed).

### W3 — Instant booking

- Merge `claude/phase-16b-instant-confirm`, switch on, and test end to end with a real card.
- **Acceptance:** fully paid, add-on-free, no special request → confirmed within seconds, confirmation email and arrival guide sent, and a second guest paying for the same nights in the same moment is left pending rather than double-confirmed.
- Note: physical entry still does not exist (Phase 16D). "Pay and enter" today means "confirmed with an arrival guide".

### W4 — Payment-gated arrival guide (was M4)

Setting `payment_gated_arrival_guide`, default off. When on, a confirmed-but-unpaid booking holds the arrival guide with an explicit `awaiting_deposit` reason **without consuming the at-most-once claim**, and the money-event dispatcher releases it when payment lands. The confirmation email always sends.

Live evidence it matters: 20 confirmed bookings are unpaid, and three of them already received the arrival guide having paid nothing.

### W5 — Ops UI truth (was M5)

Every item here was hit in production on 2026-08-11:

- **A pending booking hides its payment state.** `app/ops/bookings/page.tsx:57` returns "Awaiting your approval" before it ever looks at money, so a fully paid booking looks unpaid. This is what caused the duplicate `$240`.
- **"Refund card" and "Reverse" give no clue which one matches the mistake being corrected.** The operator wanted to undo a double-count and refunded a real card.
- **Never render "paid in full" from a NULL `amount_total`.** Two legacy rows do exactly that.
- One honest state line per booking: approved or not · money in vs owed · arrival guide sent / held / skipped.

### W6 — Guest experience

- Merge `claude/guest-payment-ux` (self-serve pay, balance payment, honest state names).
- ~~**Not yet audited:** `/book` and `/pay/[token]`.~~ **AUDITED 2026-08-12** (branch `claude/guest-journey-w6`), walked as a guest at 1280px and 390px. Four defects fixed: the calendar re-anchoring between the two clicks of a range (**a money defect** — 21 Sep produced 19 Oct, $7,380 instead of $270), a button naming a screen instead of an action, cancelling payment stranding the guest on a page whose only exit reopens checkout, and the guest cancellation email posting Oraya's own `[Booking Protocol]` text back to the guest. Five further defects are reported and deliberately **not** fixed — KNOWN_BUGS #27, for the owner to prioritise. See DECISIONS_LOG 2026-08-12 (three entries) and KNOWN_BUGS #25/#26.
- Still open from that audit, in the owner's order: villa change silently discards selected dates · an in-progress range absorbs the next click as a check-out · the instant lane's promise (below) · a failed checkout session cannot be told from a standalone payment request · an inactive payment link is a dead end with nothing to contact Oraya by.
- Still open, same defect as the fixed email: `lib/send-booking-pending-email.ts` (sent on **every** booking creation) and `app/booking/view/[token]/page.tsx:1222` both render `bookings.message` raw — the latter under the heading "Your note". One-line calls to `lib/guest-visible-note.ts` each.
- The instant lane on `/book` advertises speed that only exists once W3 is switched on. Confirmed live 2026-08-12: step 3 still promises "Instant confirmation available for eligible stays" while `instant_booking_auto_confirm` is off, so it is currently true for nobody.

### W7 — 3-D Secure is enabled but not authenticating

Payer authentication was switched on in Unified Checkout on 2026-08-11, yet both subsequent live transactions returned `ECI 7` with empty `XID` and `CAVV` — no authentication took place. With `DECISION_SKIP` bypassing fraud screening, 3DS is now the **only** fraud control, and it is not running.

Fix: add `CONSUMER_AUTHENTICATION` / `VALIDATE_CONSUMER_AUTHENTICATION` to `processingInformation.actionList` and carry the results into the authorization. **Acceptance:** a live transaction returns `ECI 5` with a populated CAVV.

### W8 — Phase 16D access delivery

The owner's stated goal is "pay and enter the house in minutes". That requires gate/door PIN delivery, which does not exist. Until W8 ships, instant booking ends at "confirmed with arrival details".

---

## 4. Severity summary

| Severity | Item |
|---|---|
| 🔴 Critical | W1 webhook has never delivered · W0.2 no fraud screening while live · W7 3DS not authenticating |
| 🟠 High | W0.1 unresolved refund + duplicate receipt · W2 legacy admin double-record path · W5 pending hides payment state |
| 🟡 Medium | W4 arrival guide gate · W6 `/book` and `/pay` unaudited · W0.3 TSS entitlement |
| 🟢 Low | W8 access codes (a new phase, not a defect) |

## 5. Standing constraints (unchanged)

Feature branch only, never `master`. Minimal diff. Claim-before-provider; unknown outcomes stay ambiguous and are never auto-retried. Reverse ≠ refund ≠ void. Never destroy ledger history. Migrations additive and human-run, pasted in full. No secrets or PAN anywhere. Business Center is the source of truth for whether money moved; the Oraya ledger follows it.

**One deliberate exception now exists:** instant booking lets payment confirm a stay (W3). Every other money path still leaves booking status untouched.
