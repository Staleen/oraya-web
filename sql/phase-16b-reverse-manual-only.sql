-- Phase 16B: hard-lock ledger Reverse to manual provider only.
-- Safe to re-run. Identical to phase-16b-f1 reverse RPC plus one provider guard.
-- Card refunds must use oraya_*_provider_refund, never Reverse.

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
