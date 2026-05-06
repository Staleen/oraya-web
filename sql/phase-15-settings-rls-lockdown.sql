-- Phase 15 security hotfix: lock down settings table direct REST access.
--
-- Public browser reads must go through /api/settings, which allowlists and
-- sanitizes guest-safe keys using the server-side service-role client.

begin;

alter table public.settings enable row level security;

-- Remove any broad grants that let anon/authenticated roles read private rows
-- through PostgREST, e.g. /rest/v1/settings?key=eq.admin_password.
revoke all on table public.settings from anon;
revoke all on table public.settings from authenticated;

-- Drop existing settings policies so stale broad SELECT policies cannot remain.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'settings'
  loop
    execute format('drop policy if exists %I on public.settings', policy_record.policyname);
  end loop;
end $$;

-- Server-side API routes use the service-role client and must continue to manage
-- settings. The service_role role bypasses RLS, and this grant keeps table
-- privileges explicit for PostgREST/service usage.
grant select, insert, update, delete on table public.settings to service_role;

create policy "service_role can manage settings"
  on public.settings
  for all
  to service_role
  using (true)
  with check (true);

commit;
