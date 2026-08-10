-- Phase 16B hotfix: allow pending card-refund rows to settle or fail.
-- Safe to re-run.
--
-- Bug: payment_transactions_protect_facts treated notes / provider_reference /
-- verified_source / effective_at / projection_before as always immutable.
-- oraya_fail_provider_refund updates notes → blocked (Release refund lock fails).
-- oraya_confirm_provider_refund updates provider_reference etc → blocked
-- (Record refund fails with "Could not record that refund").
--
-- Status-only changes were already allowed. Pending refunds must be able to
-- move pending → confirmed|failed with their settlement fields.

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

  -- Re-claim of a previously failed refund (same idempotency key) may reset
  -- pending placeholder fields — only failed → pending on refund rows.
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
