-- Phase 16A.2.e — WhatsApp / WhatChimp lead persistence (run once in Supabase SQL editor)
-- Purpose: operational table for WhatsApp leads collected by the AI Butler / WhatChimp
-- before any booking exists. Backs both the Butler ingest endpoint
-- (POST /api/butler/lead) and the admin lead dashboard (/admin/leads).
--
-- This table is intentionally NOT a booking. It captures intent + contact details
-- + free-text fields the Butler collected. The admin operator triages from here.
--
-- See /docs/system/DECISIONS_LOG.md — 2026-05-15 entry "WhatsApp leads are
-- persisted in `whatsapp_leads` before booking creation".

-- 1. Create the table (idempotent).
create table if not exists whatsapp_leads (
  id                    uuid          primary key default gen_random_uuid(),
  created_at            timestamptz   not null    default timezone('utc', now()),
  updated_at            timestamptz   not null    default timezone('utc', now()),
  source                text          not null    default 'whatchimp',
  phone                 text          null,
  name                  text          null,
  request_type          text          null,
  villa                 text          null,
  check_in_text         text          null,
  check_out_text        text          null,
  normalized_check_in   date          null,
  normalized_check_out  date          null,
  guest_count           text          null,
  addons_interest       text          null,
  special_requests      text          null,
  follow_up_status      text          not null    default 'new',
  labels                text[]        not null    default '{}',
  raw_payload           jsonb         not null    default '{}'::jsonb,
  linked_booking_id     uuid          null,
  admin_notes           text          null
);

-- 2. Constrain follow_up_status to the allow-listed v1 values.
--    Drop any pre-existing variant first so this script is safe to re-run.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_leads'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) ilike '%follow_up_status%'
  loop
    execute format('alter table whatsapp_leads drop constraint %I', c.conname);
  end loop;
end$$;

alter table whatsapp_leads
  add constraint whatsapp_leads_follow_up_status_check
  check (follow_up_status in ('new', 'contacted', 'needs_action', 'converted', 'lost', 'spam'));

-- 3. Indexes for the admin dashboard query patterns.
create index if not exists whatsapp_leads_created_at_idx
  on whatsapp_leads (created_at desc);

create index if not exists whatsapp_leads_phone_idx
  on whatsapp_leads (phone);

create index if not exists whatsapp_leads_follow_up_status_idx
  on whatsapp_leads (follow_up_status);

create index if not exists whatsapp_leads_request_type_idx
  on whatsapp_leads (request_type);

create index if not exists whatsapp_leads_linked_booking_id_idx
  on whatsapp_leads (linked_booking_id);

-- 4. RLS posture: enabled, with NO policies. Service role bypasses RLS, so
--    the Butler ingest and the admin routes (both server-only, both using
--    SUPABASE_SERVICE_ROLE_KEY via lib/supabase-admin.ts) can read/write
--    freely. Any future anon/authenticated client that tries to query the
--    table will be denied by default — defense-in-depth even if a
--    misconfigured route is added later. This is a deliberate, stricter
--    posture than the repo's existing operational tables (e.g.
--    booking_action_tokens, which run RLS disabled). See the SQL block for
--    booking_action_tokens for the historical rationale; this table opts
--    into the safer default because there is no client-side use case here.
alter table whatsapp_leads enable row level security;

-- (No policies created on purpose — service role still has full access.)

-- 5. Keep updated_at honest. Server routes set updated_at explicitly on PATCH,
--    but this trigger guards against future direct SQL edits in the dashboard
--    leaving it stale.
create or replace function whatsapp_leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists whatsapp_leads_updated_at_trg on whatsapp_leads;
create trigger whatsapp_leads_updated_at_trg
  before update on whatsapp_leads
  for each row
  execute function whatsapp_leads_set_updated_at();
