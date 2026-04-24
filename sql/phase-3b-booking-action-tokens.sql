-- ─────────────────────────────────────────────────────────────────────────────
-- booking_action_tokens — canonical schema
--
-- Tracks single-use admin action tokens (confirm/cancel) for the secure email
-- links rendered in sendBookingRequestEmail. If this table is missing or its
-- shape drifts from what the code expects, inserts in app/api/bookings/route.ts
-- fail silently and confirm_url / cancel_url are omitted from the admin email
-- (it falls back to a single "Review in Admin" button).
--
-- Run this in the Supabase SQL editor. It is idempotent and safe to re-run —
-- repairs common drift (wrong CHECK values, missing columns, NOT NULL on
-- used_at) without dropping any existing data.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the table if it doesn't exist.
create table if not exists booking_action_tokens (
  jti         uuid         primary key,
  booking_id  uuid         not null references bookings(id) on delete cascade,
  action      text         not null,
  expires_at  timestamptz  not null,
  used_at     timestamptz,
  created_at  timestamptz  not null default timezone('utc', now())
);

-- 2. Repair drift — drop any pre-existing action check constraint (singular
--    'confirm'/'cancel' was a common early draft) and reapply the canonical one.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.booking_action_tokens'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table booking_action_tokens drop constraint %I', c.conname);
  end loop;
end$$;

alter table booking_action_tokens
  add constraint booking_action_tokens_action_check
  check (action in ('confirmed', 'cancelled'));

-- 3. Make sure used_at is nullable (the replay-protection flow expects NULL
--    on insert and only sets it when the token is consumed).
alter table booking_action_tokens
  alter column used_at drop not null;

-- 4. Helpful index for the single-use lookup on /api/booking-action.
create index if not exists booking_action_tokens_booking_id_idx
  on booking_action_tokens (booking_id);

-- 5. Disable RLS — access is server-only via the service-role key in
--    lib/supabase-admin.ts. RLS on this table would block the service-role
--    insert from /api/bookings/route.ts.
alter table booking_action_tokens disable row level security;
