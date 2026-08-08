-- Phase 16B card bridge: make canonical payment requests payable through
-- Credit Libanais / NetCommerce while preserving one durable attempt per
-- payable subject and one immutable provider transaction per authorization.

alter table public.payment_requests
  add column if not exists payment_provider text,
  add column if not exists payment_provider_session_id text,
  add column if not exists checkout_started_at timestamptz;

alter table public.payment_requests
  drop constraint if exists payment_requests_payment_provider_check;
alter table public.payment_requests
  add constraint payment_requests_payment_provider_check
  check (payment_provider is null or payment_provider in ('credit_libanais'));

alter table public.payment_attempts
  alter column booking_id drop not null;
alter table public.payment_attempts
  add column if not exists payment_request_id uuid
  references public.payment_requests(id) on delete set null;
alter table public.payment_attempts
  drop constraint if exists payment_attempts_subject_required;
alter table public.payment_attempts
  add constraint payment_attempts_subject_required
  check (booking_id is not null or payment_request_id is not null);

create unique index if not exists payment_attempts_one_in_flight_per_request
  on public.payment_attempts (payment_request_id)
  where payment_request_id is not null
    and status in ('claimed', 'authorized', 'ambiguous');

create index if not exists payment_attempts_request_idx
  on public.payment_attempts (payment_request_id, created_at desc)
  where payment_request_id is not null;

-- A double-click or concurrent browser retry must reuse the same payable link.
-- Terminal requests no longer participate, so a later legitimate collection can
-- create a fresh request for the same booking and amount.
create unique index if not exists payment_requests_one_active_card_collection
  on public.payment_requests (booking_id, purpose, amount, currency)
  where booking_id is not null
    and status in ('active', 'partially_paid')
    and allowed_methods @> array['card']::text[];

create or replace function public.oraya_record_provider_payment(
  p_request_id uuid,
  p_amount numeric,
  p_currency text,
  p_provider_reference text,
  p_effective_at timestamptz,
  p_idempotency_key text,
  p_wallet_presentation text default null
)
returns table (
  transaction_id uuid,
  request_status text,
  request_amount_paid numeric,
  booking_amount_paid numeric,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.payment_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_existing public.payment_transactions%rowtype;
  v_transaction_id uuid;
  v_request_paid numeric(14,2);
  v_booking_paid numeric(14,2);
  v_booking_total numeric(14,2);
  v_request_status text;
  v_now timestamptz := coalesce(p_effective_at, timezone('utc', now()));
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'request_required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_amount';
  end if;
  if p_currency not in ('USD','LBP') then
    raise exception using errcode = 'P0001', message = 'invalid_currency';
  end if;
  if nullif(btrim(p_provider_reference), '') is null then
    raise exception using errcode = 'P0001', message = 'provider_reference_required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key_required';
  end if;
  if p_wallet_presentation is not null and p_wallet_presentation not in ('apple_pay','google_pay') then
    raise exception using errcode = 'P0001', message = 'invalid_wallet_presentation';
  end if;

  -- Serialize browser-return and webhook reconciliation for the same provider
  -- authorization before checking the immutable transaction ledger.
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_idempotency_key), 0));

  select * into v_existing
    from public.payment_transactions
    where idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.payment_request_id is distinct from p_request_id
       or round(v_existing.amount, 2) <> round(p_amount, 2)
       or v_existing.currency <> p_currency
       or v_existing.provider <> 'credit_libanais'
       or v_existing.provider_reference <> btrim(p_provider_reference) then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select * into v_request from public.payment_requests where id = p_request_id;
    return query select v_existing.id, v_request.status, v_request.amount_paid,
      case when v_request.booking_id is null then null
           else (select b.amount_paid from public.bookings b where b.id = v_request.booking_id) end,
      true;
    return;
  end if;

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
  if not ('card' = any(v_request.allowed_methods)) then
    raise exception using errcode = 'P0001', message = 'card_not_allowed';
  end if;
  if v_request.currency <> p_currency then
    raise exception using errcode = 'P0001', message = 'currency_mismatch';
  end if;
  if round(p_amount, 2) > round(v_request.amount - v_request.amount_paid, 2) then
    raise exception using errcode = 'P0001', message = 'overpayment';
  end if;

  if v_request.booking_id is not null then
    select * into v_booking from public.bookings
      where id = v_request.booking_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'booking_not_found';
    end if;
  end if;

  insert into public.payment_transactions (
    payment_request_id, booking_id, transaction_type, status,
    amount, currency, applied_amount, applied_currency, exchange_rate,
    method, provider, wallet_presentation, provider_reference,
    receipt_reference, gross_amount, fee_amount, net_amount,
    verified_source, effective_at, created_by, idempotency_key,
    projection_before, notes
  ) values (
    v_request.id, v_request.booking_id, 'payment', 'confirmed',
    round(p_amount, 2), p_currency, round(p_amount, 2), p_currency, null,
    case when p_wallet_presentation is null then 'card' else 'wallet' end,
    'credit_libanais', p_wallet_presentation, btrim(p_provider_reference),
    null, round(p_amount, 2), 0, round(p_amount, 2),
    'provider', v_now, null, btrim(p_idempotency_key),
    case when v_request.booking_id is null then '{}'::jsonb else jsonb_build_object(
      'amount_paid', v_booking.amount_paid,
      'amount_total', v_booking.amount_total,
      'amount_due', v_booking.amount_due,
      'payment_status', v_booking.payment_status,
      'payment_stage', v_booking.payment_stage,
      'payment_method', v_booking.payment_method,
      'payment_reference', v_booking.payment_reference,
      'payment_received_at', v_booking.payment_received_at,
      'payment_link_status', v_booking.payment_link_status
    ) end,
    null
  ) returning id into v_transaction_id;

  v_request_paid := round(v_request.amount_paid + p_amount, 2);
  v_request_status := case when v_request_paid >= v_request.amount then 'paid' else 'partially_paid' end;
  update public.payment_requests
    set amount_paid = v_request_paid,
        status = v_request_status,
        updated_at = timezone('utc', now())
    where id = v_request.id;

  if v_request.booking_id is not null then
    v_booking_paid := round(coalesce(v_booking.amount_paid, 0) + p_amount, 2);
    v_booking_total := v_booking.amount_total;
    update public.bookings
      set amount_paid = v_booking_paid,
          amount_due = case when v_booking_total is null then null else greatest(round(v_booking_total - v_booking_paid, 2), 0) end,
          payment_status = case when v_booking_total is not null and v_booking_paid >= v_booking_total then 'paid_in_full' else 'deposit_paid' end,
          payment_stage = case when v_booking_total is not null and v_booking_paid >= v_booking_total then 'fully_paid' else 'partially_paid' end,
          payment_method = 'card_manual',
          payment_reference = btrim(p_provider_reference),
          payment_received_at = v_now,
          payment_last_at = timezone('utc', now()),
          payment_link_status = case when v_request_status = 'paid' then 'paid' else payment_link_status end
      where id = v_request.booking_id;
  else
    v_booking_paid := null;
  end if;

  return query select v_transaction_id, v_request_status, v_request_paid, v_booking_paid, false;
end;
$$;

revoke all on function public.oraya_record_provider_payment(uuid,numeric,text,text,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.oraya_record_provider_payment(uuid,numeric,text,text,timestamptz,text,text)
  to service_role;

-- Once a provider authorization has been claimed, an operator receipt for
-- the same request must wait. This closes the race where cash could be
-- recorded while the bank call is in flight and turn an approved card charge
-- into an overpayment requiring manual reconciliation.
create or replace function public.oraya_block_manual_receipt_during_provider_attempt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.verified_source = 'operator'
     and new.payment_request_id is not null
     and exists (
       select 1 from public.payment_attempts a
       where a.payment_request_id = new.payment_request_id
         and a.status in ('claimed','authorized','ambiguous')
     ) then
    raise exception using errcode = 'P0001', message = 'provider_payment_in_progress';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_transactions_block_manual_during_provider_attempt
  on public.payment_transactions;
create trigger payment_transactions_block_manual_during_provider_attempt
before insert on public.payment_transactions
for each row execute function public.oraya_block_manual_receipt_during_provider_attempt();
