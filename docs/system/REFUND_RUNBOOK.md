# Oraya — Refund Runbook

**Decision (David, 2026-08-10):** card refunds are **one-click from Ops** whenever
possible. Oraya calls NetCommerce / CyberSource, then records the ledger.
Business Center remains the fallback when the gateway call fails or money was
already returned outside Oraya.

This document covers:

1. [Easy card refund (preferred)](#1-easy-card-refund-preferred)
2. [Record a Business Center refund](#2-record-a-business-center-refund)
3. [Booking-only manual refund (legacy admin)](#3-booking-only-manual-refund-legacy-admin)
4. [Ambiguous payment-attempt reconciliation](#4-ambiguous-payment-attempt-reconciliation)

---

## 1. Easy card refund (preferred)

Use this for the activation test and normal card payments (standalone or
booking-linked).

### Steps

1. Open **Ops → Payments** (`/ops/payments`).
2. Find the paid payment request / card receipt.
3. Click **Refund card**.
4. Confirm the amount (defaults to the full remaining refundable amount).
5. Click **Refund now**.

Oraya:

1. Calls CyberSource `POST /pts/v2/payments/{id}/refunds`
2. Records an immutable `refund` ledger row
3. Updates `payment_requests.amount_refunded`
4. When the payment is booking-linked, also updates booking `refund_*` fields

No Business Center login is required for the happy path.

### SQL prerequisite (once)

Run in the Supabase SQL editor if not already applied:

- `sql/phase-16b-provider-refund.sql`

Without that RPC, the gateway refund may succeed but Oraya cannot record it —
do **not** retry the card refund; use section 2 with the CyberSource refund id.

---

## 2. Record a Business Center refund

Use only when:

- the easy refund button failed after money may have moved, or
- you already refunded in Business Center

1. Ops → Payments → **Refund card** on the payment
2. Choose **Already refunded in Business Center?**
3. Paste the CyberSource refund / transaction reference
4. **Record refund**

---

## 3. Booking-only manual refund (legacy admin)

Still available for booking payment fields when you are not using the ledger
refund button:

Admin → Bookings → Payment → **Record manual refund** (amount + BC reference).

This writes booking `refund_*` fields only. Prefer section 1 for card payments
so the ledger stays complete.

---

## 4. Ambiguous payment-attempt reconciliation

An `ambiguous` row in `payment_attempts` means the provider MAY have charged
the guest but the system could not prove the outcome (timeout / unknown
response), or the charge WAS approved but the booking/request update matched
zero rows. It blocks new payment attempts for that subject. Never auto-release;
resolve by hand. (Verified CyberSource webhooks auto-resolve most of these.)

1. Find the attempt(s):

   ```sql
   select * from payment_attempts where status = 'ambiguous'
   order by created_at desc;
   ```

2. Look the merchant reference / provider transaction id up in Business Center.

3. If **no charge** exists → mark the attempt `failed`.

4. If a **charge exists** and should stay → mark the attempt `recorded` and
   ensure the payment request / booking ledger matches (use
   `oraya_record_provider_payment` / ops reconciliation tools).

5. If a **charge exists** and should be returned → use section 1 (or section 2
   after refunding in Business Center), then mark the attempt terminal
   (`failed` or `recorded` as appropriate).

`/api/health` exposes stuck `claimed` / `ambiguous` counts for monitoring.

---

## Activation test refund checklist

1. Confirm the $1 payment appears under Ops → Payments as a card receipt with a
   NetCommerce / CyberSource reference.
2. Ensure `sql/phase-16b-provider-refund.sql` has been run once.
3. Click **Refund card** → **Refund now**.
4. Confirm:
   - CyberSource Business Center shows the refund
   - Oraya ledger shows a **Refund** row
   - `payment_requests.amount_refunded` = `1.00`
