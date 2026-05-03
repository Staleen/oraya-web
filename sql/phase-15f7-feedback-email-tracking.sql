-- Phase 15F.7 — Manual feedback email tracking (additive, run once in Supabase SQL editor)
-- Purpose: audit trail for admin-triggered feedback emails; 24h cooldown enforced in app.

alter table bookings
  add column if not exists feedback_requested_at timestamptz,
  add column if not exists feedback_requested_channel text,
  add column if not exists feedback_request_count integer not null default 0;
