-- Phase 16B M2: at-most-once claim store for money notifications.
--
-- Additive, human-run, safe to re-run. Service-role only (the app touches it
-- exclusively server-side).
--
-- Why a separate table
--   The receipt/alert claim must survive a process restart and must be atomic
--   across TWO observers of the same payment: the browser completion route and
--   the CyberSource webhook. payment_transactions cannot carry the flag —
--   oraya_protect_payment_transaction_facts makes its rows immutable, and a
--   notification is not a money fact. The claim is therefore an INSERT against
--   a unique key: the loser of the race gets 23505 and sends nothing.
--
-- Fail-closed: until this table exists, lib/payments/money-event-dispatch
-- claims "unavailable" and sends NOTHING. No duplicate can be produced by
-- deploying the code before running this file — only silence.

create table if not exists payment_notifications (
  id                     uuid primary key default gen_random_uuid(),
  -- "<outcome>:<provider transaction id | ledger transaction id>"
  notification_key       text not null unique,
  payment_transaction_id uuid,
  booking_id             uuid,
  payment_request_id     uuid,
  -- booking_link | payment_link | ops_manual | webhook
  source                 text not null,
  -- recorded | failed | ambiguous
  outcome                text not null,
  guest_receipt_sent     boolean not null default false,
  operator_alert_sent    boolean not null default false,
  created_at             timestamp with time zone not null default timezone('utc', now()),
  updated_at             timestamp with time zone not null default timezone('utc', now())
);

create index if not exists payment_notifications_booking_idx
  on payment_notifications (booking_id, created_at desc);
create index if not exists payment_notifications_request_idx
  on payment_notifications (payment_request_id, created_at desc);

-- RLS enabled with NO policies: the service role bypasses it, anon/authenticated
-- keys are hard-blocked. Same posture as payment_attempts.
alter table payment_notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Operational notes
-- ---------------------------------------------------------------------------
-- A row means "Oraya owns the notification for this payment". It does NOT mean
-- the message was delivered — guest_receipt_sent / operator_alert_sent record
-- that separately, and a false there with a row present means the claim
-- succeeded but the send did not. That is deliberate: re-sending is a human
-- decision, because a duplicate receipt is worse than a missing one.
--
--   select notification_key, source, outcome, guest_receipt_sent,
--          operator_alert_sent, created_at
--     from payment_notifications
--    where not guest_receipt_sent or not operator_alert_sent
--    order by created_at desc;
