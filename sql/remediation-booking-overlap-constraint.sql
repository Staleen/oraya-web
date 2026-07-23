-- Remediation 1.4 — DB backstop against double-booking races.
-- Additive, human-run. Two confirmed bookings for the same villa can never
-- hold overlapping [check_in, check_out) ranges once this is applied; the
-- application already checks availability first, this closes the
-- check-then-write race window.
--
-- ── PREFLIGHT (run first; must return 0 rows before adding the constraint) ──
-- Historical confirmed overlaps would make ALTER TABLE fail. Resolve any rows
-- this returns (cancel/adjust one of each pair) before running the DDL below.
--
--   select a.id as booking_a, b.id as booking_b, a.villa,
--          a.check_in as a_in, a.check_out as a_out,
--          b.check_in as b_in, b.check_out as b_out
--   from bookings a
--   join bookings b
--     on a.villa = b.villa
--    and a.id < b.id
--    and a.status = 'confirmed'
--    and b.status = 'confirmed'
--    and a.check_in < b.check_out
--    and a.check_out > b.check_in;
--
-- ── DDL (run after the preflight returns 0 rows) ────────────────────────────

create extension if not exists btree_gist;

alter table bookings
  add constraint bookings_no_confirmed_overlap
  exclude using gist (
    villa with =,
    daterange(check_in, check_out) with &&
  )
  where (status = 'confirmed');

-- Notes:
-- * daterange(check_in, check_out) is half-open — a check-out day equal to the
--   next stay's check-in day does NOT conflict (matches app semantics).
-- * Only rows with status = 'confirmed' participate; pending/cancelled rows
--   are unconstrained.
-- * On violation Postgres raises SQLSTATE 23P01 (exclusion_violation); the
--   application maps this to the "dates no longer available" response and the
--   booking stays pending (lib/db-errors.ts).
