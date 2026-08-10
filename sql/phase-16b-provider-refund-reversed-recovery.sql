-- Allow Refund card after a mistaken Ops "Reverse" on a card payment.
-- Reverse is ledger-only and does not return money at CyberSource.
-- Safe to re-run. Replaces only the claim function body check via full replace.

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
  if v_original.transaction_type <> 'payment'
     or v_original.status not in ('confirmed', 'refunded', 'reversed') then
    raise exception using errcode = 'P0001', message = 'transaction_not_refundable';
  end if;
  if v_original.provider <> 'credit_libanais' then
    raise exception using errcode = 'P0001', message = 'not_card_provider';
  end if;
  if nullif(btrim(coalesce(v_original.provider_reference, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'missing_provider_payment_id';
  end if;

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

revoke all on function public.oraya_claim_provider_refund(uuid,numeric,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.oraya_claim_provider_refund(uuid,numeric,text,uuid,text)
  to service_role;
