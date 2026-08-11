-- Phase 16B M1: claim-before-provider AUTHORIZATION REVERSAL (void) for card
-- authorizations that were approved but never settled.
--
-- Additive / safe to re-run. Service-role only.
--
-- Why this exists
--   A credit (refund) against an unsettled authorization is the wrong
--   instrument and fails at CyberSource with reason 102 DINVALIDDATA (live
--   evidence 2026-08-10, merchant 06385000, request id
--   7863958223886680704897). Business Center's own guidance for those rows is
--   Authorization Reversal. A reversal is NOT a refund: no money ever moved,
--   so it must never be written as a refund row and must never appear as one.
--
-- Relationship to existing objects
--   * oraya_reverse_manual_payment stays hard-locked to provider = 'manual'
--     (sql/phase-16b-reverse-manual-only.sql). This file does not touch it.
--     Ops "Reverse" (cash bookkeeping) and provider void stay separate.
--   * oraya_*_provider_refund stay exactly as they are.
--   * oraya_protect_payment_transaction_facts is re-created below. It keeps
--     BOTH existing refund exceptions from
--     sql/phase-16b-provider-refund-settle-protect.sql verbatim and adds the
--     same narrow allowance for reversal rows, so a pending void can settle
--     or fail. Nothing that was immutable becomes mutable for any other row.
--
-- Flow:
--   1) oraya_claim_provider_authorization_reversal  → pending reversal row
--   2) CyberSource POST /pts/v2/payments/{id}/reversals
--   3) oraya_confirm_provider_authorization_reversal → confirmed + projections
--      or oraya_fail_provider_authorization_reversal → failed (clean declines)

-- ---------------------------------------------------------------------------
-- 0. Immutability trigger: allow a pending reversal to settle or fail.
--    (Refund branches are unchanged from the already-applied settle-protect.)
-- ---------------------------------------------------------------------------
create or replace function public.oraya_protect_payment_transaction_facts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  settling_pending_refund boolean;
  settling_pending_reversal boolean;
begin
  settling_pending_refund :=
    old.transaction_type = 'refund'
    and old.status = 'pending'
    and new.status in ('confirmed', 'failed');

  settling_pending_reversal :=
    old.transaction_type = 'reversal'
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

  -- Pending authorization-reversal settlement may write the provider reversal
  -- id + audit fields. Same narrow allowance, different transaction_type.
  if settling_pending_reversal then
    return new;
  end if;

  -- Re-claim of a previously failed refund (same idempotency key) may reset
  -- pending placeholder fields — only failed → pending on refund rows.
  if old.transaction_type = 'refund'
     and old.status = 'failed'
     and new.status = 'pending' then
    return new;
  end if;

  -- Same re-claim allowance for a previously failed authorization reversal.
  if old.transaction_type = 'reversal'
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

-- Prevent double-counting the same CyberSource reversal id.
create unique index if not exists payment_transactions_reversal_provider_ref_uidx
  on public.payment_transactions (provider, provider_reference)
  where transaction_type = 'reversal'
    and status = 'confirmed'
    and provider <> 'manual'
    and provider_reference is not null
    and provider_reference not like 'pending:%';

-- ---------------------------------------------------------------------------
-- 1. Claim (before the provider is called)
-- ---------------------------------------------------------------------------
create or replace function public.oraya_claim_provider_authorization_reversal(
  p_payment_transaction_id uuid,
  p_idempotency_key text,
  p_staff_id uuid,
  p_notes text default null
)
returns table (
  reversal_transaction_id uuid,
  already_pending boolean,
  blocked boolean,
  block_reason text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_original public.payment_transactions%rowtype;
  v_existing public.payment_transactions%rowtype;
  v_pending public.payment_transactions%rowtype;
  v_reversal_id uuid;
  v_refunds numeric(14,2);
  v_placeholder text;
begin
  if p_payment_transaction_id is null then
    raise exception using errcode = 'P0001', message = 'transaction_required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception using errcode = 'P0001', message = 'idempotency_key_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('reversal:' || p_payment_transaction_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_idempotency_key), 0));

  select * into v_existing
    from public.payment_transactions
    where idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'reversal'
       or v_existing.reverses_transaction_id is distinct from p_payment_transaction_id then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    if v_existing.status = 'pending' then
      return query select v_existing.id, true, false, null::text;
      return;
    end if;
    if v_existing.status = 'confirmed' then
      raise exception using errcode = 'P0001', message = 'already_confirmed';
    end if;
    if v_existing.status <> 'failed' then
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
  if v_original.transaction_type <> 'payment' then
    raise exception using errcode = 'P0001', message = 'not_a_payment';
  end if;
  if v_original.provider <> 'credit_libanais' then
    raise exception using errcode = 'P0001', message = 'not_card_provider';
  end if;
  if nullif(btrim(coalesce(v_original.provider_reference, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'missing_provider_payment_id';
  end if;
  if v_original.status = 'reversed' then
    return query select null::uuid, false, true, 'already_reversed'::text;
    return;
  end if;
  if v_original.status <> 'confirmed' then
    return query select null::uuid, false, true, 'transaction_not_voidable'::text;
    return;
  end if;

  -- A recorded refund means Oraya's ledger already asserts money went back.
  -- Voiding on top of that would state two different money stories. A human
  -- must resolve the refund record first — never rewritten here.
  select coalesce(sum(amount), 0) into v_refunds
    from public.payment_transactions
    where reverses_transaction_id = v_original.id
      and transaction_type = 'refund'
      and status in ('confirmed', 'pending');
  if v_refunds > 0 then
    return query select null::uuid, false, true, 'refund_already_recorded'::text;
    return;
  end if;

  -- A newer confirmed money row on the same booking would make the projection
  -- restore below incorrect.
  if v_original.booking_id is not null and exists (
    select 1 from public.payment_transactions newer
      where newer.booking_id = v_original.booking_id
        and newer.transaction_type in ('payment','adjustment')
        and newer.status = 'confirmed'
        and (newer.created_at, newer.id) > (v_original.created_at, v_original.id)
  ) then
    return query select null::uuid, false, true, 'newer_transaction_exists'::text;
    return;
  end if;

  select * into v_pending
    from public.payment_transactions
    where reverses_transaction_id = v_original.id
      and transaction_type = 'reversal'
      and status = 'pending'
      and idempotency_key is distinct from btrim(p_idempotency_key)
    limit 1;
  if found then
    return query select v_pending.id, false, true, 'reversal_pending'::text;
    return;
  end if;

  v_placeholder := 'pending:' || btrim(p_idempotency_key);

  if v_existing.id is not null and v_existing.status = 'failed' then
    update public.payment_transactions
      set status = 'pending',
          provider_reference = v_placeholder,
          notes = nullif(btrim(coalesce(p_notes, '')), ''),
          effective_at = timezone('utc', now())
      where id = v_existing.id
      returning id into v_reversal_id;
    return query select v_reversal_id, false, false, null::text;
    return;
  end if;

  insert into public.payment_transactions (
    payment_request_id, booking_id, transaction_type, status,
    amount, currency, applied_amount, applied_currency, exchange_rate,
    method, provider, wallet_presentation, provider_reference,
    receipt_reference, gross_amount, fee_amount, net_amount,
    verified_source, effective_at, created_by, reverses_transaction_id,
    idempotency_key, projection_before, notes
  ) values (
    v_original.payment_request_id, v_original.booking_id, 'reversal', 'pending',
    v_original.amount, v_original.currency, v_original.applied_amount, v_original.applied_currency,
    null, v_original.method, 'credit_libanais', v_original.wallet_presentation,
    v_placeholder,
    null, v_original.gross_amount, 0, v_original.net_amount,
    'provider', timezone('utc', now()), p_staff_id, v_original.id,
    btrim(p_idempotency_key), '{}'::jsonb,
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_reversal_id;

  return query select v_reversal_id, false, false, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Confirm (provider accepted the void, or Business Center already shows it)
-- ---------------------------------------------------------------------------
create or replace function public.oraya_confirm_provider_authorization_reversal(
  p_reversal_transaction_id uuid,
  p_provider_reference text,
  p_verified_source text default 'provider'
)
returns table (
  reversal_transaction_id uuid,
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
  v_reversal public.payment_transactions%rowtype;
  v_original public.payment_transactions%rowtype;
  v_request public.payment_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_request_paid numeric(14,2);
  v_request_status text;
  v_booking_paid numeric(14,2);
  v_dup public.payment_transactions%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if nullif(btrim(p_provider_reference), '') is null then
    raise exception using errcode = 'P0001', message = 'provider_reference_required';
  end if;
  if btrim(p_provider_reference) like 'pending:%' then
    raise exception using errcode = 'P0001', message = 'invalid_provider_reference';
  end if;
  if p_verified_source is null or p_verified_source not in ('provider', 'operator') then
    raise exception using errcode = 'P0001', message = 'invalid_verified_source';
  end if;

  select * into v_reversal
    from public.payment_transactions
    where id = p_reversal_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'reversal_not_found';
  end if;
  if v_reversal.transaction_type <> 'reversal' then
    raise exception using errcode = 'P0001', message = 'not_a_reversal';
  end if;

  if v_reversal.status = 'confirmed'
     and v_reversal.provider_reference = btrim(p_provider_reference) then
    select * into v_request from public.payment_requests where id = v_reversal.payment_request_id;
    return query select
      v_reversal.id,
      case when v_request.id is null then null else v_request.status end,
      case when v_request.id is null then null else v_request.amount_paid end,
      case when v_reversal.booking_id is null then null
           else (select b.amount_paid from public.bookings b where b.id = v_reversal.booking_id) end,
      true;
    return;
  end if;

  if v_reversal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'reversal_not_pending';
  end if;

  select * into v_dup
    from public.payment_transactions
    where provider = 'credit_libanais'
      and provider_reference = btrim(p_provider_reference)
      and transaction_type = 'reversal'
      and status = 'confirmed'
      and id is distinct from v_reversal.id
    limit 1;
  if found then
    raise exception using errcode = 'P0001', message = 'provider_reference_replay';
  end if;

  select * into v_original
    from public.payment_transactions
    where id = v_reversal.reverses_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'transaction_not_found';
  end if;
  if v_original.status not in ('confirmed', 'reversed') then
    raise exception using errcode = 'P0001', message = 'transaction_not_voidable';
  end if;

  if v_reversal.payment_request_id is not null then
    select * into v_request from public.payment_requests
      where id = v_reversal.payment_request_id for update;
  end if;
  if v_reversal.booking_id is not null then
    select * into v_booking from public.bookings
      where id = v_reversal.booking_id for update;
  end if;

  update public.payment_transactions
    set status = 'confirmed',
        provider_reference = btrim(p_provider_reference),
        verified_source = p_verified_source,
        effective_at = v_now
    where id = v_reversal.id;

  update public.payment_transactions
    set status = 'reversed'
    where id = v_original.id
      and status = 'confirmed';

  -- The authorization never settled: the money Oraya projected was never
  -- received. Undo exactly what this payment projected, nothing else.
  if v_reversal.payment_request_id is not null then
    v_request_paid := greatest(round(coalesce(v_request.amount_paid, 0) - v_original.applied_amount, 2), 0);
    v_request_status := case
      when v_request.status in ('cancelled','expired') then v_request.status
      when v_request_paid = 0 then 'active'
      when v_request_paid >= v_request.amount then 'paid'
      else 'partially_paid'
    end;
    update public.payment_requests
      set amount_paid = v_request_paid,
          status = v_request_status,
          updated_at = v_now
      where id = v_request.id;
  else
    v_request_paid := null;
    v_request_status := null;
  end if;

  if v_reversal.booking_id is not null and v_original.projection_before ? 'amount_paid' then
    v_booking_paid := coalesce((v_original.projection_before ->> 'amount_paid')::numeric, 0);
    update public.bookings
      set amount_paid = v_booking_paid,
          amount_total = nullif(v_original.projection_before ->> 'amount_total', '')::numeric,
          amount_due = nullif(v_original.projection_before ->> 'amount_due', '')::numeric,
          payment_status = nullif(v_original.projection_before ->> 'payment_status', ''),
          payment_stage = nullif(v_original.projection_before ->> 'payment_stage', ''),
          payment_method = nullif(v_original.projection_before ->> 'payment_method', ''),
          payment_reference = nullif(v_original.projection_before ->> 'payment_reference', ''),
          payment_received_at = nullif(v_original.projection_before ->> 'payment_received_at', '')::timestamptz,
          payment_link_status = coalesce(
            nullif(v_original.projection_before ->> 'payment_link_status', ''),
            payment_link_status
          ),
          payment_last_at = v_now,
          payment_marked_by = v_reversal.created_by
      where id = v_booking.id;
  elsif v_reversal.booking_id is not null then
    v_booking_paid := v_booking.amount_paid;
  else
    v_booking_paid := null;
  end if;

  return query select v_reversal.id, v_request_status, v_request_paid, v_booking_paid, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fail (clean decline, or operator released the lock after checking BC)
-- ---------------------------------------------------------------------------
create or replace function public.oraya_fail_provider_authorization_reversal(
  p_reversal_transaction_id uuid,
  p_reason text default null
)
returns table (reversal_transaction_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reversal public.payment_transactions%rowtype;
begin
  select * into v_reversal
    from public.payment_transactions
    where id = p_reversal_transaction_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'reversal_not_found';
  end if;
  if v_reversal.transaction_type <> 'reversal' then
    raise exception using errcode = 'P0001', message = 'not_a_reversal';
  end if;
  if v_reversal.status = 'failed' then
    return query select v_reversal.id;
    return;
  end if;
  if v_reversal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'reversal_not_pending';
  end if;

  update public.payment_transactions
    set status = 'failed',
        notes = case
          when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
          when notes is null or notes = '' then btrim(p_reason)
          else notes || E'\n' || btrim(p_reason)
        end
    where id = v_reversal.id;

  return query select v_reversal.id;
end;
$$;

revoke all on function public.oraya_claim_provider_authorization_reversal(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.oraya_claim_provider_authorization_reversal(uuid,text,uuid,text)
  to service_role;

revoke all on function public.oraya_confirm_provider_authorization_reversal(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.oraya_confirm_provider_authorization_reversal(uuid,text,text)
  to service_role;

revoke all on function public.oraya_fail_provider_authorization_reversal(uuid,text)
  from public, anon, authenticated;
grant execute on function public.oraya_fail_provider_authorization_reversal(uuid,text)
  to service_role;
