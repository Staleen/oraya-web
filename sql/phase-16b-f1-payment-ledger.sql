-- Phase 16B-F1/F2/F3: canonical payment requests and immutable transaction ledger.
-- Additive, safe to run once through the Supabase migration runner.
-- All tables are server-only through the Data API: RLS is enabled, public and
-- user roles are revoked, and only service_role receives table privileges.

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  public_token_ciphertext text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  member_id uuid references auth.users(id) on delete set null,
  payer_name text not null,
  payer_email text,
  payer_phone text,
  description text not null,
  purpose text not null check (purpose in ('deposit','balance','full','addon','event','damage','other')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('USD','LBP')),
  allowed_methods text[] not null check (
    cardinality(allowed_methods) > 0
    and allowed_methods <@ array['cash','bank_transfer','card','apple_pay','whish','omt','western_union','suyool']::text[]
  ),
  status text not null default 'active'
    check (status in ('draft','active','partially_paid','paid','expired','cancelled')),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  amount_refunded numeric(14,2) not null default 0 check (amount_refunded >= 0),
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payment_requests_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);

create index if not exists payment_requests_booking_idx
  on public.payment_requests (booking_id, created_at desc)
  where booking_id is not null;
create index if not exists payment_requests_member_idx
  on public.payment_requests (member_id, created_at desc)
  where member_id is not null;
create index if not exists payment_requests_status_idx
  on public.payment_requests (status, created_at desc);
create index if not exists payment_requests_created_by_idx
  on public.payment_requests (created_by)
  where created_by is not null;
create index if not exists payment_requests_expires_idx
  on public.payment_requests (expires_at)
  where status in ('active','partially_paid') and expires_at is not null;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid references public.payment_requests(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('payment','refund','reversal','adjustment')),
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','failed','reversed','refunded')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('USD','LBP')),
  applied_amount numeric(14,2) not null check (applied_amount > 0),
  applied_currency text not null check (applied_currency in ('USD','LBP')),
  exchange_rate numeric(20,8) check (exchange_rate is null or exchange_rate > 0),
  method text not null check (method in ('cash','bank_transfer','card','wallet','transfer','other')),
  provider text not null
    check (provider in ('manual','credit_libanais','whish','omt','western_union','suyool','other')),
  wallet_presentation text check (wallet_presentation is null or wallet_presentation in ('apple_pay','google_pay')),
  provider_reference text,
  receipt_reference text,
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  verified_source text not null check (verified_source in ('operator','provider','reconciliation')),
  effective_at timestamptz not null,
  created_by uuid references public.staff(id) on delete set null,
  reverses_transaction_id uuid references public.payment_transactions(id) on delete restrict,
  idempotency_key text unique,
  projection_before jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.payment_transactions
  add column if not exists projection_before jsonb not null default '{}'::jsonb;

create index if not exists payment_transactions_request_idx
  on public.payment_transactions (payment_request_id, effective_at desc)
  where payment_request_id is not null;
create index if not exists payment_transactions_booking_idx
  on public.payment_transactions (booking_id, effective_at desc)
  where booking_id is not null;
create index if not exists payment_transactions_provider_reference_idx
  on public.payment_transactions (provider, provider_reference)
  where provider_reference is not null;
create unique index if not exists payment_transactions_one_reversal_idx
  on public.payment_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null and transaction_type = 'reversal';
create index if not exists payment_transactions_created_by_idx
  on public.payment_transactions (created_by)
  where created_by is not null;

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  received_at timestamptz not null default timezone('utc', now()),
  occurred_at timestamptz,
  verification_status text not null
    check (verification_status in ('verified','rejected','unverifiable')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processed','ignored','failed')),
  replay_key text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_code text,
  unique (provider, provider_event_id),
  unique (provider, replay_key)
);

create index if not exists payment_provider_events_request_idx
  on public.payment_provider_events (payment_request_id, received_at desc)
  where payment_request_id is not null;
create index if not exists payment_provider_events_processing_idx
  on public.payment_provider_events (processing_status, received_at);
create index if not exists payment_provider_events_transaction_idx
  on public.payment_provider_events (payment_transaction_id)
  where payment_transaction_id is not null;

alter table public.payment_requests enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_provider_events enable row level security;

revoke all on table public.payment_requests from public, anon, authenticated;
revoke all on table public.payment_transactions from public, anon, authenticated;
revoke all on table public.payment_provider_events from public, anon, authenticated;
grant select, insert, update on table public.payment_requests to service_role;
grant select, insert, update on table public.payment_transactions to service_role;
grant select, insert, update on table public.payment_provider_events to service_role;

-- Financial facts are append-only. A reversal may change only the original
-- transaction's status; every correction is a new row with a reason.
create or replace function public.oraya_protect_payment_transaction_facts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  settling_pending_refund boolean;
begin
  settling_pending_refund :=
    old.transaction_type = 'refund'
    and old.status = 'pending'
    and new.status in ('confirmed', 'failed');

  if new.id is distinct from old.id
     or new.payment_request_id is distinct from old.payment_request_id
     or new.booking_id is distinct from old.booking_id
     or new.transaction_type is distinct from old.transaction_type
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.applied_amount is distinct from old.applied_amount
     or new.applied_currency is distinct from old.applied_currency
     or new.exchange_rate is distinct from old.exchange_rate
     or new.method is distinct from old.method
     or new.provider is distinct from old.provider
     or new.wallet_presentation is distinct from old.wallet_presentation
     or new.receipt_reference is distinct from old.receipt_reference
     or new.gross_amount is distinct from old.gross_amount
     or new.fee_amount is distinct from old.fee_amount
     or new.net_amount is distinct from old.net_amount
     or new.created_by is distinct from old.created_by
     or new.reverses_transaction_id is distinct from old.reverses_transaction_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'payment_transaction_facts_are_immutable';
  end if;

  -- Pending refund settlement may write the final provider reference + audit fields.
  if settling_pending_refund then
    return new;
  end if;

  -- Re-claim of a previously failed refund (same idempotency key).
  if old.transaction_type = 'refund'
     and old.status = 'failed'
     and new.status = 'pending' then
    return new;
  end if;

  if new.provider_reference is distinct from old.provider_reference
     or new.verified_source is distinct from old.verified_source
     or new.effective_at is distinct from old.effective_at
     or new.projection_before is distinct from old.projection_before
     or new.notes is distinct from old.notes then
    raise exception using errcode = 'P0001', message = 'payment_transaction_facts_are_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_transactions_protect_facts on public.payment_transactions;
create trigger payment_transactions_protect_facts
before update on public.payment_transactions
for each row execute function public.oraya_protect_payment_transaction_facts();

-- Atomic operator-authoritative receipt. The authenticated /ops API proves the
-- staff identity before calling this service-role-only function.
create or replace function public.oraya_record_manual_payment(
  p_request_id uuid,
  p_booking_id uuid,
  p_amount numeric,
  p_currency text,
  p_applied_amount numeric,
  p_method text,
  p_provider text,
  p_reference text,
  p_notes text,
  p_effective_at timestamptz,
  p_staff_id uuid,
  p_expected_booking_amount_paid numeric,
  p_idempotency_key text
)
returns table (
  transaction_id uuid,
  request_status text,
  request_amount_paid numeric,
  booking_amount_paid numeric
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.payment_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_booking_id uuid;
  v_transaction_id uuid;
  v_request_paid numeric(14,2);
  v_booking_paid numeric(14,2);
  v_booking_total numeric(14,2);
  v_request_status text;
  v_legacy_method text;
begin
  if p_amount is null or p_amount <= 0 or p_applied_amount is null or p_applied_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_amount';
  end if;
  if p_currency not in ('USD','LBP') then
    raise exception using errcode = 'P0001', message = 'invalid_currency';
  end if;
  if p_method not in ('cash','bank_transfer','wallet','transfer','other') then
    raise exception using errcode = 'P0001', message = 'invalid_manual_method';
  end if;
  if p_provider not in ('manual','whish','omt','western_union','suyool','other') then
    raise exception using errcode = 'P0001', message = 'invalid_manual_provider';
  end if;
  if nullif(btrim(p_reference), '') is null then
    raise exception using errcode = 'P0001', message = 'reference_required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key_required';
  end if;

  if p_request_id is not null then
    select * into v_request
      from public.payment_requests
      where id = p_request_id
      for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'request_not_found';
    end if;
    if v_request.status not in ('active','partially_paid') then
      raise exception using errcode = 'P0001', message = 'request_not_payable';
    end if;
    if v_request.expires_at is not null and v_request.expires_at <= timezone('utc', now()) then
      update public.payment_requests
        set status = 'expired', updated_at = timezone('utc', now())
        where id = v_request.id;
      raise exception using errcode = 'P0001', message = 'request_expired';
    end if;
    if p_applied_amount > round(v_request.amount - v_request.amount_paid, 2) then
      raise exception using errcode = 'P0001', message = 'overpayment';
    end if;
    v_booking_id := coalesce(p_booking_id, v_request.booking_id);
    if p_booking_id is not null and v_request.booking_id is not null and p_booking_id <> v_request.booking_id then
      raise exception using errcode = 'P0001', message = 'booking_mismatch';
    end if;
    if v_booking_id is not null and v_request.currency <> 'USD' then
      raise exception using errcode = 'P0001', message = 'booking_request_currency_must_be_usd';
    end if;
    if p_applied_amount > 0 and v_request.currency <> p_currency and round(p_amount / p_applied_amount, 8) <= 0 then
      raise exception using errcode = 'P0001', message = 'invalid_exchange_rate';
    end if;
  else
    v_booking_id := p_booking_id;
  end if;

  if v_booking_id is not null then
    select * into v_booking
      from public.bookings
      where id = v_booking_id
      for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'booking_not_found';
    end if;
    if p_expected_booking_amount_paid is not null
       and round(coalesce(v_booking.amount_paid, 0), 2) <> round(p_expected_booking_amount_paid, 2) then
      raise exception using errcode = 'P0001', message = 'changed_elsewhere';
    end if;
  end if;

  insert into public.payment_transactions (
    payment_request_id, booking_id, transaction_type, status,
    amount, currency, applied_amount, applied_currency, exchange_rate,
    method, provider, provider_reference, receipt_reference, idempotency_key, projection_before,
    gross_amount, fee_amount, net_amount, verified_source,
    effective_at, created_by, notes
  ) values (
    p_request_id, v_booking_id, 'payment', 'confirmed',
    round(p_amount, 2), p_currency, round(p_applied_amount, 2),
    coalesce(v_request.currency, p_currency),
    case when coalesce(v_request.currency, p_currency) = p_currency then null
         else round(p_amount / p_applied_amount, 8) end,
    p_method, p_provider, null, btrim(p_reference), btrim(p_idempotency_key),
    case when v_booking_id is null then '{}'::jsonb else jsonb_build_object(
      'amount_paid', v_booking.amount_paid,
      'amount_total', v_booking.amount_total,
      'amount_due', v_booking.amount_due,
      'payment_status', v_booking.payment_status,
      'payment_stage', v_booking.payment_stage,
      'payment_method', v_booking.payment_method,
      'payment_reference', v_booking.payment_reference,
      'payment_received_at', v_booking.payment_received_at
    ) end,
    round(p_amount, 2), 0, round(p_amount, 2), 'operator',
    coalesce(p_effective_at, timezone('utc', now())), p_staff_id, nullif(btrim(p_notes), '')
  ) returning id into v_transaction_id;

  if p_request_id is not null then
    v_request_paid := round(v_request.amount_paid + p_applied_amount, 2);
    v_request_status := case when v_request_paid >= v_request.amount then 'paid' else 'partially_paid' end;
    update public.payment_requests
      set amount_paid = v_request_paid,
          status = v_request_status,
          updated_at = timezone('utc', now())
      where id = p_request_id;
  else
    v_request_paid := null;
    v_request_status := null;
  end if;

  if v_booking_id is not null then
    v_booking_paid := round(coalesce(v_booking.amount_paid, 0) + p_applied_amount, 2);
    -- A request may be only a deposit or add-on. It is never authoritative for
    -- the booking's full contract total, so do not substitute request.amount.
    v_booking_total := v_booking.amount_total;
    v_legacy_method := case
      when p_provider = 'whish' then 'whish'
      when p_method = 'cash' then 'cash'
      when p_method = 'bank_transfer' then 'bank_transfer'
      else 'other'
    end;
    update public.bookings
      set amount_paid = v_booking_paid,
          amount_total = v_booking_total,
          amount_due = case when v_booking_total is null then null else greatest(round(v_booking_total - v_booking_paid, 2), 0) end,
          payment_status = case when v_booking_total is not null and v_booking_paid >= v_booking_total then 'paid_in_full' else 'deposit_paid' end,
          payment_stage = case when v_booking_total is not null and v_booking_paid >= v_booking_total then 'fully_paid' else 'partially_paid' end,
          payment_method = v_legacy_method,
          payment_reference = btrim(p_reference),
          payment_received_at = coalesce(p_effective_at, timezone('utc', now())),
          payment_last_at = timezone('utc', now()),
          payment_marked_by = p_staff_id
      where id = v_booking_id;
  else
    v_booking_paid := null;
  end if;

  return query select v_transaction_id, v_request_status, v_request_paid, v_booking_paid;
end;
$$;

revoke all on function public.oraya_record_manual_payment(uuid,uuid,numeric,text,numeric,text,text,text,text,timestamptz,uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.oraya_record_manual_payment(uuid,uuid,numeric,text,numeric,text,text,text,text,timestamptz,uuid,numeric,text) to service_role;

create or replace function public.oraya_reverse_manual_payment(
  p_transaction_id uuid,
  p_reason text,
  p_staff_id uuid
)
returns table (
  reversal_transaction_id uuid,
  request_status text,
  request_amount_paid numeric,
  booking_amount_paid numeric
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_original public.payment_transactions%rowtype;
  v_request public.payment_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_reversal_id uuid;
  v_request_paid numeric(14,2);
  v_booking_paid numeric(14,2);
  v_request_status text;
  v_booking_total numeric(14,2);
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;

  select * into v_original
    from public.payment_transactions
    where id = p_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'transaction_not_found';
  end if;
  if v_original.transaction_type not in ('payment','adjustment') or v_original.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'transaction_not_reversible';
  end if;
  -- Money-safety: Reverse is bookkeeping for cash/manual rails only.
  if v_original.provider is distinct from 'manual' then
    raise exception using errcode = 'P0001', message = 'card_use_refund_not_reverse';
  end if;
  if v_original.booking_id is not null and exists (
    select 1 from public.payment_transactions newer
      where newer.booking_id = v_original.booking_id
        and newer.transaction_type in ('payment','adjustment')
        and newer.status = 'confirmed'
        and (newer.created_at, newer.id) > (v_original.created_at, v_original.id)
  ) then
    raise exception using errcode = 'P0001', message = 'newer_transaction_exists';
  end if;

  if v_original.payment_request_id is not null then
    select * into v_request from public.payment_requests
      where id = v_original.payment_request_id for update;
  end if;
  if v_original.booking_id is not null then
    select * into v_booking from public.bookings
      where id = v_original.booking_id for update;
  end if;

  insert into public.payment_transactions (
    payment_request_id, booking_id, transaction_type, status,
    amount, currency, applied_amount, applied_currency, exchange_rate,
    method, provider, provider_reference, receipt_reference,
    gross_amount, fee_amount, net_amount, verified_source,
    effective_at, created_by, reverses_transaction_id, notes
  ) values (
    v_original.payment_request_id, v_original.booking_id, 'reversal', 'confirmed',
    v_original.amount, v_original.currency, v_original.applied_amount, v_original.applied_currency,
    v_original.exchange_rate, v_original.method, v_original.provider,
    v_original.provider_reference, v_original.receipt_reference,
    v_original.gross_amount, v_original.fee_amount, v_original.net_amount,
    'operator', timezone('utc', now()), p_staff_id, v_original.id, btrim(p_reason)
  ) returning id into v_reversal_id;

  update public.payment_transactions set status = 'reversed' where id = v_original.id;

  if v_original.payment_request_id is not null then
    v_request_paid := greatest(round(v_request.amount_paid - v_original.applied_amount, 2), 0);
    v_request_status := case
      when v_request.status in ('cancelled','expired') then v_request.status
      when v_request_paid = 0 then 'active'
      when v_request_paid >= v_request.amount then 'paid'
      else 'partially_paid'
    end;
    update public.payment_requests
      set amount_paid = v_request_paid,
          status = v_request_status,
          updated_at = timezone('utc', now())
      where id = v_original.payment_request_id;
  else
    v_request_paid := null;
    v_request_status := null;
  end if;

  if v_original.booking_id is not null then
    v_booking_paid := coalesce((v_original.projection_before ->> 'amount_paid')::numeric, 0);
    v_booking_total := nullif(v_original.projection_before ->> 'amount_total', '')::numeric;
    update public.bookings
      set amount_paid = v_booking_paid,
          amount_total = v_booking_total,
          amount_due = nullif(v_original.projection_before ->> 'amount_due', '')::numeric,
          payment_status = nullif(v_original.projection_before ->> 'payment_status', ''),
          payment_stage = nullif(v_original.projection_before ->> 'payment_stage', ''),
          payment_method = nullif(v_original.projection_before ->> 'payment_method', ''),
          payment_reference = nullif(v_original.projection_before ->> 'payment_reference', ''),
          payment_received_at = nullif(v_original.projection_before ->> 'payment_received_at', '')::timestamptz,
          payment_last_at = timezone('utc', now()),
          payment_marked_by = p_staff_id
      where id = v_original.booking_id;
  else
    v_booking_paid := null;
  end if;

  return query select v_reversal_id, v_request_status, v_request_paid, v_booking_paid;
end;
$$;

revoke all on function public.oraya_reverse_manual_payment(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.oraya_reverse_manual_payment(uuid,text,uuid) to service_role;
