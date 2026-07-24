-- Plan 4 Phase 1 (KNOWN_BUGS #15) — manual-first refunds.
--
-- Additive, human-run. Adds the NetCommerce Business Center refund/transaction
-- reference column to bookings so every recorded refund is traceable to the
-- provider-side operation the admin executed by hand.
--
-- The code TOLERATES the pre-migration state: while this column is missing,
-- the admin bookings PATCH route retries the refund record without it (the
-- reference is still preserved inside payment_notes), and logs a warning
-- telling you to run this file.
--
-- Preflight (optional): confirm the column does not already exist.
--   select column_name from information_schema.columns
--   where table_name = 'bookings' and column_name = 'refund_provider_reference';

alter table bookings
  add column if not exists refund_provider_reference text;
