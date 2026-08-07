-- Ops: per-person staff accounts with roles.
--
-- Replaces the single shared admin password for the new /ops interface. The
-- legacy /admin shared-password login keeps working untouched so nothing in
-- production breaks while the two run side by side.
--
-- Why this exists: the old session cookie payload was `{ exp }` — an expiry and
-- nothing else — so no admin action could ever be attributed to a person, and
-- "operator cannot change pricing" was unenforceable because every
-- /api/admin/* route accepted any valid session.

create table if not exists public.staff (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  full_name         text not null,
  role              text not null check (role in ('owner', 'operator')),
  -- null until the invite is accepted and the person sets their own password.
  password_hash     text,
  -- scrypt hash of the single-use invite token; cleared when consumed.
  invite_token_hash text,
  invite_expires_at timestamptz,
  is_active         boolean not null default true,
  last_login_at     timestamptz,
  created_by        uuid references public.staff(id) on delete set null,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

-- Case-insensitive uniqueness: layla@ and Layla@ must not be two accounts.
create unique index if not exists staff_email_lower_key on public.staff (lower(email));
create index if not exists staff_active_idx on public.staff (is_active) where is_active;

-- RLS on with no policies: reachable only via the service role, matching how
-- every other admin-owned table in this project is protected.
alter table public.staff enable row level security;

-- Seed the owner from the existing shared admin password, so the owner can sign
-- in to /ops immediately with the password they already use. Idempotent.
insert into public.staff (email, full_name, role, password_hash)
select 'davidhourani1@gmail.com', 'David Hourani', 'owner', s.value
from public.settings s
where s.key = 'admin_password'
  and s.value is not null
  and s.value <> ''
  and not exists (select 1 from public.staff where role = 'owner')
on conflict do nothing;
