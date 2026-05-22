-- Phase 16B.4 - Credit Libanais provider compatibility for bookings.payment_link_provider
-- Run manually in the Supabase SQL editor. DO NOT auto-apply during deploys.
--
-- Purpose:
-- - widen the existing bookings.payment_link_provider allow-list so the
--   production-target Credit Libanais / MPGS hosted gateway can persist its
--   provider key safely when the real bank adapter is implemented
-- - preserve backwards compatibility for historical/manual/dev values that may
--   already exist on existing rows (`manual`, `whish`, `stripe`)
--
-- Safe to re-run:
-- - drops any existing payment_link_provider check constraint variant first
-- - recreates a single canonical constraint with the widened allow-list
--
-- Notes:
-- - `stripe` remains allowed only for backward compatibility and isolated
--   non-production/dev rows. It is NOT an approved production provider.
-- - no other payment lifecycle columns are changed here.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_link_provider%'
  loop
    execute format('alter table bookings drop constraint %I', c.conname);
  end loop;
end$$;

alter table bookings
  add constraint bookings_payment_link_provider_check
  check (
    payment_link_provider is null
    or payment_link_provider in ('manual', 'whish', 'stripe', 'credit_libanais')
  );

comment on column bookings.payment_link_provider is
  '16B provider id for the current payment link. Allowed: manual | whish | stripe | credit_libanais. Stripe remains for backward-compatible dev/test rows only; Credit Libanais / MPGS is the production-target hosted gateway.';
