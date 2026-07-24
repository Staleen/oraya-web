# Oraya — Refund Runbook (manual-first)

**Decision (David, 2026-07-24):** refunds are MANUAL-FIRST. Money is returned
to the guest by executing the refund **by hand in the NetCommerce Business
Center**; the Oraya admin UI only **records** that this happened. There is no
provider-side refund automation — building it is a separate, later plan.

This document is the single place for both money-back paths:

1. [Recording a manual refund](#1-manual-refund-business-center--admin-record)
2. [Reconciling an `ambiguous` payment attempt](#2-ambiguous-payment-attempt-reconciliation)

---

## 1. Manual refund (Business Center → admin record)

### Step A — find the original charge in the Business Center

Look the transaction up in the NetCommerce / CyberSource Business Center using
either of these identifiers from the booking / payment attempt:

- `payment_reference` on the booking (shown in the admin payment panel under
  **References & timestamps → Reference**) — this is the CyberSource
  transaction id for card payments.
- `idempotency_key` on the `payment_attempts` row (format `oraya-att-<uuid>`)
  — this was sent to CyberSource as `clientReferenceInformation.code`, so the
  Business Center search finds the exact operation for that attempt:

  ```sql
  select id, idempotency_key, provider_transaction_id, status, amount, currency, created_at
  from payment_attempts
  where booking_id = '<booking-id>'
  order by created_at desc;
  ```

### Step B — execute the refund in the Business Center

Issue the refund (full or partial) against that transaction **in the Business
Center**. Note down the refund/transaction reference the Business Center gives
you — the admin UI will refuse the record without it.

### Step C — record it in the Oraya admin UI

Admin → Bookings → the booking's **Payment** panel → **Record manual refund**:

1. Enter the refund amount.
2. Enter the **Business Center refund reference** from Step B (required — the
   record is rejected with a 400 without it).
3. Optional note, then **Record manual refund**.

This sets `refund_status = refunded`, `refund_amount`, `refunded_at`, and
stores the reference (`refund_provider_reference` column once
`sql/plan4-refund-provider-reference.sql` has been run; the reference is also
always appended to `payment_notes`). It does **not** move any money — Step B
did that.

### Refunding the go-live test charge

The production go-live checklist ends with refunding the one real test
booking: execute Step B for the test charge, then record it via Step C exactly
as above.

---

## 2. Ambiguous payment-attempt reconciliation

An `ambiguous` row in `payment_attempts` means the provider MAY have charged
the guest but the system could not prove the outcome (timeout / unknown
response), or the charge WAS approved but the booking update matched zero
rows. It blocks all new payment attempts for that booking. Never auto-release;
resolve by hand. (Same steps as documented in
`sql/plan3-payment-attempts.sql`; since Plan 4 Phase 2, a verified CyberSource
webhook for the attempt auto-resolves most of these before you ever see them.)

1. Find the attempt(s):

   ```sql
   select * from payment_attempts where status = 'ambiguous'
   order by created_at desc;
   ```

2. Look the charge up in the CyberSource / NetCommerce Business Center using
   `idempotency_key` (sent as `clientReferenceInformation.code`) and/or
   `provider_transaction_id` if present.

3. Resolve according to what you find:

   **3a. Charge NOT found provider-side (nothing was charged):**

   ```sql
   update payment_attempts set status = 'failed',
     updated_at = timezone('utc', now())
   where id = '<attempt-id>' and status = 'ambiguous';
   ```

   The guest can now retry payment normally.

   **3b. Charge FOUND and settled/authorized (guest paid):** record it on the
   booking via the normal admin "Record payment" tooling (or verify the
   booking row already shows the payment), then close the attempt:

   ```sql
   update payment_attempts set status = 'recorded',
     provider_transaction_id = '<cybersource-transaction-id>',
     updated_at = timezone('utc', now())
   where id = '<attempt-id>' and status = 'ambiguous';
   ```

   **3c. Charge FOUND but should not stand (duplicate/error):** reverse/void
   it in the Business Center first (there is no provider-side refund
   automation — see section 1), then mark the attempt `failed` as in 3a. If
   the guest already saw a "payment received" state, also record the manual
   refund per section 1.

### Monitoring

`GET /api/health` reports the count of `payment_attempts` rows stuck in
`claimed`/`ambiguous` for more than 1 hour (counts only — no amounts, no guest
data). A non-zero `stuck_ambiguous` means this runbook's section 2 is needed.
