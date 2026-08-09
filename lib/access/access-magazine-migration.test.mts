import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Static assertions over sql/phase-16d-access-magazine.sql. The migration is
 * HUMAN-RUN and unapplied in Stage A, so these tests pin the reviewable text
 * to the approved security posture: RLS with no client policies, no delete
 * grants, immutable audit events, lifecycle CHECKs, ciphertext erasure at
 * destruction, and no plaintext PIN column anywhere.
 */
const sql = readFileSync(
  new URL("../../sql/phase-16d-access-magazine.sql", import.meta.url),
  "utf8"
);
const normalized = sql.toLowerCase();

test("RLS enabled on both tables with zero client policies", () => {
  assert.ok(normalized.includes("alter table public.access_credentials enable row level security"));
  assert.ok(normalized.includes("alter table public.access_credential_events enable row level security"));
  assert.equal(normalized.includes("create policy"), false, "no anon/authenticated policy may exist");
});

test("privileges revoked from public/anon/authenticated on tables and functions", () => {
  assert.ok(normalized.includes("revoke all on table public.access_credentials from public, anon, authenticated"));
  assert.ok(normalized.includes("revoke all on table public.access_credential_events from public, anon, authenticated"));
  assert.ok(normalized.includes("revoke all on function public.oraya_access_credential_guard() from public, anon, authenticated"));
  assert.ok(normalized.includes("revoke all on function public.oraya_access_credential_audit() from public, anon, authenticated"));
  assert.ok(normalized.includes("revoke all on function public.oraya_protect_access_credential_events() from public, anon, authenticated"));
});

test("service_role grants exclude delete everywhere; events exclude update too", () => {
  assert.ok(normalized.includes("grant select, insert, update on table public.access_credentials to service_role"));
  assert.ok(normalized.includes("grant select, insert on table public.access_credential_events to service_role"));
  const grantStatements = normalized.match(/^\s*grant\s[^;]*;/gm) ?? [];
  assert.ok(grantStatements.length >= 2, "expected explicit grant statements");
  for (const statement of grantStatements) {
    assert.equal(statement.includes("delete"), false, `no delete grant may exist: ${statement.trim()}`);
  }
});

test("audit events are immutable via a raising trigger on update and delete", () => {
  assert.ok(normalized.includes("access_credential_events_are_immutable"));
  assert.ok(normalized.includes("before update or delete on public.access_credential_events"));
});

test("lifecycle CHECK constraints: dual-lock availability, dual-lock destruction, disclosure completeness", () => {
  assert.ok(normalized.includes("access_credentials_available_requires_both_locks"));
  assert.ok(normalized.includes("access_credentials_destroyed_requires_deletions"));
  assert.ok(normalized.includes("access_credentials_deletion_requires_install"));
  assert.ok(normalized.includes("access_credentials_disclosure_fields"));
  assert.ok(normalized.includes("access_credentials_replacement_lineage"));
});

test("confirmation timestamp + actor pair CHECKs exist for all four confirmations, and available/destroyed demand complete pairs", () => {
  assert.ok(normalized.includes("access_credentials_install_front_pair"));
  assert.ok(normalized.includes("access_credentials_install_gate_pair"));
  assert.ok(normalized.includes("access_credentials_deletion_front_pair"));
  assert.ok(normalized.includes("access_credentials_deletion_gate_pair"));
  // available demands actor attribution, not just timestamps.
  assert.ok(normalized.includes("installed_front_by is not null\n               and installed_gate_at is not null and installed_gate_by is not null"));
  // destroyed demands complete deletion pairs per installed lock.
  assert.ok(normalized.includes("deleted_front_at is not null and deleted_front_by is not null"));
  assert.ok(normalized.includes("deleted_gate_at is not null and deleted_gate_by is not null"));
});

test("state/fact consistency: disclosure, quarantine, deletion, and destruction facts bound to their states", () => {
  assert.ok(normalized.includes("access_credentials_disclosure_all_or_none"));
  assert.ok(normalized.includes("access_credentials_no_disclosure_before_disclosed"));
  assert.ok(normalized.includes("access_credentials_quarantine_pair"));
  assert.ok(normalized.includes("access_credentials_quarantine_fact_state"));
  assert.ok(normalized.includes("access_credentials_no_deletion_before_quarantine"));
  assert.ok(normalized.includes("access_credentials_destroyed_at_state"));
});

test("replacement lineage is DB-verified against the predecessor row", () => {
  assert.ok(normalized.includes("access_credentials_replacement_not_self"));
  assert.ok(normalized.includes("access_credential_replacement_self_reference"));
  assert.ok(normalized.includes("access_credential_replacement_predecessor_not_found"));
  assert.ok(normalized.includes("access_credential_replacement_property_mismatch"));
  assert.ok(normalized.includes("access_credential_replacement_booking_mismatch"));
  assert.ok(normalized.includes("access_credential_replacement_predecessor_not_consumed"));
  assert.ok(normalized.includes("access_credential_replacement_relationship_invalid"));
});

test("transactional audit: an AFTER trigger writes the immutable event for every mutation", () => {
  assert.ok(normalized.includes("oraya_access_credential_audit"));
  assert.ok(normalized.includes("after insert or update on public.access_credentials"));
  for (const eventType of [
    "'generated'",
    "'install_confirmed_front'",
    "'install_confirmed_gate'",
    "'became_available'",
    "'disclosed'",
    "'quarantined'",
    "'deletion_started'",
    "'deletion_confirmed_front'",
    "'deletion_confirmed_gate'",
    "'destroyed'",
  ]) {
    const occurrences = normalized.split(eventType).length - 1;
    assert.ok(occurrences >= 2, `${eventType} must appear in both the allow-list and the audit trigger`);
  }
});

test("reason codes are allow-listed; no free-text reason surface exists", () => {
  assert.ok(normalized.includes("reason_code text"));
  assert.equal(/\breason\s+text\b/.test(normalized), false, "no free-text reason column");
  assert.equal(normalized.includes("'note'"), false, "no generic note event");
  for (const code of [
    "'guest_checkout'",
    "'cancellation_after_disclosure'",
    "'reported_failure'",
    "'loading_abandoned'",
    "'suspected_compromise'",
    "'inventory_correction'",
  ]) {
    const occurrences = normalized.split(code).length - 1;
    assert.ok(occurrences >= 2, `${code} must be allow-listed on both quarantine_reason and reason_code`);
  }
});

test("ciphertext erasure at destruction is a CHECK, and ciphertext is trigger-write-locked", () => {
  assert.ok(normalized.includes("access_credentials_ciphertext_lifecycle"));
  assert.ok(normalized.includes("check ((status = 'destroyed') = (pin_ciphertext is null))"));
  assert.ok(normalized.includes("access_credential_ciphertext_is_write_locked"));
});

test("transition graph and write-once facts are trigger-enforced with pinned search_path", () => {
  assert.ok(normalized.includes("access_credential_transition_not_allowed"));
  assert.ok(normalized.includes("access_credential_facts_are_write_once"));
  assert.ok(normalized.includes("access_credential_must_start_installing"));
  assert.ok(normalized.includes("access_credential_property_mismatch"));
  const pinnedCount = normalized.split("set search_path = public, pg_temp").length - 1;
  assert.equal(pinnedCount, 3, "every function pins search_path");
});

test("duplicate prevention: global fingerprint uniqueness, per-property slots, per-booking primary/backup backstops", () => {
  assert.ok(normalized.includes("access_credentials_fingerprint_unique unique (pin_fingerprint)"));
  assert.ok(normalized.includes("access_credentials_slot_unique unique (property, slot_label)"));
  assert.ok(normalized.includes("access_credentials_one_primary_per_booking"));
  assert.ok(normalized.includes("access_credentials_one_backup_per_booking"));
  assert.ok(normalized.includes("disclosure_reason = 'primary'"));
  assert.ok(normalized.includes("disclosure_reason = 'backup'"));
});

test("no plaintext PIN storage: only ciphertext and versioned keyed fingerprint columns exist", () => {
  assert.ok(normalized.includes("pin_ciphertext text"));
  assert.ok(normalized.includes("pin_fingerprint text not null"));
  assert.ok(normalized.includes("pin_fingerprint_key_id text not null"));
  assert.equal(/\bpin\s+text\b/.test(normalized), false, "no bare `pin` column");
  assert.equal(normalized.includes("pin_plain"), false);
});

test("property isolation and booking-villa match are explicit", () => {
  assert.ok(normalized.includes("check (property in ('villa mechmech', 'villa byblos'))"));
  assert.ok(normalized.includes("access_credential_booking_not_found"));
});

test("migration never executes destructive statements against existing tables", () => {
  assert.equal(/\bdrop\s+table\b/.test(normalized), false);
  assert.equal(/\balter\s+table\s+public\.(bookings|settings|members|addons|payment_)/.test(normalized), false);
  // The only drops are the idempotent trigger re-creation pairs.
  const dropStatements = normalized.match(/^\s*drop\s+\S+/gm) ?? [];
  for (const statement of dropStatements) {
    assert.ok(statement.includes("drop trigger"), `unexpected drop: ${statement.trim()}`);
  }
});
