-- Remediation 1.2 — admin login rate limiting (serverless-safe, DB-backed).
-- Additive, human-run. IMPORTANT: run this BEFORE deploying the branch —
-- the verify-password route fails CLOSED (503) when this table is unreachable,
-- so admin login will not work until this migration has been applied.
--
-- Preflight (optional): confirm the table does not already exist.
--   select to_regclass('public.admin_login_attempts');

create table if not exists admin_login_attempts (
  id           bigint generated always as identity primary key,
  ip           text not null,
  success      boolean not null default false,
  attempted_at timestamp with time zone not null default timezone('utc', now())
);

-- Lookup pattern: failures per IP / globally within a 15-minute window.
create index if not exists admin_login_attempts_ip_time_idx
  on admin_login_attempts (ip, attempted_at desc);
create index if not exists admin_login_attempts_time_idx
  on admin_login_attempts (attempted_at desc);

-- RLS intentionally NOT enabled: table is only touched server-side via the
-- service role (same posture as `settings`). It is never read client-side.

-- Optional housekeeping (run occasionally or via pg_cron): rows older than a
-- day carry no rate-limit signal.
--   delete from admin_login_attempts where attempted_at < now() - interval '1 day';
