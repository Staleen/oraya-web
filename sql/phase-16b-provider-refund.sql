-- Phase 16B: record a provider (or already-executed Business Center) card refund
-- against an immutable payment_transactions payment row.
-- Additive / safe to re-run. Service-role only.

create or replace function public.oraya_record_provider_refund(
  p_payment_transaction_id uuid,
  p_amount numeric,
  p_provider_reference text,
  p_idempotency_key text,
  p_staff_id uuid,
  p_notes text default null,
  p_verified_source text default 'provider'
)
returns table (
  refund_transaction_id uuid,
  request_amount_refunded numeric,
  booking_refund_amount numeric,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_original public.payment_transactions%rowtype;
  v_request public.payment_requests%rowtype;
  v_existing public.payment_transactions%rowtype;
  v_refund_id uuid;
  v_already_refunded numeric(14,2);
  v_request_refunded numeric(14,2);
  v_booking_refunded numeric(14,2);
  v_now timestamptz := timezone('utc', now());
begin
  if p_payment_transaction_id is null then
    raise exception using errcode = 'P0001', message = 'transaction_required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_amount';
  end if;
  if nullif(btrim(p_provider_reference), '') is null then
    raise exception using errcode = 'P0001', message = 'provider_reference_required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key_required';
  end if;
  if p_verified_source is null or p_verified_source not in ('provider', 'operator') then
    raise exception using errcode = 'P0001', message = 'invalid_verified_source';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_idempotency_key), 0));

  select * into v_existing
    from public.payment_transactions
    where idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'refund'
       or v_existing.reverses_transaction_id is distinct from p_payment_transaction_id
       or round(v_existing.amount, 2) <> round(p_amount, 2)
       or v_existing.provider_reference <> btrim(p_provider_reference) then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select * into v_original from public.payment_transactions where id = p_payment_transaction_id;
    select * into v_request from public.payment_requests where id = v_original.payment_request_id;
    return query select
      v_existing.id,
      case when v_request.id is null then null else v_request.amount_refunded end,
      case when v_original.booking_id is null then null
           else (select b.refund_amount from public.bookings b where b.id = v_original.booking_id) end,
      true;
    return;
  end if;

  select * into v_original
    from public.payment_transactions
    where id = p_payment_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'transaction_not_found';
  end if;
  if v_original.transaction_type <> 'payment' or v_original.status not in ('confirmed', 'refunded') then
    raise exception using errcode = 'P0001', message = 'transaction_not_refundable';
  end if;
  if v_original.provider <> 'credit_libanais' then
    raise exception using errcode = 'P0001', message = 'not_card_provider';
  end if;
  if nullif(btrim(coalesce(v_original.provider_reference, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'missing_provider_payment_id';
  end if;

  select coalesce(sum(amount), 0) into v_already_refunded
    from public.payment_transactions
    where reverses_transaction_id = v_original.id
      and transaction_type = 'refund'
      and status = 'confirmed';

  if round(v_already_refunded + p_amount, 2) > round(v_original.amount, 2) then
    raise exception using errcode = 'P0001', message = 'refund_exceeds_payment';
  end if;

  if v_original.payment_request_id is not null then
    select * into v_request from public.payment_requests
      where id = v_original.payment_request_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'request_not_found';
    end if;
  end if;

  insert into public.payment_transactions (
    payment_request_id, booking_id, transaction_type, status,
    amount, currency, applied_amount, applied_currency, exchange_rate,
    method, provider, wallet_presentation, provider_reference,
    receipt_reference, gross_amount, fee_amount, net_amount,
    verified_source, effective_at, created_by, reverses_transaction_id,
    idempotency_key, projection_before, notes
  ) values (
    v_original.payment_request_id, v_original.booking_id, 'refund', 'confirmed',
    round(p_amount, 2), v_original.currency, round(p_amount, 2), v_original.currency, null,
    v_original.method, 'credit_libanais', v_original.wallet_presentation,
    btrim(p_provider_reference),
    null, round(p_amount, 2), 0, round(p_amount, 2),
    p_verified_source, v_now, p_staff_id, v_original.id,
    btrim(p_idempotency_key),
    case when v_original.booking_id is null then '{}'::jsonb else jsonb_build_object(
      'refund_amount', (select b.refund_amount from public.bookings b where b.id = v_original.booking_id),
      'refund_status', (select b.refund_status from public.bookings b where b.id = v_original.booking_id),
      'refunded_at', (select b.refunded_at from public.bookings b where b.id = v_original.booking_id),
      'refund_provider_reference', (select b.refund_provider_reference from public.bookings b where b.id = v_original.booking_id)
    ) end,
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_refund_id;

  if round(v_already_refunded + p_amount, 2) >= round(v_original.amount, 2) then
    update public.payment_transactions
      set status = 'refunded'
      where id = v_original.id;
  end if;

  if v_original.payment_request_id is not null then
    v_request_refunded := round(coalesce(v_request.amount_refunded, 0) + p_amount, 2);
    update public.payment_requests
      set amount_refunded = v_request_refunded,
          updated_at = v_now
      where id = v_request.id;
  else
    v_request_refunded := null;
  end if;

  if v_original.booking_id is not null then
    update public.bookings
      set refund_amount = round(coalesce(refund_amount, 0) + p_amount, 2),
          refund_status = 'refunded',
          refunded_at = v_now,
          refund_provider_reference = btrim(p_provider_reference),
          payment_last_at = v_now,
          payment_marked_by = p_staff_id
      where id = v_original.booking_id
      returning refund_amount into v_booking_refunded;
  else
    v_booking_refunded := null;
  end if;

  return query select v_refund_id, v_request_refunded, v_booking_refunded, false;
end;
$$;

revoke all on function public.oraya_record_provider_refund(uuid,numeric,text,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.oraya_record_provider_refund(uuid,numeric,text,text,uuid,text,text)
  to service_role;
