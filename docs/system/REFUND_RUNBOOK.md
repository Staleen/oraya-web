# Oraya — Refund Runbook

**Decision (David, 2026-08-10):** card refunds are **one-click from Ops** for
owners, with money-safe claim-before-provider semantics. Business Center remains
the reconciliation path when the gateway outcome is unclear.

## Preferred path — Refund card

1. Apply once in Supabase SQL editor: `sql/phase-16b-provider-refund.sql`
2. Open **Ops → Payments** as an **owner**
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
| Timeout / decrypt fail / amount mismatch / unknown | Leave pending; **do not retry**; record BC reference |

## Resolve / record path

If Oraya says do not retry:

1. Check CyberSource Business Center
2. Ops → **Resolve refund** (or Refund card → record mode)
3. Paste the BC refund id → **Record refund**

This confirms the pending claim. It does not call the bank again.

## Booking admin legacy

Admin → Bookings → **Record manual refund** still writes booking `refund_*`
fields only. Prefer Ops → Refund card for card money so the ledger stays complete.

## Activation test

1. SQL applied
2. Owner opens Ops → Payments
3. Refund card on the $1 receipt
4. Confirm BC + Oraya both show the refund
