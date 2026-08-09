-- ============================================================================
-- Phase 16D Stage A — Access-credential magazine foundation (DARK)
-- ============================================================================
-- HUMAN-RUN migration. Run once in the Supabase SQL editor after review.
-- This file is committed as reviewable text only — Stage A ships NO runtime
-- consumer, NO UI, NO API route, and NO Aqara integration. Nothing reads or
-- writes these tables until Stage B is separately approved.
--
-- Business model (approved 2026-08-10 Stage A prompt):
--   Each property has an Aqara A100 front-door lock and a U100 gate lock.
--   Oraya generates each six-digit PIN and stores it encrypted; David manually
--   copies the SAME PIN into both devices (A100: scheduled PIN directly;
--   U100: scheduled user + scheduled PIN). A credential becomes part of the
--   available magazine only after David confirms installation on BOTH locks
--   separately. A disclosed PIN is consumed permanently. Checkout,
--   cancellation after disclosure, or reported failure quarantines the PIN
--   until David confirms deletion from both locks; only then is it destroyed
--   and its decryptable ciphertext erased. Aqara's public API cannot create,
--   list, modify, or delete these PINs — software state is NEVER proof of
--   physical lock state, which is why every load-bearing state requires an
--   explicit per-lock human confirmation (timestamp + actor pair).
--
-- Design lineage: mirrors the proven Phase 16B ledger posture
-- (sql/phase-16b-f1-payment-ledger.sql, sql/plan3-payment-attempts.sql):
-- RLS enabled with NO policies, privileges revoked from anon/authenticated,
-- service_role-only grants with NO delete, immutable audit rows via a
-- raising trigger, invariants as CHECK constraints and partial unique
-- indexes, pinned search_path on every function.
--
-- Deliberate differences from the payment-ledger patterns (six-digit
-- physical credentials are not 256-bit random tokens):
--   1. NO plaintext-equivalent lookup hash. payment_requests may use an
--      unsalted SHA-256 lookup hash because its token has 256 bits of
--      entropy; a six-digit PIN has ~20 bits and an unsalted hash would be
--      trivially brute-forceable. This table stores a KEYED HMAC fingerprint
--      (pin_fingerprint + the pin_fingerprint_key_id of the versioned
--      fingerprint keyring entry that produced it — see
--      lib/access/pin-vault.ts) used ONLY for duplicate prevention.
--      Lookups are by id/slot_label, never by PIN.
--   2. Ciphertext is ERASED at destruction. Payment-request ciphertext lives
--      for the row's life; a destroyed physical credential must not remain
--      decryptable forever, so `destroyed` REQUIRES pin_ciphertext IS NULL
--      (CHECK constraint below) while the fingerprint row is retained
--      forever so the numeric PIN can never be generated again (duplicate
--      detection recomputes candidate fingerprints under EVERY retained
--      fingerprint-key version and compares against the stored values).
--   3. The credential row itself is a state machine (a physical object's
--      lifecycle), so instead of freezing all columns like
--      payment_transactions, a BEFORE trigger enforces the exact allowed
--      transition graph, complete state/fact consistency, write-once
--      confirmation pairs, and DB-verified replacement lineage.
--   4. The audit ledger cannot be bypassed: an AFTER trigger transactionally
--      inserts the immutable audit event for every lifecycle change and
--      per-lock confirmation, so even a direct service-role UPDATE produces
--      its audit row in the same transaction. Free text is banned — the only
--      variable field is an allow-listed reason code, so no audit surface
--      can accidentally persist a PIN.
--
-- Stage C (NOT in this migration, listed for review context only) will add
-- the atomic allocation RPC using the proven devices:
--   pg_advisory_xact_lock(hashtextextended(booking_id::text, 0)) to
--   serialize per-booking issuance, FOR UPDATE SKIP LOCKED to pick one
--   available non-emergency row, and the partial unique indexes below as the
--   duplicate-allocation backstop. Replacement counting / stop-and-escalate
--   policy lives in that RPC once David approves the limits.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. The magazine: one row per physical PIN slot in a property's magazine
-- ----------------------------------------------------------------------------

create table if not exists public.access_credentials (
  id uuid primary key default gen_random_uuid(),

  -- Property isolation: magazines are per-property by construction. The
  -- values match bookings.villa exactly so the later allocation can verify
  -- the pairing at the database level (guard trigger below).
  property text not null
    check (property in ('Villa Mechmech', 'Villa Byblos')),

  -- Opaque labels: what lists/UIs display instead of the PIN. slot_label is
  -- the per-property handle (e.g. 'M-014'); batch_label groups a loading
  -- batch (e.g. 'B1-2026-08') for the "generate only the replacement
  -- quantity" workflow.
  slot_label text not null,
  batch_label text not null,

  -- Credential class: 5 of the target 70 per property are emergency-rescue
  -- stock. Normal allocation must never consume these (enforced by the
  -- Stage C RPC; the flag is the queryable boundary). The approved backup
  -- path MAY explicitly consume one if policy requires it — that explicit
  -- override lives in the Stage C RPC signature, never in a default path.
  is_emergency boolean not null default false,

  -- Lifecycle. 'reserved' is intentionally OMITTED: Stage C allocation is a
  -- single-transaction available -> disclosed CAS (advisory lock + row lock),
  -- so a two-phase hold state would only add invalid paths.
  status text not null default 'installing'
    check (status in ('installing','available','disclosed','quarantined','deletion_pending','destroyed')),

  -- Encrypted reversible PIN while the credential is alive, and the keyed
  -- historical fingerprint (with the fingerprint-keyring version that
  -- produced it) that outlives it. Envelope format
  -- apv1.<key-id>.<iv>.<tag>.<ciphertext> — see lib/access/pin-vault.ts.
  -- The plaintext PIN never appears in any column, log, or response.
  pin_ciphertext text,
  pin_fingerprint text not null,
  pin_fingerprint_key_id text not null,

  -- Dual-lock installation confirmation (A100 front door / U100 gate).
  -- Each is a write-once human attestation recorded as a timestamp + actor
  -- PAIR, and recorded separately because the two devices have different
  -- manual workflows (A100: scheduled PIN directly; U100: scheduled user +
  -- PIN).
  installed_front_at timestamptz,
  installed_front_by uuid,
  installed_gate_at timestamptz,
  installed_gate_by uuid,

  -- Booking linkage for later stages (set-once, at disclosure only).
  booking_id uuid references public.bookings (id),
  disclosure_reason text
    check (disclosure_reason in ('primary','backup','replacement')),
  replacement_of uuid references public.access_credentials (id),
  disclosed_at timestamptz,
  disclosed_by uuid,

  -- Quarantine (allow-listed reason codes only — never free text).
  quarantined_at timestamptz,
  quarantine_reason text
    check (quarantine_reason in (
      'guest_checkout',
      'cancellation_after_disclosure',
      'reported_failure',
      'loading_abandoned',
      'suspected_compromise',
      'inventory_correction'
    )),

  -- Dual-lock deletion confirmation (timestamp + actor pairs), then
  -- destruction.
  deleted_front_at timestamptz,
  deleted_front_by uuid,
  deleted_gate_at timestamptz,
  deleted_gate_by uuid,
  destroyed_at timestamptz,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Opaque handles are unique per property; fingerprints are unique GLOBALLY
  -- (different properties never share a numeric PIN, and a destroyed PIN can
  -- never be generated again because its fingerprint row is retained).
  constraint access_credentials_slot_unique unique (property, slot_label),
  constraint access_credentials_fingerprint_unique unique (pin_fingerprint),

  -- Ciphertext exists exactly while the credential is not destroyed:
  -- erasure-at-destruction is an invariant, not a UI convention.
  constraint access_credentials_ciphertext_lifecycle
    check ((status = 'destroyed') = (pin_ciphertext is null)),

  -- Every confirmation is a complete timestamp + actor pair or absent.
  constraint access_credentials_install_front_pair
    check ((installed_front_at is null) = (installed_front_by is null)),
  constraint access_credentials_install_gate_pair
    check ((installed_gate_at is null) = (installed_gate_by is null)),
  constraint access_credentials_deletion_front_pair
    check ((deleted_front_at is null) = (deleted_front_by is null)),
  constraint access_credentials_deletion_gate_pair
    check ((deleted_gate_at is null) = (deleted_gate_by is null)),

  -- A credential installed on only one lock — or confirmed without actor
  -- attribution — can NEVER be available.
  constraint access_credentials_available_requires_both_locks
    check (status <> 'available'
           or (installed_front_at is not null and installed_front_by is not null
               and installed_gate_at is not null and installed_gate_by is not null)),

  -- Disclosure facts are all-or-none as a group ...
  constraint access_credentials_disclosure_all_or_none
    check (
      (booking_id is not null and disclosure_reason is not null
       and disclosed_at is not null and disclosed_by is not null)
      or (booking_id is null and disclosure_reason is null
          and disclosed_at is null and disclosed_by is null)
    ),
  -- ... absent before disclosure ever happens ...
  constraint access_credentials_no_disclosure_before_disclosed
    check (status not in ('installing','available') or booking_id is null),
  -- ... and complete from disclosure onward.
  constraint access_credentials_disclosure_fields
    check (status <> 'disclosed'
           or (booking_id is not null and disclosure_reason is not null
               and disclosed_at is not null and disclosed_by is not null)),

  -- Quarantine facts exist exactly from quarantine onward, as a pair.
  constraint access_credentials_quarantine_pair
    check ((quarantined_at is null) = (quarantine_reason is null)),
  constraint access_credentials_quarantine_fact_state
    check ((status in ('quarantined','deletion_pending','destroyed'))
           = (quarantined_at is not null)),

  -- Deletion confirmations are valid only from quarantine onward, and only
  -- for locks that were actually installed.
  constraint access_credentials_no_deletion_before_quarantine
    check (status in ('quarantined','deletion_pending','destroyed')
           or (deleted_front_at is null and deleted_gate_at is null)),
  constraint access_credentials_deletion_requires_install
    check ((deleted_front_at is null or installed_front_at is not null)
           and (deleted_gate_at is null or installed_gate_at is not null)),

  -- Destroyed requires the destruction timestamp exactly then, and complete
  -- deletion pairs for every lock that was actually installed (a credential
  -- abandoned before touching a lock needs no deletion confirmation for that
  -- lock).
  constraint access_credentials_destroyed_at_state
    check ((status = 'destroyed') = (destroyed_at is not null)),
  constraint access_credentials_destroyed_requires_deletions
    check (status <> 'destroyed'
           or ((installed_front_at is null
                or (deleted_front_at is not null and deleted_front_by is not null))
               and (installed_gate_at is null
                    or (deleted_gate_at is not null and deleted_gate_by is not null)))),

  -- Reason/lineage discipline: a primary stands alone; a backup or
  -- replacement must record which credential it supersedes. (Cross-row
  -- lineage validity is verified by the guard trigger.)
  constraint access_credentials_replacement_lineage
    check (
      (disclosure_reason is null and replacement_of is null)
      or (disclosure_reason = 'primary' and replacement_of is null)
      or (disclosure_reason in ('backup','replacement') and replacement_of is not null)
    ),
  constraint access_credentials_replacement_not_self
    check (replacement_of is null or replacement_of <> id)
);

-- Duplicate-allocation backstops (DB-level, independent of any RPC bug):
-- at most one primary and at most one backup ever exist per booking.
-- Replacements are counted/limited by the Stage C RPC policy.
create unique index if not exists access_credentials_one_primary_per_booking
  on public.access_credentials (booking_id)
  where booking_id is not null and disclosure_reason = 'primary';

create unique index if not exists access_credentials_one_backup_per_booking
  on public.access_credentials (booking_id)
  where booking_id is not null and disclosure_reason = 'backup';

-- Magazine queries (counts by property/status; never the PIN).
create index if not exists access_credentials_property_status_idx
  on public.access_credentials (property, status);

-- ----------------------------------------------------------------------------
-- 2. State-machine + immutability guard on the credential row
-- ----------------------------------------------------------------------------
-- Enforces at the database level (mirrored in lib/access/pin-lifecycle.ts):
--   * inserts start life as 'installing' with no confirmation, disclosure,
--     quarantine, or deletion facts;
--   * the exact allowed transition graph — in particular, disclosed can
--     NEVER return to available (disclosure is permanent consumption) and
--     nothing leaves destroyed;
--   * identity columns are frozen; confirmation pairs are write-once and
--     may only be recorded in their proper state (the *_by half can never
--     bypass a state guard because the pair CHECKs bind it to its
--     timestamp);
--   * pin_ciphertext is write-locked: the only permitted change is erasure
--     (-> NULL) at the destroyed transition;
--   * booking linkage is set-once, only at available -> disclosed, the
--     booking's villa must match the credential's property, and replacement
--     lineage is verified against the predecessor row (same property, same
--     booking, consumed/quarantined state, valid primary/backup/replacement
--     relationship, no self-reference).

create or replace function public.oraya_access_credential_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_villa text;
  v_pred public.access_credentials%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'installing' then
      raise exception 'access_credential_must_start_installing';
    end if;
    if new.installed_front_at is not null or new.installed_front_by is not null
       or new.installed_gate_at is not null or new.installed_gate_by is not null
       or new.booking_id is not null or new.disclosure_reason is not null
       or new.replacement_of is not null or new.disclosed_at is not null
       or new.disclosed_by is not null or new.quarantined_at is not null
       or new.quarantine_reason is not null
       or new.deleted_front_at is not null or new.deleted_front_by is not null
       or new.deleted_gate_at is not null or new.deleted_gate_by is not null
       or new.destroyed_at is not null then
      raise exception 'access_credential_insert_carries_lifecycle_facts';
    end if;
    return new;
  end if;

  -- Frozen identity columns.
  if new.property is distinct from old.property
     or new.slot_label is distinct from old.slot_label
     or new.batch_label is distinct from old.batch_label
     or new.is_emergency is distinct from old.is_emergency
     or new.pin_fingerprint is distinct from old.pin_fingerprint
     or new.pin_fingerprint_key_id is distinct from old.pin_fingerprint_key_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'access_credential_identity_is_immutable';
  end if;

  -- Allowed transition graph (same-status updates are permitted so that
  -- write-once facts can be recorded within a state).
  if new.status is distinct from old.status then
    if not (
      (old.status = 'installing' and new.status in ('available','quarantined'))
      or (old.status = 'available' and new.status in ('disclosed','quarantined'))
      or (old.status = 'disclosed' and new.status = 'quarantined')
      or (old.status = 'quarantined' and new.status = 'deletion_pending')
      or (old.status = 'deletion_pending' and new.status = 'destroyed')
    ) then
      raise exception 'access_credential_transition_not_allowed: % -> %',
        old.status, new.status;
    end if;
  end if;

  -- Ciphertext is write-locked; the only permitted change is erasure at
  -- destruction (the CHECK constraint forces it to happen then).
  if new.pin_ciphertext is distinct from old.pin_ciphertext then
    if not (new.pin_ciphertext is null and new.status = 'destroyed') then
      raise exception 'access_credential_ciphertext_is_write_locked';
    end if;
  end if;

  -- Write-once facts: once recorded, never changed or cleared.
  if (old.installed_front_at is not null and new.installed_front_at is distinct from old.installed_front_at)
     or (old.installed_front_by is not null and new.installed_front_by is distinct from old.installed_front_by)
     or (old.installed_gate_at is not null and new.installed_gate_at is distinct from old.installed_gate_at)
     or (old.installed_gate_by is not null and new.installed_gate_by is distinct from old.installed_gate_by)
     or (old.booking_id is not null and new.booking_id is distinct from old.booking_id)
     or (old.disclosure_reason is not null and new.disclosure_reason is distinct from old.disclosure_reason)
     or (old.replacement_of is not null and new.replacement_of is distinct from old.replacement_of)
     or (old.disclosed_at is not null and new.disclosed_at is distinct from old.disclosed_at)
     or (old.disclosed_by is not null and new.disclosed_by is distinct from old.disclosed_by)
     or (old.quarantined_at is not null and new.quarantined_at is distinct from old.quarantined_at)
     or (old.quarantine_reason is not null and new.quarantine_reason is distinct from old.quarantine_reason)
     or (old.deleted_front_at is not null and new.deleted_front_at is distinct from old.deleted_front_at)
     or (old.deleted_front_by is not null and new.deleted_front_by is distinct from old.deleted_front_by)
     or (old.deleted_gate_at is not null and new.deleted_gate_at is distinct from old.deleted_gate_at)
     or (old.deleted_gate_by is not null and new.deleted_gate_by is distinct from old.deleted_gate_by)
     or (old.destroyed_at is not null and new.destroyed_at is distinct from old.destroyed_at) then
    raise exception 'access_credential_facts_are_write_once';
  end if;

  -- Installation confirmations may only be recorded while loading. (The
  -- pair CHECKs bind each *_by to its *_at, so the actor half cannot be
  -- written through any other path.)
  if ((new.installed_front_at is not null and old.installed_front_at is null)
      or (new.installed_gate_at is not null and old.installed_gate_at is null))
     and old.status <> 'installing' then
    raise exception 'access_credential_install_confirmation_requires_installing';
  end if;

  -- Deletion confirmations may only be recorded once the credential is
  -- quarantined or already in the deletion workflow.
  if ((new.deleted_front_at is not null and old.deleted_front_at is null)
      or (new.deleted_gate_at is not null and old.deleted_gate_at is null))
     and old.status not in ('quarantined','deletion_pending') then
    raise exception 'access_credential_deletion_confirmation_requires_quarantine';
  end if;

  -- Booking linkage: set-once, only at the available -> disclosed
  -- transition, and the booking's villa must match the property.
  if new.booking_id is not null and old.booking_id is null then
    if not (old.status = 'available' and new.status = 'disclosed') then
      raise exception 'access_credential_disclosure_requires_available';
    end if;
    select villa into v_villa from public.bookings where id = new.booking_id;
    if v_villa is null then
      raise exception 'access_credential_booking_not_found';
    end if;
    if v_villa is distinct from new.property then
      raise exception 'access_credential_property_mismatch';
    end if;

    -- Replacement lineage (backup/replacement only — the CHECKs already
    -- force replacement_of null for a primary and non-null otherwise).
    if new.replacement_of is not null then
      if new.replacement_of = new.id then
        raise exception 'access_credential_replacement_self_reference';
      end if;
      select * into v_pred from public.access_credentials
        where id = new.replacement_of;
      if v_pred.id is null then
        raise exception 'access_credential_replacement_predecessor_not_found';
      end if;
      if v_pred.property is distinct from new.property then
        raise exception 'access_credential_replacement_property_mismatch';
      end if;
      if v_pred.booking_id is distinct from new.booking_id then
        raise exception 'access_credential_replacement_booking_mismatch';
      end if;
      if v_pred.status not in ('quarantined','deletion_pending','destroyed') then
        raise exception 'access_credential_replacement_predecessor_not_consumed';
      end if;
      if new.disclosure_reason = 'backup'
         and v_pred.disclosure_reason is distinct from 'primary' then
        raise exception 'access_credential_replacement_relationship_invalid';
      end if;
      if new.disclosure_reason = 'replacement'
         and v_pred.disclosure_reason not in ('primary','backup','replacement') then
        raise exception 'access_credential_replacement_relationship_invalid';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists access_credentials_guard on public.access_credentials;
create trigger access_credentials_guard
  before insert or update on public.access_credentials
  for each row execute function public.oraya_access_credential_guard();

-- ----------------------------------------------------------------------------
-- 3. Immutable audit history: one row per lifecycle event, forever
-- ----------------------------------------------------------------------------
-- The ONLY variable field is an allow-listed reason code — no free text — so
-- no audit surface exists that could accidentally persist a PIN.
-- 'pin_revealed_for_loading' is the interrupted-loading recovery boundary:
-- Stage B's loading screen may re-reveal an 'installing' credential's PIN
-- (its ciphertext is still decryptable by design), but every reveal MUST
-- append one of these rows — an unaudited reveal path must never exist.
-- (Reveals are reads, not row mutations, so they are the one event class the
-- Stage B code inserts explicitly; every MUTATION event below is inserted
-- transactionally by trigger and cannot be bypassed.)

create table if not exists public.access_credential_events (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.access_credentials (id),
  booking_id uuid,
  event_type text not null
    check (event_type in (
      'generated',
      'pin_revealed_for_loading',
      'install_confirmed_front',
      'install_confirmed_gate',
      'became_available',
      'disclosed',
      'quarantined',
      'deletion_started',
      'deletion_confirmed_front',
      'deletion_confirmed_gate',
      'destroyed',
      'physical_audit_confirmed'
    )),
  actor uuid,          -- staff id; null = system
  reason_code text
    check (reason_code in (
      'guest_checkout',
      'cancellation_after_disclosure',
      'reported_failure',
      'loading_abandoned',
      'suspected_compromise',
      'inventory_correction'
    )),
  created_at timestamptz not null default now()
);

create index if not exists access_credential_events_credential_idx
  on public.access_credential_events (credential_id, created_at);

create or replace function public.oraya_protect_access_credential_events()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'access_credential_events_are_immutable';
end;
$$;

drop trigger if exists access_credential_events_protect on public.access_credential_events;
create trigger access_credential_events_protect
  before update or delete on public.access_credential_events
  for each row execute function public.oraya_protect_access_credential_events();

-- ----------------------------------------------------------------------------
-- 4. Transactional audit: every mutation writes its immutable event
-- ----------------------------------------------------------------------------
-- AFTER trigger on the credential row. Because it is a trigger, a direct
-- service-role UPDATE cannot bypass the audit ledger — the event insert is
-- part of the same transaction, and the events table's own trigger makes the
-- rows immutable afterwards.

create or replace function public.oraya_access_credential_audit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.access_credential_events (credential_id, event_type, actor)
      values (new.id, 'generated', new.created_by);
    return null;
  end if;

  if new.installed_front_at is not null and old.installed_front_at is null then
    insert into public.access_credential_events (credential_id, event_type, actor)
      values (new.id, 'install_confirmed_front', new.installed_front_by);
  end if;
  if new.installed_gate_at is not null and old.installed_gate_at is null then
    insert into public.access_credential_events (credential_id, event_type, actor)
      values (new.id, 'install_confirmed_gate', new.installed_gate_by);
  end if;
  if new.deleted_front_at is not null and old.deleted_front_at is null then
    insert into public.access_credential_events (credential_id, booking_id, event_type, actor)
      values (new.id, new.booking_id, 'deletion_confirmed_front', new.deleted_front_by);
  end if;
  if new.deleted_gate_at is not null and old.deleted_gate_at is null then
    insert into public.access_credential_events (credential_id, booking_id, event_type, actor)
      values (new.id, new.booking_id, 'deletion_confirmed_gate', new.deleted_gate_by);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'available' then
      insert into public.access_credential_events (credential_id, event_type, actor)
        values (new.id, 'became_available', new.installed_gate_by);
    elsif new.status = 'disclosed' then
      insert into public.access_credential_events (credential_id, booking_id, event_type, actor)
        values (new.id, new.booking_id, 'disclosed', new.disclosed_by);
    elsif new.status = 'quarantined' then
      insert into public.access_credential_events (credential_id, booking_id, event_type, actor, reason_code)
        values (new.id, new.booking_id, 'quarantined', null, new.quarantine_reason);
    elsif new.status = 'deletion_pending' then
      insert into public.access_credential_events (credential_id, booking_id, event_type)
        values (new.id, new.booking_id, 'deletion_started');
    elsif new.status = 'destroyed' then
      insert into public.access_credential_events (credential_id, booking_id, event_type)
        values (new.id, new.booking_id, 'destroyed');
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists access_credentials_audit on public.access_credentials;
create trigger access_credentials_audit
  after insert or update on public.access_credentials
  for each row execute function public.oraya_access_credential_audit();

-- ----------------------------------------------------------------------------
-- 5. RLS + grants: server-only, service-role-only, no deletes anywhere
-- ----------------------------------------------------------------------------

alter table public.access_credentials enable row level security;
alter table public.access_credential_events enable row level security;

revoke all on table public.access_credentials from public, anon, authenticated;
revoke all on table public.access_credential_events from public, anon, authenticated;

-- No delete grant: credentials are destroyed via the lifecycle (fingerprint
-- retained forever), never removed. Events are append-only.
grant select, insert, update on table public.access_credentials to service_role;
grant select, insert on table public.access_credential_events to service_role;

revoke all on function public.oraya_access_credential_guard() from public, anon, authenticated;
revoke all on function public.oraya_access_credential_audit() from public, anon, authenticated;
revoke all on function public.oraya_protect_access_credential_events() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Operator runbook (reference only — no statement below executes anything)
-- ----------------------------------------------------------------------------
-- Loading (Stage B UI, one credential at a time — never a plaintext list):
--   insert row (status 'installing', encrypted PIN + fingerprint + key id)
--     -> reveal once -> David installs on A100
--       -> update installed_front_at + installed_front_by (pair)
--     -> David installs on U100
--       -> update installed_gate_at + installed_gate_by (pair)
--     -> update status = 'available'.
--   Every step's audit event is written by trigger automatically.
--   Interrupted session: the row simply stays 'installing' — it can never
--   silently become available (CHECK requires both complete pairs). Either
--   resume via an audited re-reveal (event 'pin_revealed_for_loading',
--   inserted by the Stage B code), or abandon: status -> 'quarantined'
--   (quarantine_reason 'loading_abandoned') -> 'deletion_pending'
--   (confirming deletion pairs for whichever locks were actually installed)
--   -> 'destroyed'.
-- Destruction (always):
--   update ... set status = 'destroyed', destroyed_at = now(),
--     pin_ciphertext = null
--   where id = ... and status = 'deletion_pending';
--   (The ciphertext MUST be nulled in the same statement — the
--   access_credentials_ciphertext_lifecycle CHECK refuses anything else.)
-- Verification queries (safe — never expose the PIN):
--   select property, status, count(*) from public.access_credentials
--     group by 1, 2 order by 1, 2;
--   select event_type, count(*) from public.access_credential_events
--     group by 1 order by 1;
