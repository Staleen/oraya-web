-- Phase 16B-NC: link durable CyberSource attempts/events to the canonical
-- payment request ledger. Additive and safe to re-run.

alter table public.payment_attempts
  add column if not exists payment_request_id uuid
  references public.payment_requests(id) on delete set null;

create index if not exists payment_attempts_request_idx
  on public.payment_attempts (payment_request_id, created_at desc)
  where payment_request_id is not null;
