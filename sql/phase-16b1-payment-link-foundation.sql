-- Phase 16B.1 — Payment link foundation (bookings table extensions)
-- Run in Supabase SQL editor (safe to re-run). DO NOT auto-apply during a deploy —
-- this is a human-gated migration. Phase 16B.1 is the architecture / scaffold step;
-- this file lands in the repo so it is reviewable, but it is NOT applied to Supabase
-- until the 16B.2 kickoff approves it.
--
-- Purpose: extend the existing payment-foundation columns (Phase 13L.1 / 15I.1) with
-- a per-booking payment-link record so the admin can issue, refresh, cancel, and
-- track exactly one live payment link per booking. The provider-agnostic shape lets
-- a manual flow (Whish web-link entered by admin), a webhook-driven flow (future
-- Stripe Checkout), and a no-link flow (cash / bank-transfer) all use the same row
-- shape without forcing provider-specific JSON.
--
-- This script is ADDITIVE ONLY. It does not modify any existing column, drop
-- anything, or change any constraint on rows that already exist. Every new column
-- is nullable so the locked /api/bookings POST insert continues to succeed
-- unchanged (payment columns default to null on booking creation and are populated
-- later by admin payment routes or the future webhook handler).
--
-- See /docs/phases/PHASE_16B_PLAN.md §1.3 "Schema decision" for rationale, and
-- /docs/system/DECISIONS_LOG.md "2026-05-18 — Phase 16B.1 architecture freeze:
-- payment link columns + provider abstraction".

-- 1. Add the additive payment-link columns. Safe to re-run.
alter table bookings add column if not exists payment_link_url            text;
alter table bookings add column if not exists payment_link_provider       text;
alter table bookings add column if not exists payment_link_expires_at     timestamptz;
alter table bookings add column if not exists payment_link_issued_at      timestamptz;
alter table bookings add column if not exists payment_link_status         text;
alter table bookings add column if not exists payment_provider_session_id text;

-- 2. Constrain payment_link_status to the allow-listed v1 values. NULL is allowed
--    so existing rows (and new bookings that never get a link) keep working.
--    Drop any pre-existing variant first so the script is safe to re-run.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_link_status%'
  loop
    execute format('alter table bookings drop constraint %I', c.conname);
  end loop;
end$$;

alter table bookings
  add constraint bookings_payment_link_status_check
  check (
    payment_link_status is null
    or payment_link_status in ('none', 'active', 'paid', 'expired', 'cancelled', 'failed')
  );

-- 3. Constrain payment_link_provider to the allow-listed v1 values. NULL is allowed.
--    Same drop-first pattern for re-runnability.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_link_provider%'
  loop
    execute format('alter table bookings drop constraint %I', c.conname);
  end loop;
end$$;

alter table bookings
  add constraint bookings_payment_link_provider_check
  check (
    payment_link_provider is null
    or payment_link_provider in ('manual', 'whish', 'stripe')
  );

-- 4. Partial index for "find bookings with an active live link". Used by the
--    16B.5 expiry cron and any admin filter that surfaces in-flight payments.
create index if not exists bookings_payment_link_active_idx
  on bookings (payment_link_expires_at)
  where payment_link_status = 'active';

-- 5. Column documentation. Helps future operators inspecting Supabase directly.
comment on column bookings.payment_link_url is
  '16B.1 current live payment link URL (Whish web-link or Stripe Checkout session URL). Null when no link is in flight.';
comment on column bookings.payment_link_provider is
  '16B.1 provider id for the current link: manual | whish | stripe. Mirrors lib/payments/provider.ts PAYMENT_LINK_PROVIDERS.';
comment on column bookings.payment_link_expires_at is
  '16B.1 provider-issued link expiration (UTC). The guest view treats now > this as expired regardless of stored status.';
comment on column bookings.payment_link_issued_at is
  '16B.1 timestamp the current link was generated (UTC).';
comment on column bookings.payment_link_status is
  '16B.1 link lifecycle: none | active | paid | expired | cancelled | failed. Null until a link is first issued. Distinct from payment_status because a link can expire without the booking becoming unpaid.';
comment on column bookings.payment_provider_session_id is
  '16B.1 provider-side identifier (Whish receipt id, Stripe session id) used for idempotent webhook reconciliation. The webhook handler must guard every write with eq(payment_provider_session_id, …) to prevent double-credit on retry.';
