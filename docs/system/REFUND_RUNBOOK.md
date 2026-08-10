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

## Reverse vs Refund

| Action | Use for | Moves bank money? |
|---|---|---|
| **Reverse** | Cash / manual receipt mistakes only | No |
| **Refund card** | NetCommerce / CyberSource charges | Yes (when provider mode succeeds) |

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
