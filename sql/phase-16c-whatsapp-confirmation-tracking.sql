-- Phase 16C — WhatsApp confirmed-stay dispatch tracking (additive, run once in Supabase SQL editor)
-- Purpose: durable at-most-once idempotency claim for the automatic WhatsApp
-- Arrival Guide webhook dispatch. The dispatcher atomically claims this column
-- (update ... where status = 'confirmed' and whatsapp_confirmation_sent_at is null)
-- immediately before its single outbound POST; a non-null value means the
-- webhook for this booking was already attempted and must not be re-sent.
-- Nullable, no default, no backfill — existing rows are unaffected.

alter table bookings
  add column if not exists whatsapp_confirmation_sent_at timestamptz;
