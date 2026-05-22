-- Phase 16A.3 — WhatChimp subscriber/chat identity columns on whatsapp_leads
-- Purpose: support the new primary continuity key for WhatsApp identity
-- orchestration. WhatChimp does NOT expose the sender phone as a variable,
-- so the prior phone-keyed lookup cannot identify a returning conversation
-- on its own. The bot can however carry a stable subscriber id and a
-- chat id on every webhook via the hashtag variables #LEAD_USER_SUBSCRIBER_ID#
-- and #LEAD_USER_CHAT_ID#. This migration adds the two columns that the
-- ingest path (POST /api/butler/lead) writes and the identity orchestrator
-- (lib/butler/identity-orchestrator.ts) looks up.
--
-- NOT auto-applied. Run once in the Supabase SQL editor. The backend
-- gracefully degrades when these columns are missing: the ingest route
-- retries the insert without them, the admin routes fall back to the base
-- column list, and the identity orchestrator returns "not_found" from the
-- subscriber-id path so the conversation falls through to phone / reference
-- lookups. None of this is optimal — applying this migration enables the
-- subscriber-id auto-resume path.
--
-- Idempotent. Safe to re-run.
--
-- Reversible: drop the columns + index; the ingest path will start using
-- its retry fallback, the orchestrator will return "not_found", and no
-- other behavior changes. Existing rows lose nothing (the columns are
-- nullable; pre-migration rows simply had NULLs).

-- 1. Add the columns (idempotent).
alter table whatsapp_leads
  add column if not exists whatsapp_subscriber_id text null;

alter table whatsapp_leads
  add column if not exists whatsapp_chat_id text null;

-- 2. Index the subscriber id only.
--    `whatsapp_subscriber_id` is the primary continuity lookup key — the
--    identity orchestrator queries it on every WhatsApp turn that does
--    not already match by phone.
--    `whatsapp_chat_id` is intentionally NOT indexed: it is a diagnostic
--    signal only (ops correlation between WhatChimp logs and our rows),
--    never queried as a lookup key.
create index if not exists whatsapp_leads_whatsapp_subscriber_id_idx
  on whatsapp_leads (whatsapp_subscriber_id);

-- 3. Comments — make the schema self-documenting in the Supabase UI.
comment on column whatsapp_leads.whatsapp_subscriber_id is
  'WhatChimp subscriber id (#LEAD_USER_SUBSCRIBER_ID#). Primary continuity key for WhatsApp identity orchestration. Nullable for non-WhatChimp / pre-Phase-16A.3 rows.';

comment on column whatsapp_leads.whatsapp_chat_id is
  'WhatChimp chat id (#LEAD_USER_CHAT_ID#). Diagnostic only — never used as a lookup key. Nullable for non-WhatChimp / pre-Phase-16A.3 rows.';
