# Architecture — Oraya Web

**Updated:** 2026-05-09
**Authority order:** see [PROJECT_STATE.md](PROJECT_STATE.md). This file is the descriptive map; if it conflicts with PROJECT_STATE.md, PROJECT_STATE.md wins.

> Secret model and per-variable risk live in **[ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md)** — this doc only references it.

---

## Stack at a glance

```
Browser (Next.js client)
   ▲
   │ HTTP / TLS
   ▼
Vercel Edge / Node runtimes  ──────────►  Resend  (transactional email)
   │
   │  Supabase JS (anon)            ┌─►  Supabase Postgres + Auth
   │  Supabase JS (service role)  ──┘     • bookings, members, addons,
   │                                       settings, booking_action_tokens
   ▼
Next.js App Router (TypeScript)
   • app/ — pages, layouts, API routes
   • lib/ — helpers (no React)
   • components/ — UI
```

- **Hosting:** Vercel. Production from `master`; previews from PR branches.
- **Background jobs:** Vercel Cron — daily `0 0 * * *` calls `/api/cron/calendar-sync` (config in [/vercel.json](../../vercel.json)). Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}`.
- **DNS / domain:** `https://stayoraya.com` is the canonical origin (also hardcoded as fallback in [/lib/brand.ts](../../lib/brand.ts) `SITE_URL`).

## Next.js layout

- **App Router** (`app/`) — every page is a server component unless it explicitly opts in with `"use client"`.
- **API routes** under `app/api/` — server-side only, run on Node runtime.
- **`lib/`** — pure helpers. No React. Do not import from `components/`.
- **`components/`** — shared React components. Import from `lib/` freely; do not import API routes.
- **Inline-styles + hardcoded color/font constants** are the visual convention. Tailwind v3 is loaded but used for layout utilities only; **do not** introduce custom Tailwind color/font classes (history of unreliability — see [/CLAUDE.md](../../CLAUDE.md)).
- **SVG logos** are inlined as React components (`OrayaEmblem.tsx`, `OrayaLogoFull.tsx`). Do not switch to `<img>` or `next/image` for SVGs.
- **`page.tsx`** at the root must remain `"use client"` (mouse handlers).
- **`next.config.mjs`** — `.ts` is not supported by Next.js 14.

## Public surface (pages)

| Route | File | Purpose |
|---|---|---|
| `/` | [app/page.tsx](../../app/page.tsx) | Homepage / brand entry |
| `/villas/byblos`, `/villas/mechmech` | `app/villas/<villa>/page.tsx` | Per-villa detail |
| `/book` | [app/book/page.tsx](../../app/book/page.tsx) | Booking flow (Reserve + Instant Book UI) |
| `/booking-confirmed` | [app/booking-confirmed/page.tsx](../../app/booking-confirmed/page.tsx) | Post-submit confirmation |
| `/booking/view/[token]` | [app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx) | Guest booking-view via signed token |
| `/booking-action/confirm`, `/result` | `app/booking-action/*/page.tsx` | Admin email-link confirm/cancel |
| `/events/inquiry` | [app/events/inquiry/page.tsx](../../app/events/inquiry/page.tsx) | Event inquiry flow |
| `/join`, `/login`, `/forgot-password`, `/reset-password`, `/welcome`, `/profile` | `app/*/page.tsx` | Member auth + dashboard |
| `/legal/{terms,payment,refund,privacy}` | `app/legal/*/page.tsx` | Trust + legal hub |

## Admin surface

Password-gated; bearer or signed `oraya_admin` cookie required on every API call. Auth helpers in [lib/admin-auth.ts](../../lib/admin-auth.ts).

| Route | Purpose |
|---|---|
| `/admin` | Login |
| `/admin/dashboard` | Overview only — **no destructive actions** |
| `/admin/bookings` | Booking operations (confirm, cancel, edit, payment, addons) |
| `/admin/calendar` | iCal export/import + sync status |
| `/admin/rates` | Add-ons + villa pricing |
| `/admin/media` | Asset management |
| `/admin/members` | Member management |
| `/admin/settings` | System configuration (`whatsapp_number`, instant booking flags, admin password) |

Live data: `AdminDataProvider` polls `/api/admin/data` every 45s and best-effort subscribes to Supabase Realtime `postgres_changes` on `public.bookings`. State-only updates — preserves tabs/filters/scroll.

## API surface (`app/api/*/route.ts`)

All routes verified against the current repo. Locked APIs are marked **🔒** — see rule 4 in [AGENT_RULES.md](AGENT_RULES.md).

| Route | Method | Purpose | Status |
|---|---|---|---|
| `/api/bookings` | POST/GET | Booking submission + validation + overlap protection | 🔒 |
| `/api/bookings/[id]` | GET/PATCH | Booking read/update | 🔒 |
| `/api/bookings/availability` | GET | Calendar availability check | 🔒 |
| `/api/booking-action` | POST | Admin email-link confirm/cancel | 🔒 |
| `/api/booking-action/proposal` | POST | Event proposal accept/decline via guest link | 🔒 |
| `/api/calendar/[villa].ics` | GET | iCal export per villa | 🔒 |
| `/api/cron/calendar-sync` | GET | Daily Vercel Cron sync | 🔒 |
| `/api/admin/verify-password` | POST | Admin login → mints signed `oraya_admin` cookie | 🔒 |
| `/api/admin/logout` | POST | Clears admin cookie | 🔒 |
| `/api/admin/data` | GET | Admin dashboard data fetch (polled) | 🔒 |
| `/api/admin/bookings/[id]` | PATCH/DELETE | Admin booking ops | 🔒 |
| `/api/admin/bookings/[id]/approve-addon` | POST | Approval-required addon approval | 🔒 |
| `/api/admin/bookings/[id]/send-feedback` | POST | Manual feedback email trigger | 🔒 |
| `/api/admin/calendar-sync/run` | POST | Manual sync trigger | 🔒 |
| `/api/admin/event-services/sync` | POST | Event service catalog sync | 🔒 |
| `/api/admin/addons` | CRUD | Addon definitions | 🔒 |
| `/api/admin/media` | CRUD | Media management | 🔒 |
| `/api/admin/members/[id]` | PATCH/DELETE | Member management | 🔒 |
| `/api/admin/settings` | GET/PATCH | System settings (admin scope) | 🔒 |
| `/api/admin/leads` | GET | Phase 16A.2.e — list WhatsApp leads with optional `follow_up_status` / `request_type` / `villa` filter | admin-auth |
| `/api/admin/leads/[id]` | PATCH | Phase 16A.2.e — update a WhatsApp lead's status, labels, admin notes, or `linked_booking_id` | admin-auth |
| `/api/addons` | GET | Public addon list | open |
| `/api/media` | GET | Public media list | open |
| `/api/members` | POST | Member create (same-user bearer auth) | open w/ guard |
| `/api/pricing` | GET | Public pricing query | open |
| `/api/profile` | GET/PATCH | Member profile | open |
| `/api/settings` | GET | Public allowlisted settings (`whatsapp_number` only) | open |
| `/api/butler/health` | GET | Phase 16A.1 read-only — Butler liveness + secret check | secret-guarded |
| `/api/butler/event-types` | GET | Phase 16A.1 read-only — canonical event types for Butler intake | secret-guarded |
| `/api/butler/addons` | GET | Phase 16A.1 read-only — villa+context filtered add-ons (no prices) | secret-guarded |
| `/api/butler/availability` | GET | Phase 16A.1 read-only — merged unavailable date-range list for the villa + heated-pool carryover flag | secret-guarded |
| `/api/butler/availability` | POST | Phase 16A.2.d read-only — yes/no `available`/`unavailable`/`unclear` for a specific `{villa, check_in, check_out}` (no DB write, no booking, no token, no email) | secret-guarded |
| `/api/butler/normalize-dates` | POST | Read-only natural date normalization for Butler/WhatChimp intake (no DB, no availability check, no booking, no token) | secret-guarded |
| `/api/butler/lead` | POST | Phase 16A.2.e — WhatsApp/WhatChimp lead persistence into `whatsapp_leads`. Lead intake only — no booking creation, no date holding, no availability check, no email, no token. | secret-guarded |
| `/api/butler/prefill` | GET | Public short-lived token-auth prefill hydration for `/book?h=...`; returns a strict safe-field allow-list only | token-auth |

`secret-guarded` rows require an `X-Butler-Secret` header matching `BUTLER_WEBHOOK_SECRET`. Phase 16A.1 routes are read-only. Phase 16A.2.e (`/api/butler/lead`) is the **first Butler write**, but it writes only to the new `whatsapp_leads` operational table — it does not touch `bookings` or any locked surface, and the lead is not a booking. See "Butler flow" below and [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-12 + 2026-05-15 entries).

## Booking flow

1. Guest lands on `/book` with optional `?villa=…` preselect.
2. Step 1: dates → eligibility check.
   - **Reserve path** (default, premium positioning): goes to Step 2 (Stay Setup).
   - **Instant Book path** (when villa is instant-eligible per `settings`): UI-only review + payment placeholder. **No booking persisted from this path today** — payment execution is Phase 16.
3. Step 2: bedrooms, guests, add-ons, special requests; live total via [lib/pricing/](../../lib/pricing/) helpers.
4. Step 3: review + submit → `POST /api/bookings`.
   - Server validates: overlap, pricing snapshot, addon operational rules (strict can block).
   - On success, persists `bookings` row including `pricing_snapshot` (jsonb) and `addons` (jsonb).
   - Triggers transactional emails via [lib/send-booking-pending-email.ts](../../lib/send-booking-pending-email.ts) (guest) and [lib/send-booking-request-email.ts](../../lib/send-booking-request-email.ts) (admin).
   - Generates signed view + admin-action tokens (HMAC, 72h TTL) via [lib/booking-action-token.ts](../../lib/booking-action-token.ts).
5. Admin receives email with signed confirm/cancel links → `/api/booking-action` mutates status; success email sent via [lib/send-booking-email.ts](../../lib/send-booking-email.ts).
6. Guest can revisit booking via `/booking/view/[token]` (signed view link, read-only, 72h).

## Event inquiry flow

1. Guest lands on `/events/inquiry`.
2. Submits inquiry (event type, date window, guest count, optional services from the seeded catalog in [lib/event-service-seed.ts](../../lib/event-service-seed.ts)).
3. Persists as a booking row with event metadata; admin email sent.
4. Admin builds a proposal in `/admin/bookings` using line-item helpers in [lib/event-proposal-line-items.ts](../../lib/event-proposal-line-items.ts).
5. Proposal email sent to guest via [lib/send-event-proposal-email.ts](../../lib/send-event-proposal-email.ts) with signed accept/decline link.
6. Guest acts → `/api/booking-action/proposal` records response → confirmation email via [lib/send-event-proposal-response-email.ts](../../lib/send-event-proposal-response-email.ts) and [lib/send-event-confirmation-email.ts](../../lib/send-event-confirmation-email.ts).

## Admin flow

1. Admin enters password at `/admin` → `/api/admin/verify-password` checks against `settings.admin_password` (Supabase row, fallback `"Oraya2026"` if unset).
2. On success, signed `oraya_admin` HMAC cookie issued via [lib/admin-auth.ts](../../lib/admin-auth.ts), 7-day TTL, `secure` in production.
3. Every `/api/admin/*` route guards via `requireAdminAuth` (cookie or `Authorization: Bearer ${ADMIN_SECRET}`).
4. `AdminDataProvider` (client) polls `/api/admin/data` every 45s + best-effort Supabase Realtime subscription on `public.bookings`.

## Butler flow (Phase 16A.1 — read-only)

The WhatsApp AI Butler (WhatChimp today; vendor-agnostic by design) talks to Oraya through a thin, secret-guarded read-only surface under `/api/butler/*`. Oraya owns pricing, availability, add-ons, booking status, access codes, and policy text — WhatChimp / WhatsApp Flows / AI Training do not. See [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-12 entry "Phase 16A Butler architecture freeze"). **Operational rules** for the AI Butler — tone, conversation behavior, knowledge boundary, forbidden behaviors — live in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md). This section covers the data plane only.

- **Auth.** Every `/api/butler/*` route is guarded by [lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth`, which validates an `X-Butler-Secret` header against `BUTLER_WEBHOOK_SECRET` using a constant-time compare. 503 if the env is unset; 401 if the header is missing or wrong. HMAC + timestamp is a 16A.1.x follow-on once WhatChimp's outbound-signing posture is confirmed.
- **Read endpoints (16A.1, shipped).**
  - `/api/butler/health` — liveness + secret check. Returns `{ ok: true, service: "oraya-butler", mode: "read-only" }`.
  - `/api/butler/event-types` — canonical event types from [lib/event-types.ts](../../lib/event-types.ts). The Butler must never invent or paraphrase event types.
  - `/api/butler/addons` — villa+context filtered add-ons. Required: `villa=mechmech|byblos`, `context=stay|event`. Optional: `event_type` (canonical). Returns `id`, `label`, `recommended`, `requires_approval`, `pricing_model`. **Prices and currency are intentionally omitted** in this phase; operational internals (cutoff/enforcement/applicable_villas/applicable_event_types/…) are used for filtering but never echoed.
  - `/api/butler/availability` **GET** (16A.1) — thin wrapper around [lib/calendar/availability.ts](../../lib/calendar/availability.ts) `getMergedAvailabilityRanges` + [lib/heated-pool-carryover.ts](../../lib/heated-pool-carryover.ts). Returns the merged unavailable date-range list for the villa plus a `heated_pool_carryover` flag. Caller does the range-vs-range overlap themselves (used by calendar-style consumers). The locked `/api/bookings/availability` route is **not** modified or proxied — both share the same lib code.
  - `/api/butler/availability` **POST** (16A.2.d, additive) — yes/no availability for a specific stay. JSON body: `{ villa, check_in, check_out, request_type?, event? }` (villa accepts slug or canonical name; `event:true` or `request_type:"event"` flips event-mode). Wraps [lib/calendar/availability.ts](../../lib/calendar/availability.ts) `findAvailabilityConflict` (same overlap logic the locked `/api/bookings` route uses) and returns `{ ok:true, status: "available"|"unavailable"|"unclear", villa, check_in, check_out, safe_message }` via [lib/butler/availability-formatter.ts](../../lib/butler/availability-formatter.ts). Response text is the **only** sentence the Butler is allowed to repeat to the guest about availability. **Does not create bookings, write DB rows, send emails, or issue tokens** — read-only overlap check only. Internal errors return `status: "unclear"` (raw Supabase / driver messages are never echoed).
  - `/api/butler/normalize-dates` — additive read-only helper. Normalizes natural-language date text (`"this Saturday"`, `"June 10"`, `"10 June 2026"`, `"two nights"`, ISO) into structured `YYYY-MM-DD` strings via [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts). Returns an advisory `{ status, check_in, check_out, nights, human_readable, safe_message }` that the Butler must echo back to the guest for confirmation. **Does not create bookings, check availability, write DB rows, send emails, or issue tokens** — pure text → structured suggestion only.
- **Write endpoints (Phase 16A.2.e, shipped).**
  - `/api/butler/lead` **POST** — WhatsApp lead persistence. Accepts a flexible JSON payload of guest details collected by the AI Butler (`oraya_full_name`, `oraya_phone`, `oraya_request_type`, `oraya_check_in_text`, `oraya_check_out_text`, `oraya_guest_count`, `oraya_villa`, `oraya_addons_interest`, `oraya_special_requests`, `labels`, optional pre-normalized dates, optional `linked_booking_id`, full `raw_payload`) and inserts one row into the new `whatsapp_leads` operational table via [lib/butler/leads.ts](../../lib/butler/leads.ts) `normalizeLeadInput`. Returns `{ ok: true, lead_id, message, prefill_url? }`. **The lead is NOT a booking** — no row is created in `bookings`, no availability is held, no email is sent, and no payment is triggered. `prefill_url` is additive and best-effort only: if `BUTLER_PREFILL_SECRET` is missing, lead capture still succeeds and the handoff is omitted. Operators triage from `/admin/leads`. Raw Supabase / driver errors are logged server-side and replaced with a safe `{ ok: false, error: "server_error" }` 500.
  - `/api/butler/prefill` **GET** — public short-lived prefill hydration. Takes `h=<opaque-token>`, verifies it with `BUTLER_PREFILL_SECRET`, loads the lead from `whatsapp_leads`, and returns only `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `full_name`, and `source`. No phone, raw payload, labels, notes, follow-up status, or linked booking id are exposed. `/book?h=...` strips the token from the URL after hydration (or failure) and continues to work normally if the handoff is unavailable.
- **Admin counterpart (Phase 16A.2.e, shipped).**
  - `/api/admin/leads` **GET** (`requireAdminAuth`) — list latest leads, newest first, with optional `follow_up_status` / `request_type` / `villa` filters and a `limit` (default 100, max 500). `raw_payload` is intentionally **not** returned in the list response; operators inspect it in Supabase if truly needed.
  - `/api/admin/leads/[id]` **PATCH** (`requireAdminAuth`) — update one lead's `follow_up_status`, `labels`, `admin_notes`, or `linked_booking_id`. Identity fields (`source`/`phone`/`name`/dates/`raw_payload`) are intentionally **not** mutable from this PATCH in v1.
  - `/admin/leads` — admin dashboard page; lists leads, filters by status, supports inline status change + admin-notes edit, surfaces a `wa.me` link for the lead's phone. No booking-creation affordances, no access-detail surface, no payment surface.
- **Provenance writer on the locked booking route (Phase 16A, 2026-05-18).** `/api/bookings` POST now accepts an optional `butler_prefill_token` in the request body. After a successful booking insert, the locked route verifies the token via `verifyPrefillToken` from [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) and, on success, best-effort updates `whatsapp_leads.linked_booking_id` for the originating lead. The update is guarded by `.is("linked_booking_id", null)` so an existing linkage is never overwritten. Verification failure, expired token, missing lead, conflicting linkage, and Supabase errors all log a server-side warning and return early — **none of them block booking creation**. This closes the lead → booking provenance loop without changing locked-pipeline behavior on failure. The booking pipeline's pricing / overlap / addon-audit / email-trigger / view-token logic is untouched.
- **Booking reference vs access PIN.** The 8-character uppercased prefix of `bookings.id` shown on `/booking/view/[token]` and in emails is intentionally a public **support reference code**, not an access PIN. There is no access PIN, smart-lock PIN, or gate code in Phase 16A. Access credential issuance is Phase 16D (smart lock).
- **WhatsApp does not create bookings.** Per the 2026-05-18 product decision, WhatsApp / WhatChimp is an **intake + website continuation channel** only. The Butler may collect dates / villa / guests / name, create or update a `whatsapp_leads` row, and hand the guest a secure `prefill_url`. The guest then completes final submission on `/book`, which calls the locked `/api/bookings` POST. The booking reference (the 8-character `bookings.id` prefix) is only issued after that website submission. `POST /api/butler/flow-submit` (a write-capable Butler booking adapter) is **deferred indefinitely** and is not part of Phase 16A scope. See [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-18 entry "WhatsApp is intake + website continuation; `POST /api/butler/flow-submit` deferred indefinitely".
- **No payment, smart-lock, or member-linking writes** (beyond the provenance enrichment above). Payment is 16B (gated on a `bookings` row already existing). Smart-lock is 16D. Member ↔ phone linkage is a later phase. The locked `/api/bookings*`, `/api/admin/bookings*`, `/api/calendar/*`, `/api/cron/*` surfaces remain otherwise untouched.

## Email system

- **Provider:** Resend.
- **From address:** hardcoded `Oraya Reservations <bookings@stayoraya.com>` (constant `FROM_EMAIL` in each `lib/send-*-email.ts`). `RESEND_FROM_EMAIL` env var is reserved but **not currently consumed** — see [KNOWN_BUGS.md](KNOWN_BUGS.md).
- **Senders** (8 total): booking confirmed, booking pending, booking payment, booking request (admin notify), event proposal, event proposal response, event confirmation, feedback request.
- **Token-protected actions:** confirm/cancel/view all use signed HMAC tokens via `lib/booking-action-token.ts`. Admin actions are single-use (tracked in `booking_action_tokens`); guest view is re-readable until `exp`.
- **Failure mode:** missing `RESEND_API_KEY` → silent no-op (only logs). See [KNOWN_BUGS.md](KNOWN_BUGS.md).

## Calendar sync

- **iCal export per villa:** `GET /api/calendar/[villa].ics` (`mechmech`, `byblos`).
- **iCal contract:** UTC timestamps; `DTEND` is exclusive end date. Do not change.
- **Inbound sync:** daily Vercel Cron at `0 0 * * *` calls `/api/cron/calendar-sync` → `runCalendarSync` in [lib/calendar/sync.ts](../../lib/calendar/sync.ts) → ingests external blocking-source iCals → upserts blocking rows.
- **Manual run:** admin can trigger via `/api/admin/calendar-sync/run`.

## Theme & design system

- `data-theme="light" | "dark"` on `<html>`; default light; explicit dark via `oraya-theme` localStorage key.
- Shared CSS variables `--oraya-*` in [/app/globals.css](../../app/globals.css).
- Inline styles + hardcoded color/font constants are the convention (see [/CLAUDE.md](../../CLAUDE.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md)).
- Micro-interaction utility classes (press, cards, links, focus-visible) live in `globals.css`. Reduced-motion respected.

## Environment & secrets model

Full per-variable risk profile in **[ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md)**. Summary:

- **Public** (browser-inlined, `NEXT_PUBLIC_*`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
- **Server-only** (Node runtime only, never in client components or `NEXT_PUBLIC_*`): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `ADMIN_SECRET`. Reserved-but-unused: `RESEND_FROM_EMAIL`.
- **System-managed** (do not set manually): `NODE_ENV`.
- **Source of values:** Supabase Dashboard, Resend Dashboard, locally-generated randoms (`openssl rand -base64 32`). Real values live in `.env.local` (gitignored) for local and Vercel's env panel for Production/Preview.
- **`.env.example`** is the only env file under version control — contains placeholders only.

## Database schema (high level)

- `bookings` — primary booking record. Includes `pricing_snapshot` and `addons` (both `jsonb`). RLS: members can view/insert their own.
- `addons` — single source of truth for addon definitions. RLS off (server-only writes via service role).
- `settings` — key/value store (`whatsapp_number`, `admin_password`, `instant_booking_villa_*`). RLS off.
- `booking_action_tokens` — issued single-use tokens for admin confirm/cancel.
- `members` — linked to `auth.users`.
- `whatsapp_leads` — Phase 16A.2.e operational table for WhatsApp / WhatChimp leads collected by the AI Butler before any booking exists. Columns: `id`, `created_at`, `updated_at`, `source`, `phone`, `name`, `request_type`, `villa`, `check_in_text`, `check_out_text`, `normalized_check_in` (date), `normalized_check_out` (date), `guest_count`, `addons_interest`, `special_requests`, `follow_up_status` (`new`/`contacted`/`needs_action`/`converted`/`lost`/`spam`), `labels` (`text[]`), `raw_payload` (`jsonb`), `linked_booking_id`, `admin_notes`. **RLS enabled with NO policies** — service role bypasses RLS, so only the Butler ingest (`/api/butler/lead`) and admin routes (`/api/admin/leads*`, both server-only via `SUPABASE_SERVICE_ROLE_KEY`) can read/write. Defense-in-depth: any future anon/authenticated client query is denied by default. Schema in [/sql/phase-16a2e-whatsapp-leads.sql](../../sql/phase-16a2e-whatsapp-leads.sql).

Schema-creation snippets are recorded in [/AGENTS.md](../../AGENTS.md) and [/CLAUDE.md](../../CLAUDE.md). **Existing schema is locked** — see [AGENT_RULES.md](AGENT_RULES.md) rule 4. The 16A.2.e `whatsapp_leads` table is the only schema addition since the lock and is explicitly approved via [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-15 entry).

