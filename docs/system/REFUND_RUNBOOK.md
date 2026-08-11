# Oraya — Refund & reconciliation runbook

**Decision (David, 2026-08-10):** card refunds are **one-click from Ops** for
owners, with money-safe claim-before-provider semantics. Business Center remains
the reconciliation path when the gateway outcome is unclear.

## Preferred path — Refund card

1. Apply once in Supabase SQL editor: `sql/phase-16b-provider-refund.sql`
   (and `sql/phase-16b-provider-refund-reversed-recovery.sql` if a card receipt
   was mistakenly Reverse’d)
2. Open **Ops → Payments → Collect money** as an **owner**
3. Find the card receipt → **Refund card** → **Refund now**

Oraya will:

1. Claim a `pending` refund row (blocks concurrent retries)
2. Call CyberSource `POST /pts/v2/payments/{id}/refunds`
3. Verify amount/currency on the response
4. Confirm the ledger refund (or leave pending / fail safely)

### Outcomes

| Gateway result | Oraya behavior |
|---|---|
| Approved + amount verified | Confirm ledger; done |
| Clear decline (4xx, no refund id) | Mark claim failed; you may retry |
| Timeout / decrypt fail / amount mismatch / unknown | Leave pending; **do not retry**; record BC reference **or** release if BC shows no refund |

## Resolve unfinished refund

If Oraya says do not retry:

1. Check CyberSource Business Center
2. Ops → **Resolve refund**
3. Choose one:
   - **Refund exists in BC** → paste the refund id → **Record refund**
   - **No refund in BC** → **No refund in Business Center** → note what you saw → **Release refund lock**

Record confirms the pending claim (does not call the bank again).  
Release fails the pending claim so a later **Refund now** is allowed.

## Unclear card charge (Needs your attention)

When Ops shows **Unclear card outcome** / stuck attempt:

1. Look up the merchant reference in Business Center
2. Choose one owner action:
   - **No charge in BC** → marks the attempt failed → guest may pay again
   - **Charge already in Oraya** → only if a matching Received/card receipt already exists → clears the blocker without inventing money

Never mark cleared unless Oraya already shows the receipt. Never retry a charge while the attempt is still open.

## Void (authorization reversal) — when the money was never taken

**Decision (David, 2026-08-11):** a card that was authorized but never settled
is **voided**, not refunded. A refund/credit against an unsettled authorization
fails at CyberSource with reason **102 DINVALIDDATA** — it is the wrong
instrument, not a transient error.

Oraya now checks with the bank before offering an action:

1. Apply once in Supabase SQL editor:
   `sql/phase-16b-provider-authorization-reversal.sql`
2. Open **Ops → Payments → Collect money** as an **owner**
3. Find the card receipt → **Refund card**
   - Oraya asks CyberSource what happened to that authorization
   - If it never settled, the dialog becomes **Void card authorization** and
     explains why. Refund is refused server-side for that receipt.
4. **Void authorization** → the hold on the guest's card is released. **No money
   moves** — nothing was ever taken.

### Outcomes

| Gateway result | Oraya behavior |
|---|---|
| Reversal accepted + amount verified | Confirm ledger `reversal` row; original receipt marked reversed; booking/request balances restored |
| Clear decline (4xx, no reversal id) | Mark the claim failed; you may try again |
| Timeout / decrypt fail / amount mismatch / unknown | Leave pending; **do not retry**; record the BC reversal reference **or** release the lock if the hold is still there |

### Decision Manager reject 481

Auth Success + **DM Reject 481** + Settlement "Not Run" means the bank approved
the card but the gateway's fraud screen rejected the order. Settlement will
never run. Ops labels it explicitly and offers **Void authorization**. The
underlying 481 rejections on merchant `06385000` are a NetCommerce issue, not
an Oraya one.

### When Oraya refuses to void

- **A refund is already recorded against this payment** — Oraya's ledger already
  says money went back. Voiding on top would tell two different money stories.
  Resolve the refund record first; Business Center is the source of truth.
- **A newer payment exists on the same booking** — void the newer one first so
  balances stay correct.
- **A void attempt is already open** — check BC, then record the reversal
  reference or release the lock. Never retry.

## Reverse vs Refund

| Action | Use for | Moves bank money? |
|---|---|---|
| **Reverse** | Cash / manual receipt mistakes only | No |
| **Void authorization** | Card authorized but never settled (incl. DM 481) | No — releases the hold |
| **Refund card** | Settled NetCommerce / CyberSource charges | Yes (when provider mode succeeds) |

Run once if needed: `sql/phase-16b-reverse-manual-only.sql` so Reverse is hard-locked to `provider = manual`.

## Booking admin legacy

Admin → Bookings → **Record manual refund** still writes booking `refund_*`
fields only. Prefer Ops → Refund card for card money so the ledger stays complete.

## Activation test

1. Refund SQL applied
2. Owner opens Ops → Payments → Collect money
3. Refund card on the $1 receipt
4. Confirm BC + Oraya both show the refund
5. If unclear: resolve via Record or Release — never double-refund
