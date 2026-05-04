-- Phase 15I.1 — Payment foundation (bookings table extensions)
-- Run in Supabase SQL editor (safe to re-run).
-- Existing columns (payment_status, payment_method, deposit_amount, amount_paid) are left unchanged.

alter table bookings add column if not exists payment_stage text default 'none';
alter table bookings add column if not exists amount_total numeric;
alter table bookings add column if not exists amount_due numeric;
alter table bookings add column if not exists payment_last_at timestamptz;

comment on column bookings.payment_stage is '15I ledger: none | unpaid | partially_paid | fully_paid (guest workflow still uses payment_status).';
comment on column bookings.amount_total is '15I snapshot of contract total (stay estimate or event proposal_total_amount).';
comment on column bookings.amount_due is '15I amount_total - amount_paid (non-negative).';
comment on column bookings.payment_last_at is '15I last admin-recorded payment timestamp.';
