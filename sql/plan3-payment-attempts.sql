-- Plan 3 Phase 3 (KNOWN_BUGS #14) — durable payment-attempt ledger for
-- Unified Checkout completion.
--
-- Additive, human-run. Run this BEFORE merging/deploying the Phase 3 branch:
-- the completion route fails CLOSED (503) when this table is missing — no
-- guest can complete a checkout until this migration has been applied.
--
-- Preflight (optional): confirm the table does not already exist.
--   select to_regclass('public.payment_attempts');
--
-- Preflight (optional): confirm gen_random_uuid() is available (pgcrypto is
-- enabled by default on Supabase).
--   select gen_random_uuid();

create table if not exists payment_attempts (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid not null,
  provider_session_id     text not null,
  idempotency_key         text not null,
  -- claimed    → row inserted, provider not yet called (the atomic claim)
  -- authorized → provider approved the charge, booking update not yet verified
  -- recorded   → terminal success: booking row verified updated (1 row matched)
  -- failed     → terminal decline: provider refused; guest may retry (new attempt)
  -- ambiguous  → timeout/unknown outcome OR approved charge whose booking
  --              update matched 0 rows; BLOCKS new attempts until reconciled
  status                  text not null default 'claimed'
    check (status in ('claimed', 'authorized', 'recorded', 'failed', 'ambiguous')),
  provider_request_id     text,
  provider_transaction_id text,
  provider_reference      text,
  amount                  numeric not null,
  currency                text not null,
  created_at              timestamp with time zone not null default timezone('utc', now()),
  updated_at              timestamp with time zone not null default timezone('utc', now())
);

-- The idempotency backbone: at most ONE in-flight attempt per booking.
-- 'failed' and 'recorded' are terminal and deliberately excluded — a declined
-- guest may retry (new attempt row), and a recorded payment is guarded by the
-- booking's own payment_link_status transition. 'ambiguous' stays in the
-- index ON PURPOSE: an unknown-outcome charge must block new attempts until a
-- human reconciles it against CyberSource (see reconciliation steps below).
create unique index if not exists payment_attempts_one_in_flight_per_booking
  on payment_attempts (booking_id)
  where status in ('claimed', 'authorized', 'ambiguous');

create index if not exists payment_attempts_booking_idx
  on payment_attempts (booking_id, created_at desc);

-- RLS intentionally NOT enabled: table is only touched server-side via the
-- service role (same posture as `settings` / `admin_login_attempts`). It is
-- never read client-side.

-- ---------------------------------------------------------------------------
-- Manual reconciliation runbook for `ambiguous` attempts (admin, human-run)
-- ---------------------------------------------------------------------------
-- An `ambiguous` attempt means the provider MAY have charged the guest but the
-- system could not prove the outcome (timeout / unknown response), or the
-- charge WAS approved but the booking update matched zero rows. It blocks all
-- new attempts for that booking. Never auto-release; resolve by hand:
--
-- 1. Find the attempt(s):
--      select * from payment_attempts where status = 'ambiguous'
--      order by created_at desc;
--
-- 2. Look the charge up in CyberSource / NetCommerce Business Center using
--    `idempotency_key` (sent as clientReferenceInformation.code) and/or
--    `provider_transaction_id` if present.
--
-- 3a. Charge NOT found provider-side (nothing was charged):
--      update payment_attempts set status = 'failed',
--        updated_at = timezone('utc', now())
--      where id = '<attempt-id>' and status = 'ambiguous';
--     The guest can now retry payment normally.
--
-- 3b. Charge FOUND and settled/authorized (guest paid): record it on the
--     booking via the normal admin "record payment" tooling (or verify the
--     booking row already shows the payment), then close the attempt:
--      update payment_attempts set status = 'recorded',
--        provider_transaction_id = '<cybersource-transaction-id>',
--        updated_at = timezone('utc', now())
--      where id = '<attempt-id>' and status = 'ambiguous';
--
-- 3c. Charge FOUND but should not stand (duplicate/error): reverse/void it in
--     the Business Center first (KNOWN_BUGS #15 — no provider-side refund
--     automation exists), then mark the attempt 'failed' as in 3a.
