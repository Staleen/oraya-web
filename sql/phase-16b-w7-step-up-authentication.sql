-- Phase 16B W7 slices 3–5 — 3-D Secure step-up authentication.
--
-- ADDITIVE AND HUMAN-RUN. Safe against a live database with existing rows:
-- every statement is idempotent, nothing is dropped, no existing row is
-- rewritten, and no existing value becomes invalid.
--
-- What it adds:
--   1. A sixth payment_attempts status, 'pending_authentication' — an attempt
--      parked at the cardholder's bank mid-challenge. The enrolment call that
--      produces it authorizes NOTHING, so a parked attempt holds no money and
--      the TTL reaper may release it to 'failed' with nothing to reverse.
--   2. The two columns that state carries: the authentication id threading
--      CyberSource call 1 to call 2, and a hard expiry instant.
--   3. The two in-flight partial indexes gain the new status, so a guest
--      cannot open a second payment while a challenge is open.
--
-- Running it changes NO behaviour on its own. Nothing writes
-- 'pending_authentication' until settings.card_checkout_behaviour
-- ->> 'payer_authentication' is 'required', which is not its live value.
--
-- Order matters: the CHECK constraint must accept the new value before the
-- indexes are allowed to mention it.

-- 1. Widen the status domain. -------------------------------------------------
-- Re-created rather than altered because Postgres has no "add value to check".
-- Existing rows all hold one of the five original values, so the new constraint
-- validates against live data without a single row failing.
alter table public.payment_attempts
  drop constraint if exists payment_attempts_status_check;

alter table public.payment_attempts
  add constraint payment_attempts_status_check
  check (status in (
    'claimed',
    'authorized',
    'recorded',
    'failed',
    'ambiguous',
    -- W7 slice 3: waiting for a human at their bank. No money is held here.
    'pending_authentication'
  ));

-- 2. What a parked challenge has to remember. ---------------------------------
-- authentication_transaction_id threads call 1 (enrolment) to call 2
-- (validation + authorization). It is read from THIS row when the bank's
-- post-back arrives — never from the post-back itself, which travels through
-- the guest's browser and is attacker-controlled.
alter table public.payment_attempts
  add column if not exists authentication_transaction_id text;

-- A stored deadline, not a query-time interval: the TTL reaper and a late
-- post-back must agree on exactly one expiry instant, and a compare-and-set on
-- this row is what makes them agree (W7 §3.2).
alter table public.payment_attempts
  add column if not exists step_up_expires_at timestamp with time zone;

-- 3. A parked challenge blocks a second payment. ------------------------------
-- Both in-flight uniqueness indexes are re-created with the new status added.
-- Dropping and re-creating a partial unique index is safe here: no row can be
-- 'pending_authentication' yet, so the index contents are unchanged.
drop index if exists public.payment_attempts_one_in_flight_per_booking;
create unique index if not exists payment_attempts_one_in_flight_per_booking
  on public.payment_attempts (booking_id)
  where status in ('claimed', 'authorized', 'ambiguous', 'pending_authentication');

drop index if exists public.payment_attempts_one_in_flight_per_request;
create unique index if not exists payment_attempts_one_in_flight_per_request
  on public.payment_attempts (payment_request_id)
  where payment_request_id is not null
    and status in ('claimed', 'authorized', 'ambiguous', 'pending_authentication');

-- 4. The reaper's working set. ------------------------------------------------
-- Small and highly selective: in normal operation this index is empty.
create index if not exists payment_attempts_pending_authentication_idx
  on public.payment_attempts (step_up_expires_at)
  where status = 'pending_authentication';

-- ---------------------------------------------------------------------------
-- Operator notes
--
-- Open challenges right now:
--
--   select id, booking_id, payment_request_id, step_up_expires_at
--   from payment_attempts
--   where status = 'pending_authentication'
--   order by step_up_expires_at;
--
-- Releasing one BY HAND is safe — call 1 creates no payment resource, so there
-- is nothing to void and nothing to refund. The application does this
-- automatically at the deadline; this is only for a stuck row:
--
--   update payment_attempts
--   set status = 'failed', updated_at = timezone('utc', now())
--   where id = '<attempt-id>' and status = 'pending_authentication';
--
-- Do NOT mark one 'recorded' by hand. A recorded attempt asserts that money
-- moved, and only call 2's server-side response is evidence of that.
--
-- ROLLBACK (only meaningful before 3-D Secure is switched on, i.e. while no row
-- can hold the new status):
--
--   drop index if exists public.payment_attempts_pending_authentication_idx;
--   alter table public.payment_attempts drop column if exists step_up_expires_at;
--   alter table public.payment_attempts drop column if exists authentication_transaction_id;
--   -- then re-create the two in-flight indexes and the status check without
--   -- 'pending_authentication' (see sql/plan3-payment-attempts.sql and
--   -- sql/phase-16b-card-payment-requests.sql for the originals).
