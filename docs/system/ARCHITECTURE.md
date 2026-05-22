# Architecture - Oraya Web

**Updated:** 2026-05-18
**Authority order:** see [PROJECT_STATE.md](PROJECT_STATE.md). This file is the descriptive map; if it conflicts with PROJECT_STATE.md, PROJECT_STATE.md wins.

> Secret model and per-variable risk live in **[ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md)** - this doc only references it.

---

## Stack at a glance

```text
Browser (Next.js client)
   ^
   | HTTP / TLS
   v
Vercel Edge / Node runtimes ----------> Resend (transactional email)
   |
   | Supabase JS (anon)          -> Supabase Postgres + Auth
   | Supabase JS (service role)     bookings, members, addons,
   |                                settings, booking_action_tokens
   v
Next.js App Router (TypeScript)
   app/ - pages, layouts, API routes
   lib/ - helpers (no React)
   components/ - UI
```

- **Hosting:** Vercel. Production from `master`; previews from PR branches.
- **Background jobs:** Vercel Cron - daily `0 0 * * *` calls `/api/cron/calendar-sync` (config in [/vercel.json](../../vercel.json)). Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}`.
- **DNS / domain:** `https://stayoraya.com` is the canonical origin (also hardcoded as fallback in [/lib/brand.ts](../../lib/brand.ts) `SITE_URL`).

## Next.js layout

- **App Router** (`app/`) - every page is a server component unless it explicitly opts in with `"use client"`.
- **API routes** under `app/api/` - server-side only, run on Node runtime.
- **`lib/`** - pure helpers. No React. Do not import from `components/`.
- **`components/`** - shared React components. Import from `lib/` freely; do not import API routes.
- **Inline styles + hardcoded color/font constants** are the visual convention. Tailwind v3 is loaded but used for layout utilities only; **do not** introduce custom Tailwind color/font classes.
- **SVG logos** are inlined as React components (`OrayaEmblem.tsx`, `OrayaLogoFull.tsx`). Do not switch to `<img>` or `next/image` for SVGs.
- **`page.tsx`** at the root must remain `"use client"` (mouse handlers).
- **`next.config.mjs`** - `.ts` is not supported by Next.js 14.

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
| `/admin/dashboard` | Overview only - **no destructive actions** |
| `/admin/bookings` | Booking operations (confirm, cancel, edit, payment, addons) |
| `/admin/calendar` | iCal export/import + sync status |
| `/admin/rates` | Add-ons + villa pricing |
| `/admin/media` | Asset management |
| `/admin/members` | Member management |
| `/admin/settings` | System configuration (`whatsapp_number`, instant booking flags, admin password, guest-facing payment settings, non-secret hosted-payment readiness) |

Live data: `AdminDataProvider` polls `/api/admin/data` every 45s and best-effort subscribes to Supabase Realtime `postgres_changes` on `public.bookings`. State-only updates - preserves tabs/filters/scroll.

## API surface (`app/api/*/route.ts`)

All routes verified against the current repo. Locked APIs are marked **locked** - see rule 4 in [AGENT_RULES.md](AGENT_RULES.md).

| Route | Method | Purpose | Status |
|---|---|---|---|
| `/api/bookings` | POST/GET | Booking submission + validation + overlap protection | locked |
| `/api/bookings/[id]` | GET/PATCH | Booking read/update | locked |
| `/api/bookings/availability` | GET | Calendar availability check | locked |
| `/api/booking-action` | POST | Admin email-link confirm/cancel | locked |
| `/api/booking-action/proposal` | POST | Event proposal accept/decline via guest link | locked |
| `/api/calendar/[villa].ics` | GET | iCal export per villa | locked |
| `/api/cron/calendar-sync` | GET | Daily Vercel Cron sync | locked |
| `/api/admin/verify-password` | POST | Admin login -> mints signed `oraya_admin` cookie | locked |
| `/api/admin/logout` | POST | Clears admin cookie | locked |
| `/api/admin/data` | GET | Admin dashboard data fetch (polled) | locked |
| `/api/admin/bookings/[id]` | PATCH/DELETE | Admin booking ops | locked |
| `/api/admin/bookings/[id]/approve-addon` | POST | Approval-required addon approval | locked |
| `/api/admin/bookings/[id]/send-feedback` | POST | Manual feedback email trigger | locked |
| `/api/admin/calendar-sync/run` | POST | Manual sync trigger | locked |
| `/api/admin/event-services/sync` | POST | Event service catalog sync | locked |
| `/api/admin/addons` | CRUD | Addon definitions | locked |
| `/api/admin/media` | CRUD | Media management | locked |
| `/api/admin/members/[id]` | PATCH/DELETE | Member management | locked |
| `/api/admin/settings` | GET/PATCH | System settings (admin scope) | locked |
| `/api/admin/leads` | GET | List WhatsApp leads with optional filters | admin-auth |
| `/api/admin/leads/[id]` | PATCH | Update a WhatsApp lead's status, labels, admin notes, or `linked_booking_id` | admin-auth |
| `/api/addons` | GET | Public addon list | open |
| `/api/media` | GET | Public media list | open |
| `/api/members` | POST | Member create (same-user bearer auth) | open w/ guard |
| `/api/pricing` | GET | Public pricing query | open |
| `/api/profile` | GET/PATCH | Member profile | open |
| `/api/settings` | GET | Public allowlisted settings (`whatsapp_number`, payment public settings, selected operational flags) | open |
| `/api/butler/health` | GET | Butler liveness + secret check | secret-guarded |
| `/api/butler/event-types` | GET | Canonical event types for Butler intake | secret-guarded |
| `/api/butler/addons` | GET | Villa+context filtered add-ons (no prices) | secret-guarded |
| `/api/butler/availability` | GET | Merged unavailable date-range list for the villa + heated-pool carryover flag | secret-guarded |
| `/api/butler/availability` | POST | Yes/no availability for a specific `{villa, check_in, check_out}` | secret-guarded |
| `/api/butler/normalize-dates` | POST | Natural date normalization for Butler/WhatChimp intake | secret-guarded |
| `/api/butler/lead` | POST | WhatsApp/WhatChimp lead persistence into `whatsapp_leads` | secret-guarded |
| `/api/butler/prefill` | GET | Public short-lived token-auth prefill hydration for `/book?h=...` | token-auth |
| `/api/butler/booking-lookup` | POST | Reference-based booking lookup (returns safe-state envelope, never sensitive fields) | secret-guarded |
| `/api/butler/identify` | POST | WhatsApp identity orchestration — phone continuity → reference fallback → identity-verification gate, one call per turn | secret-guarded |
| `/api/payments/checkout` | POST | Create a hosted checkout session for an existing booking via the selected provider adapter | payment |
| `/api/payments/readiness` | GET | Admin-auth safe provider-readiness summary (configured vs placeholder, no secrets) | payment |
| `/api/payments/webhook/[provider]` | POST | Verified hosted-payment callback reconciliation for the selected provider | payment |
| `/api/payments/webhook/stripe` | POST | Stripe dev/test compatibility shim onto the generic hosted-payment callback handler | payment |

`secret-guarded` rows require an `X-Butler-Secret` header matching `BUTLER_WEBHOOK_SECRET`. `/api/butler/lead` is the first Butler write, but it writes only to `whatsapp_leads` and does not touch `bookings` or any locked surface.

## Booking flow

1. Guest lands on `/book` with optional `?villa=...` preselect.
2. Step 1: dates -> eligibility check.
   - **Reserve path** (default): goes to Step 2 (Stay Setup).
   - **Instant Book path** (when villa is instant-eligible per `settings`): UI-only review + payment placeholder. **No booking persisted from this path today** - payment execution is Phase 16B.
3. Step 2: bedrooms, guests, add-ons, special requests; live total via [lib/pricing/](../../lib/pricing/) helpers.
4. Step 3: review + payment decision on the Reserve path.
   - Guest sees two clear paths: **Pay now and reserve** or **Submit booking request and pay later**.
   - When hosted checkout is truly ready, the pay-now path offers **full payment** or **custom deposit**.
   - Custom deposit is validated client-side and server-side against the admin-configured minimum percentage and the total-amount maximum.
   - When the active provider is not ready, the pay-now path is blocked in the UI with clear setup messaging instead of falling into a fake checkout flow.
5. Reserve submit path:
   - `POST /api/bookings` remains the authoritative booking-creation route.
4. Step 3: review + submit -> `POST /api/bookings`.
   - Server validates overlap, pricing snapshot, and addon operational rules.
   - On success, persists a `bookings` row including `pricing_snapshot` and `addons`.
   - Triggers transactional emails and generates signed view + admin-action tokens.
5. Admin receives email with signed confirm/cancel links -> `/api/booking-action` mutates status.
6. Guest can revisit booking via `/booking/view/[token]`.
6. After booking creation succeeds, `POST /api/payments/checkout` resolves the configured hosted-checkout adapter, creates a provider session when the adapter is fully implemented, persists `payment_link_*` state on the booking row, and returns the hosted checkout URL.
7. Guest is redirected to the provider-hosted payment page. Success/cancel returns land on `/booking/view/[token]?payment=success|cancelled`.
8. `POST /api/payments/webhook/[provider]` is the authority for payment receipt / expiry updates. Success redirects are informational only and never mark payment received by themselves.
9. Admin receives email with signed confirm/cancel links -> `/api/booking-action` mutates status.
10. Guest can revisit booking via `/booking/view/[token]`.

## Event inquiry flow

1. Guest lands on `/events/inquiry`.
2. Submits inquiry.
3. Persists as a booking row with event metadata; admin email sent.
4. Admin builds a proposal in `/admin/bookings`.
5. Proposal email sent to guest with signed accept/decline link.
6. Guest acts -> `/api/booking-action/proposal` records response.

## Admin flow

1. Admin enters password at `/admin` -> `/api/admin/verify-password`.
2. On success, signed `oraya_admin` HMAC cookie issued.
3. Every `/api/admin/*` route guards via `requireAdminAuth`.
4. `AdminDataProvider` polls `/api/admin/data` every 45s and uses best-effort Realtime.

## Butler flow (Phase 16A - operational surface)

The WhatsApp AI Butler (WhatChimp today; vendor-agnostic by design) talks to Oraya through a thin, secret-guarded surface under `/api/butler/*`. Oraya owns pricing, availability, add-ons, booking status, website continuation tokens, and policy text - WhatChimp / WhatsApp Flows / AI Training do not. **Operational rules** for the AI Butler - tone, escalation, conversation behavior, knowledge boundary, forbidden behaviors - live in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md). This section covers the data plane only.

- **Auth.** Every secret-guarded `/api/butler/*` route is guarded by [lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth`, which validates an `X-Butler-Secret` header against `BUTLER_WEBHOOK_SECRET` using a constant-time compare. 503 if the env is unset; 401 if the header is missing or wrong. `/api/butler/prefill` is the public exception: it is token-authenticated with `BUTLER_PREFILL_SECRET`, not `X-Butler-Secret`.
- **Read endpoints (shipped).**
  - `/api/butler/health` - liveness + secret check.
  - `/api/butler/event-types` - canonical event types.
  - `/api/butler/addons` - villa+context filtered add-ons, with prices intentionally omitted.
  - `/api/butler/availability` GET - merged unavailable ranges plus heated-pool carryover.
  - `/api/butler/availability` POST - yes/no availability for a specific stay.
  - `/api/butler/normalize-dates` - natural-language date normalization helper.
- **Write endpoints (shipped).**
  - `/api/butler/lead` - persists a WhatsApp lead into `whatsapp_leads`. The lead is **not** a booking. `prefill_url` is additive and best-effort only: if `BUTLER_PREFILL_SECRET` is missing, lead capture still succeeds and the handoff is omitted. WhatChimp should use the returned `prefill_url` as the website continuation link; a static `/book` URL is only a fallback.
  - `/api/butler/prefill` - public short-lived prefill hydration. Returns only `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `full_name`, and `source`.
  - Website continuity after handoff - `/book` remains the only public booking surface. WhatsApp does **not** submit a booking directly in the current approved architecture. Instead, the signed prefill token continues the guest into the existing `/book` flow, and the final `POST /api/bookings` request may include the opaque Butler token so the server can best-effort update `whatsapp_leads.linked_booking_id` after successful insert.
- **Admin counterpart (shipped).**
  - `/api/admin/leads` GET lists leads.
  - `/api/admin/leads/[id]` PATCH updates follow-up status, labels, notes, or linkage.
  - `/admin/leads` is the operator dashboard.
- **Provenance writer on the locked booking route.** `/api/bookings` POST accepts an optional `butler_prefill_token`. After successful booking insert, the locked route verifies the token and best-effort updates `whatsapp_leads.linked_booking_id`. None of those failure paths block booking creation.
- **Booking reference vs access PIN.** The 8-character uppercased prefix of `bookings.id` shown on `/booking/view/[token]` and in emails is intentionally a public support reference code, not an access PIN. Access credential issuance is Phase 16D.
- **No payment or smart-lock behavior in Butler.** Payment remains Phase 16B. Smart-lock remains 16D. Member -> phone linkage is a later phase. The current approved architecture is lead capture plus secure website continuation into the existing locked `/api/bookings` pipeline, not direct WhatsApp-side booking submission.
- **Hosted payment lives after booking creation, not inside Butler.** The website Reserve path creates the booking through the locked `/api/bookings` POST first, then starts provider-hosted payment via `/api/payments/checkout`. Credit Libanais / MPGS is the production target gateway; the retained Stripe shim is for isolated dev/test use only. `/api/payments/readiness` is the admin-only safe surface for provider configuration/readiness gaps. Butler still does not create payment links or mark payments received.
- **No payment, smart-lock, member-linking, or booking-creation writes** beyond the provenance enrichment above. Booking creation via WhatsApp (`POST /api/butler/flow-submit`) is still outstanding. The locked `/api/bookings*`, `/api/admin/bookings*`, `/api/calendar/*`, `/api/cron/*` surfaces remain otherwise untouched.

## Email system

- **Provider:** Resend.
- **From address:** hardcoded `Oraya Reservations <bookings@stayoraya.com>`.
- **Senders** (8 total): booking confirmed, booking pending, booking payment, booking request (admin notify), event proposal, event proposal response, event confirmation, feedback request.
- **Token-protected actions:** confirm/cancel/view all use signed HMAC tokens via `lib/booking-action-token.ts`.
- **Failure mode:** missing `RESEND_API_KEY` means email is a silent no-op (logs only).

## Calendar sync

- **iCal export per villa:** `GET /api/calendar/[villa].ics` (`mechmech`, `byblos`).
- **iCal contract:** UTC timestamps; `DTEND` is exclusive end date. Do not change.
- **Inbound sync:** daily Vercel Cron calls `/api/cron/calendar-sync`.
- **Manual run:** admin can trigger via `/api/admin/calendar-sync/run`.

## Theme & design system

- `data-theme="light" | "dark"` on `<html>`; default light; explicit dark via `oraya-theme` localStorage key.
- Shared CSS variables `--oraya-*` in [/app/globals.css](../../app/globals.css).
- Inline styles + hardcoded color/font constants are the convention.
- Micro-interaction utility classes live in `globals.css`. Reduced-motion respected.

## Environment & secrets model

Full per-variable risk profile in **[ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md)**.

## Booking identity model

Oraya keeps **public guest-facing identifiers** and **private signed tokens** strictly separated. Never blur the two.

- **Public guest-facing booking reference.** The first 8 hex characters of `bookings.id`, uppercased (for example `A1B2C3D4`). Centralized in [lib/booking-reference.ts](../../lib/booking-reference.ts) via `formatBookingReference`, `normalizeBookingReference`, and `resolveBookingByReference`. Visible to the guest in pending / event-inquiry / confirmed / cancelled emails (the `Reference` row of the summary card) and at the top of `/booking/view/[token]`. **Safe to share** in support channels (email, WhatsApp). **Knowing the reference is not proof of identity** and never authorizes sensitive disclosure on its own. It is **not** an access PIN, smart-lock PIN, or gate code — access credential issuance remains Phase 16D.
- **Private signed tokens.** The HMAC `view` / `confirmed` / `cancelled` action tokens minted by [lib/booking-action-token.ts](../../lib/booking-action-token.ts) and the `BUTLER_PREFILL_SECRET`-signed handoff tokens minted by [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts). These are credentials. They are delivered only via the guest's own email or WhatsApp handoff, never quoted, never asked of the guest in conversation, and never interchangeable with the public reference.

WhatsApp identity flow (shipped, owned by [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) and surfaced via `POST /api/butler/identify`):

- **Primary path (WhatChimp):** the bot passes `subscriber_id` (the stable `#LEAD_USER_SUBSCRIBER_ID#` hashtag variable) and optional `chat_id`. The orchestrator queries `whatsapp_leads.whatsapp_subscriber_id` → `linked_booking_id` → `bookings`. On a hit, identity is implicit and the bot is told to reply with status; villa / check_in / check_out are surfaced.
- **Secondary path (future channels):** the same shape but keyed on `whatsapp_leads.phone`. Retained because Telegram, Messenger, and direct WhatsApp Cloud API expose a sender phone where WhatChimp does not. On the WhatChimp channel this is a no-op unless the booking-request flow happened to capture a phone.
- **Fallback path:** no continuity match → the bot asks for the booking reference. `resolveBookingByReference` returns the booking_id and non-sensitive context. For pending / confirmed matches, the orchestrator refuses to surface villa / dates until the guest also supplies an `identity_proof` — accepted as **either the email or the full name** used on the booking. The proof is normalized (lowercased, trimmed, whitespace-collapsed) and compared exact-after-normalization against `bookings.guest_email`, `bookings.guest_name`, and (when the booking is linked to a member) the member's `auth.users.email` and `members.full_name`. A match on any of these four equals verified.
- **Escalation:** ambiguous references, failed proofs, and any unsafe state hand off to a human; the bot stops auto-replying about the booking.

Schema dependency: the subscriber-id path requires the columns added by [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) (`whatsapp_leads.whatsapp_subscriber_id`, `whatsapp_leads.whatsapp_chat_id`). Until that migration is applied in Supabase, the orchestrator gracefully degrades (`undefined_column` → silent fall-through to phone / reference), and the lead ingest route (`POST /api/butler/lead`) retries inserts without the new fields. Applying the migration enables the subscriber-id auto-resume path.

Resolution is intentionally lossy: a Supabase outage or genuinely-missing row both collapse to `{ kind: "not_found" }`. Either way the operator path is identity-verify or escalate.

## Database schema (high level)

- `bookings` - primary booking record. Includes `pricing_snapshot` and `addons` (`jsonb`).
- `addons` - single source of truth for addon definitions.
- `settings` - key/value store.
- `booking_action_tokens` - issued single-use tokens for admin confirm/cancel.
- `members` - linked to `auth.users`.
- `whatsapp_leads` - Phase 16A operational table for WhatsApp / WhatChimp leads collected before any booking exists. Includes `linked_booking_id` for best-effort provenance linkage after website completion.

Schema-creation snippets are recorded in [/AGENTS.md](../../AGENTS.md) and [/CLAUDE.md](../../CLAUDE.md). Existing schema is locked - see [AGENT_RULES.md](AGENT_RULES.md) rule 4.
