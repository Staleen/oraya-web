-- Phase 16B: claim-before-provider card refunds (money-safe).
-- Additive / safe to re-run. Service-role only.
--
-- Flow:
--   1) oraya_claim_provider_refund  → pending row (reserves amount, blocks races)
--   2) CyberSource refund API
--   3) oraya_confirm_provider_refund → confirmed + projections
--      or oraya_fail_provider_refund → failed (retry-safe declines only)
-- Record-only path: oraya_record_provider_refund (BC already refunded).

-- Prevent double-counting the same CyberSource / BC refund id.
create unique index if not exists payment_transactions_refund_provider_ref_uidx
  on public.payment_transactions (provider, provider_reference)
  where transaction_type = 'refund'
    and status = 'confirmed'
    and provider_reference is not null
    and provider_reference not like 'pending:%';

create or replace function public.oraya_claim_provider_refund(
  p_payment_transaction_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_staff_id uuid,
  p_notes text default null
)
returns table (
  refund_transaction_id uuid,
  already_pending boolean,
  blocked_ambiguous boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_original public.payment_transactions%rowtype;
  v_existing public.payment_transactions%rowtype;
  v_pending public.payment_transactions%rowtype;
  v_refund_id uuid;
  v_reserved numeric(14,2);
  v_placeholder text;
begin
  if p_payment_transaction_id is null then
    raise exception using errcode = 'P0001', message = 'transaction_required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_amount';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('refund:' || p_payment_transaction_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_idempotency_key), 0));

  select * into v_existing
    from public.payment_transactions
    where idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'refund'
       or v_existing.reverses_transaction_id is distinct from p_payment_transaction_id
       or round(v_existing.amount, 2) <> round(p_amount, 2) then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    if v_existing.status = 'pending' then
      return query select v_existing.id, true, false;
      return;
    end if;
    if v_existing.status = 'confirmed' then
      raise exception using errcode = 'P0001', message = 'already_confirmed';
    end if;
    if v_existing.status = 'failed' then
      -- Same key may be reused only after an explicit fail (retry-safe decline).
      null;
    else
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
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

  -- Any other in-flight pending refund blocks a new provider attempt (ambiguous/do-not-retry).
  select * into v_pending
    from public.payment_transactions
    where reverses_transaction_id = v_original.id
      and transaction_type = 'refund'
      and status = 'pending'
      and idempotency_key is distinct from btrim(p_idempotency_key)
    limit 1;
  if found then
    return query select v_pending.id, false, true;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from public.payment_transactions
    where reverses_transaction_id = v_original.id
      and transaction_type = 'refund'
      and status in ('confirmed', 'pending');

  if round(v_reserved + p_amount, 2) > round(v_original.amount, 2) then
    raise exception using errcode = 'P0001', message = 'refund_exceeds_payment';
  end if;

  -- If same idempotency key previously failed, reuse the row as pending again.
  if v_existing.id is not null and v_existing.status = 'failed' then
    update public.payment_transactions
      set status = 'pending',
          provider_reference = 'pending:' || btrim(p_idempotency_key),
          notes = nullif(btrim(coalesce(p_notes, '')), ''),
          created_by = p_staff_id,
          effective_at = timezone('utc', now())
      where id = v_existing.id
      returning id into v_refund_id;
    return query select v_refund_id, false, false;
    return;
  end if;

  v_placeholder := 'pending:' || btrim(p_idempotency_key);
  insert into public.payment_transactions (
    payment_request_id, booking_id, transaction_type, status,
    amount, currency, applied_amount, applied_currency, exchange_rate,
    method, provider, wallet_presentation, provider_reference,
    receipt_reference, gross_amount, fee_amount, net_amount,
    verified_source, effective_at, created_by, reverses_transaction_id,
    idempotency_key, projection_before, notes
  ) values (
    v_original.payment_request_id, v_original.booking_id, 'refund', 'pending',
    round(p_amount, 2), v_original.currency, round(p_amount, 2), v_original.currency, null,
    v_original.method, 'credit_libanais', v_original.wallet_presentation,
    v_placeholder,
    null, round(p_amount, 2), 0, round(p_amount, 2),
    'provider', timezone('utc', now()), p_staff_id, v_original.id,
    btrim(p_idempotency_key), '{}'::jsonb,
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_refund_id;

  return query select v_refund_id, false, false;
end;
$$;

create or replace function public.oraya_confirm_provider_refund(
  p_refund_transaction_id uuid,
  p_provider_reference text,
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
  v_refund public.payment_transactions%rowtype;
  v_original public.payment_transactions%rowtype;
  v_request public.payment_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_confirmed_sum numeric(14,2);
  v_request_refunded numeric(14,2);
  v_booking_refunded numeric(14,2);
  v_booking_paid numeric(14,2);
  v_now timestamptz := timezone('utc', now());
  v_dup public.payment_transactions%rowtype;
begin
  if nullif(btrim(p_provider_reference), '') is null then
    raise exception using errcode = 'P0001', message = 'provider_reference_required';
  end if;
  if p_verified_source is null or p_verified_source not in ('provider', 'operator') then
    raise exception using errcode = 'P0001', message = 'invalid_verified_source';
  end if;
  if btrim(p_provider_reference) like 'pending:%' then
    raise exception using errcode = 'P0001', message = 'invalid_provider_reference';
  end if;

  select * into v_refund
    from public.payment_transactions
    where id = p_refund_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'refund_not_found';
  end if;
  if v_refund.transaction_type <> 'refund' then
    raise exception using errcode = 'P0001', message = 'not_a_refund';
  end if;

  if v_refund.status = 'confirmed'
     and v_refund.provider_reference = btrim(p_provider_reference) then
    select * into v_original from public.payment_transactions where id = v_refund.reverses_transaction_id;
    select * into v_request from public.payment_requests where id = v_refund.payment_request_id;
    return query select
      v_refund.id,
      case when v_request.id is null then null else v_request.amount_refunded end,
      case when v_refund.booking_id is null then null
           else (select b.refund_amount from public.bookings b where b.id = v_refund.booking_id) end,
      true;
    return;
  end if;

  if v_refund.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'refund_not_pending';
  end if;

  select * into v_dup
    from public.payment_transactions
    where provider = 'credit_libanais'
      and provider_reference = btrim(p_provider_reference)
      and transaction_type = 'refund'
      and status = 'confirmed'
      and id is distinct from v_refund.id
    limit 1;
  if found then
    raise exception using errcode = 'P0001', message = 'provider_reference_replay';
  end if;

  select * into v_original
    from public.payment_transactions
    where id = v_refund.reverses_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'transaction_not_found';
  end if;

  if v_refund.payment_request_id is not null then
    select * into v_request from public.payment_requests
      where id = v_refund.payment_request_id for update;
  end if;
  if v_refund.booking_id is not null then
    select * into v_booking from public.bookings
      where id = v_refund.booking_id for update;
  end if;

  update public.payment_transactions
    set status = 'confirmed',
        provider_reference = btrim(p_provider_reference),
        verified_source = p_verified_source,
        effective_at = v_now,
        projection_before = case when v_refund.booking_id is null then '{}'::jsonb else jsonb_build_object(
          'refund_amount', v_booking.refund_amount,
          'refund_status', v_booking.refund_status,
          'refunded_at', v_booking.refunded_at,
          'refund_provider_reference', v_booking.refund_provider_reference,
          'amount_paid', v_booking.amount_paid,
          'amount_due', v_booking.amount_due,
          'payment_status', v_booking.payment_status
        ) end
    where id = v_refund.id;

  select coalesce(sum(amount), 0) into v_confirmed_sum
    from public.payment_transactions
    where reverses_transaction_id = v_original.id
      and transaction_type = 'refund'
      and status = 'confirmed';

  if round(v_confirmed_sum, 2) >= round(v_original.amount, 2) then
    update public.payment_transactions set status = 'refunded' where id = v_original.id;
  end if;

  if v_refund.payment_request_id is not null then
    v_request_refunded := round(coalesce(v_request.amount_refunded, 0) + v_refund.amount, 2);
    update public.payment_requests
      set amount_refunded = v_request_refunded,
          updated_at = v_now
      where id = v_request.id;
  else
    v_request_refunded := null;
  end if;

  if v_refund.booking_id is not null then
    v_booking_refunded := round(coalesce(v_booking.refund_amount, 0) + v_refund.amount, 2);
    v_booking_paid := coalesce(v_booking.amount_paid, 0);
    update public.bookings
      set refund_amount = v_booking_refunded,
          refund_status = case
            when v_booking_paid > 0 and v_booking_refunded < v_booking_paid then 'partial_refund'
            else 'refunded'
          end,
          refunded_at = v_now,
          refund_provider_reference = btrim(p_provider_reference),
          payment_last_at = v_now,
          payment_marked_by = v_refund.created_by
      where id = v_booking.id;
  else
    v_booking_refunded := null;
  end if;

  return query select v_refund.id, v_request_refunded, v_booking_refunded, false;
end;
$$;

create or replace function public.oraya_fail_provider_refund(
  p_refund_transaction_id uuid,
  p_reason text default null
)
returns table (refund_transaction_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_refund public.payment_transactions%rowtype;
begin
  select * into v_refund
    from public.payment_transactions
    where id = p_refund_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'refund_not_found';
  end if;
  if v_refund.transaction_type <> 'refund' then
    raise exception using errcode = 'P0001', message = 'not_a_refund';
  end if;
  if v_refund.status = 'failed' then
    return query select v_refund.id;
    return;
  end if;
  if v_refund.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'refund_not_pending';
  end if;

  update public.payment_transactions
    set status = 'failed',
        notes = case
          when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
          when notes is null or notes = '' then btrim(p_reason)
          else notes || E'\n' || btrim(p_reason)
        end
    where id = v_refund.id;

  return query select v_refund.id;
end;
$$;

-- Record-only path for refunds already executed in Business Center.
create or replace function public.oraya_record_provider_refund(
  p_payment_transaction_id uuid,
  p_amount numeric,
  p_provider_reference text,
  p_idempotency_key text,
  p_staff_id uuid,
  p_notes text default null,
  p_verified_source text default 'operator'
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
  v_claim record;
  v_confirm record;
begin
  if p_verified_source is null then
    p_verified_source := 'operator';
  end if;

  -- Reconcile an existing pending claim for this idempotency key when present.
  select * into v_claim
    from public.oraya_claim_provider_refund(
      p_payment_transaction_id, p_amount, p_idempotency_key, p_staff_id, p_notes
    );
  if v_claim.blocked_ambiguous then
    raise exception using errcode = 'P0001', message = 'refund_ambiguous_pending';
  end if;

  select * into v_confirm
    from public.oraya_confirm_provider_refund(
      v_claim.refund_transaction_id, p_provider_reference, p_verified_source
    );

  return query select
    v_confirm.refund_transaction_id,
    v_confirm.request_amount_refunded,
    v_confirm.booking_refund_amount,
    v_confirm.idempotent or v_claim.already_pending;
end;
$$;

revoke all on function public.oraya_claim_provider_refund(uuid,numeric,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.oraya_claim_provider_refund(uuid,numeric,text,uuid,text)
  to service_role;

revoke all on function public.oraya_confirm_provider_refund(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.oraya_confirm_provider_refund(uuid,text,text)
  to service_role;

revoke all on function public.oraya_fail_provider_refund(uuid,text)
  from public, anon, authenticated;
grant execute on function public.oraya_fail_provider_refund(uuid,text)
  to service_role;

revoke all on function public.oraya_record_provider_refund(uuid,numeric,text,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.oraya_record_provider_refund(uuid,numeric,text,text,uuid,text,text)
  to service_role;
