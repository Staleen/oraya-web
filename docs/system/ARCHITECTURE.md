# Architecture - Oraya Web

**Updated:** 2026-06-03
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
| `/house-book/mechmech`, `/house-book/byblos` | `app/house-book/<villa>/page.tsx` | Public villa House Book (Phase 16C Stage 1) — 9-page printable guest guide converted from the PR #73 design package; static, no guest-specific data; route-scoped print CSS in [components/house-book/house-book.css](../../components/house-book/house-book.css) |
| `/explore/mechmech`, `/explore/byblos` | `app/explore/<villa>/page.tsx` | Public Explore / Living List area guide (Phase 16C Stage 1) — **permanent QR destination** of the printed House Books; do not rename (see DECISIONS_LOG 2026-07-15) |
| `/book` | [app/book/page.tsx](../../app/book/page.tsx) | Booking flow (Reserve + Instant Book UI) |
| `/booking-confirmed` | [app/booking-confirmed/page.tsx](../../app/booking-confirmed/page.tsx) | Post-submit confirmation |
| `/booking/view/[token]` | [app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx) | Guest booking-view via signed token; confirmed bookings additionally show an "Open your Arrival Guide" link reusing the same token (Phase 16C Stage 2) |
| `/arrival/[token]` | `app/arrival/[token]/page.tsx` | **PRIVATE** mobile Arrival Guide (Phase 16C Stage 2) — reuses the signed booking-view token (`verifyViewToken`, locked helper imported only), renders guest name / stay dates / reference / villa guide **for confirmed bookings only**; pending → neutral locked state, cancelled/invalid/expired → safe neutral states; `noindex`, no sitemap, no public links; **never renders gate/door PINs or access codes** (access delivery is Phase 16D, not implemented). Delivered by the **confirmed booking email** ([lib/send-booking-email.ts](../../lib/send-booking-email.ts)) as one "Open your Arrival Guide" CTA reusing the email's own checkout-day-expiry view token (Phase 16C Stage 3; see DECISIONS_LOG 2026-07-15 Stage 3). Admin can additionally generate/copy the same link manually for a confirmed booking via `GET /api/admin/bookings/[id]/arrival-link` + the bookings-console "Copy Arrival Guide link" action, for manual WhatsApp sending (Phase 16C Stage 4A) |
| `/booking-action/confirm`, `/result` | `app/booking-action/*/page.tsx` | Admin email-link confirm/cancel |
| `/events/inquiry` | [app/events/inquiry/page.tsx](../../app/events/inquiry/page.tsx) | Event inquiry flow |
| `/join`, `/login`, `/forgot-password`, `/reset-password`, `/welcome`, `/profile` | `app/*/page.tsx` | Member auth + dashboard. `/profile` "My Bookings" cards open the canonical signed `/booking/view/[token]` page via a member-authenticated server mint (no duplicate booking-details UI). |
| `/legal/{terms,payment,refund,privacy}` | `app/legal/*/page.tsx` | Trust + legal hub |
| `/payments/checkout/[token]` | `app/payments/checkout/[token]/page.tsx` | Internal Credit Libanais / NetCommerce Unified Checkout payment page |

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
| `/api/admin/bookings/[id]/arrival-link` | GET | Mint and return the personalized Arrival Guide URL (`/arrival/<signed-view-token>`, checkout-day expiry) for a **confirmed** booking — admin manual copy/WhatsApp workflow (Phase 16C Stage 4A); refuses pending/cancelled, returns no other booking fields | admin-auth |
| `/api/addons` | GET | Public addon list | open |
| `/api/media` | GET | Public media list | open |
| `/api/members` | POST | Member create (same-user bearer auth) | open w/ guard |
| `/api/pricing` | GET | Public pricing query | open |
| `/api/profile` | PATCH/DELETE | Member profile update / account delete | open w/ guard |
| `/api/profile/booking-view` | POST | Member-authenticated mint of a fresh relative `/booking/view/[token]` path for a booking owned by the caller; verifies `member_id` before signing; returns non-disclosing 404 for foreign/missing bookings | open w/ guard |
| `/api/settings` | GET | Public allowlisted settings (`whatsapp_number`, payment public settings, selected operational flags) | open |
| `/api/butler/health` | GET | Butler liveness + secret check | secret-guarded |
| `/api/butler/event-types` | GET | Canonical event types for Butler intake | secret-guarded |
| `/api/butler/addons` | GET | Villa+context filtered add-ons (no prices) | secret-guarded |
| `/api/butler/availability` | GET | Merged unavailable date-range list for the villa + heated-pool carryover flag | secret-guarded |
| `/api/butler/availability` | POST | Yes/no availability for a specific `{villa, check_in, check_out}` | secret-guarded |
| `/api/butler/normalize-dates` | POST | Natural date normalization for Butler/WhatChimp intake | secret-guarded |
| `/api/butler/normalize-stay-intent` | POST | Single-message stay-intent extractor — accepts free-text `stay_text`, returns structured `{ check_in, check_out, nights, villa, guest_count, missing_fields, safe_message, confirm_prompt }` for the natural WhatsApp intake flow, plus an additive string-only `extracted_text` mirror (literal `"null"` for missing fields) for deterministic WhatChimp custom-field overwrite (stale-field safety — see DECISIONS_LOG 2026-07-02). Pure extraction; never reads/writes Supabase, never checks availability. | secret-guarded |
| `/api/butler/lead` | POST | WhatsApp/WhatChimp lead persistence into `whatsapp_leads` | secret-guarded |
| `/api/butler/prefill` | GET | Public short-lived token-auth prefill hydration for `/book?h=...` | token-auth |
| `/api/butler/booking-lookup` | POST | Reference-based booking lookup (returns safe-state envelope, never sensitive fields) | secret-guarded |
| `/api/butler/identify` | POST | WhatsApp identity orchestration — subscriber-id / phone continuity → booking-reference fallback → identity-verification gate, one call per turn. Optional `message_text` body field lets the route derive `booking_reference` from the inbound WhatsApp message via a bounded `\b[0-9A-Fa-f]{8}\b` extraction when no explicit reference was provided. | secret-guarded |
| `/api/butler/confirmed-guest-info` | POST | Confirmed-guest-only info boundary — narrow Phase 16A allow-list (reference / villa / dates / view URL / check-in guidance / location-access safety note); refuses pending / cancelled / unverified | secret-guarded |
| `/api/payments/checkout` | POST | Create a hosted checkout session for an existing booking via the selected provider adapter | payment |
| `/api/payments/unified-checkout-session` | POST | Create a CyberSource Unified Checkout capture context for an active signed booking payment link | payment |
| `/api/payments/unified-checkout-complete` | POST | Server-side CyberSource Payments API authorization from a Unified Checkout transient token | payment |
| `/api/payments/readiness` | GET | Admin-auth safe provider-readiness summary (configured vs placeholder, no secrets) | payment |
| `/api/payments/webhook/[provider]` | POST | Verified hosted-payment callback reconciliation for the selected provider | payment |
| `/api/payments/webhook/stripe` | POST | Stripe dev/test compatibility shim onto the generic hosted-payment callback handler | payment |

`secret-guarded` rows require an `X-Butler-Secret` header matching `BUTLER_WEBHOOK_SECRET`. `/api/butler/lead` is the first Butler write, but it writes only to `whatsapp_leads` and does not touch `bookings` or any locked surface.

## Booking flow

The public Reserve booking flow at [app/book/page.tsx](../../app/book/page.tsx) is a **three-step** UX. Step labels are exact and verified in code (`labels = ["Villa & Dates", "Stay Setup", "Review & Guest Details"]` at app/book/page.tsx:824).

1. Guest lands on `/book` with optional `?villa=...` preselect (or a Butler `?h=...` opaque handoff token).
2. **Step 1 — Villa & Dates.** Villa selection + check-in / check-out picker + eligibility check.
   - **Reserve path** (default): auto-advances to Step 2 (Stay Setup) when the prefilled villa+dates have settled and availability resolves.
   - **Instant Book path** (when villa is instant-eligible per `settings`): UI-only review + payment placeholder. **No booking persisted from this path today** — instant-book payment execution remains later Phase 16B work.
3. **Step 2 — Stay Setup.** Bedrooms, guests, add-ons, special requests; live estimated total via [lib/pricing/](../../lib/pricing/) helpers. Add-ons and special requests do NOT block the stay payment; approval-based add-ons are reviewed and charged separately after Oraya confirms.
4. **Step 3 — Review & Guest Details.** Review summary, guest-details form (Reserve path), and payment decision. Step 3 presents two explicit Reserve actions:
   - **Primary:** **"Continue to secure payment"** — solid gold CTA. When clicked, `submitIntent = "pay_now"`. The flow first calls `POST /api/bookings` (the locked booking-creation authority), then calls `POST /api/payments/checkout` to start hosted checkout. Blocked in the UI with clear setup messaging when the configured hosted-checkout provider is not truly ready (no fake checkout, no silent fall-through to a placeholder).
   - **Secondary:** **"Reserve now, pay later"** — outline / transparent-background button with a thin gold border. `submitIntent = "reserve"`. Calls `POST /api/bookings` only; no checkout session is created on the website. Oraya follows up via the existing manual / bank-transfer / admin-link rails configured under `/admin/settings`.
   - When hosted checkout is ready, the pay-now path offers full payment or admin-configured custom deposit (validated client-side and server-side against the admin-configured minimum percentage and the total-amount maximum).
5. **Server side (`POST /api/bookings`).** The locked booking-creation route validates overlap, pricing snapshot, and addon operational rules. On success, persists a `bookings` row including `pricing_snapshot` and `addons`. Triggers transactional emails and generates signed view + admin-action tokens. Optionally back-links `whatsapp_leads.linked_booking_id` when the request carried a verified `butler_prefill_token`. None of the back-linking can block booking creation.
6. **Hosted checkout (pay-now path).** `POST /api/payments/checkout` resolves the configured hosted-checkout adapter ([lib/payments/runtime.ts](../../lib/payments/runtime.ts)), persists `payment_link_*` state on the booking row, and returns the payment URL. For Credit Libanais / NetCommerce, that URL is Oraya's internal `/payments/checkout/[token]` page, which requests a CyberSource Unified Checkout capture context from `POST /api/payments/unified-checkout-session`, loads only the CyberSource-returned client library values, displays the official NetCommerce payment/security seal, and sends the returned transient token to `POST /api/payments/unified-checkout-complete` for server-side CyberSource Payments API authorization. After NetCommerce confirmed sandbox testing was successful, PR #64 explicitly disabled Unified Checkout saved-card consent/tokenization for launch: Oraya does not request TMS token creation, persist reusable payment instruments, record saved-card consent, or support credentials-on-file / recurring / merchant-initiated charging. Remaining balances and approved add-ons require a new payment link unless tokenization is later approved. Refunds do not require saved-card tokenization. PR #64 Preview has validated the approved sandbox path for NetCommerce-side testing; production remains disabled until explicit approval and production credentials/env are in place.
7. **Verified payment authority.** Server-side gateway verification and/or verified provider webhooks are authoritative for payment receipt / expiry updates. `POST /api/payments/unified-checkout-complete` may update booking payment fields to authorized/paid after server-side CyberSource authorization, but it does **not** auto-confirm the stay: `bookings.status` remains `PENDING` until admin/operations confirmation through the existing booking lifecycle. The temporary PR #64 Preview QA auto-confirm exception was removed after NetCommerce completed sandbox testing. Success / cancel redirects on `/booking/view/[token]?payment=success|cancelled` are informational only and never mark payment received by themselves. Credit Libanais / NetCommerce webhook/MLE verification remains required for asynchronous reconciliation and production hardening, and the adapter remains sandbox-only until explicit live rollout controls are implemented and approved.
8. **Admin lifecycle.** Admin receives the booking-request email with signed confirm/cancel links → `/api/booking-action` mutates status.
9. **Guest lifecycle.** Guest can revisit the booking via the signed `/booking/view/[token]` URL (also surfaced through `POST /api/butler/identify` on identity-established branches, and through the member `/profile` "View booking" action via `POST /api/profile/booking-view`).

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
  - `/api/butler/normalize-dates` - natural-language date normalization helper (two-field input: `check_in_text` + `check_out_text`).
  - `/api/butler/normalize-stay-intent` - single-message stay-intent extractor for the natural WhatsApp intake flow (Phase 16A). Accepts one free-text `stay_text` field and returns `{ status, extracted: { check_in, check_out, nights, villa, guest_count }, missing_fields, extracted_text, human_readable, safe_message, confirm_prompt }`. `extracted_text` (additive, 2026-07-02) mirrors `extracted` with string-only values — the literal string `"null"` for missing fields — so WhatChimp response mappings bound to `extracted_text.*` deterministically overwrite the canonical custom fields on every call (stale-field safety for the v6 flow's `= "null"` missing-field conditions). Delegates date arithmetic to `normalizeStayDates` (same `YYYY-MM-DD` discipline, no `new Date(<guest text>)`); adds villa substring detection (canonical names + `mechmech` / `annaya` / `byblos` / `jbeil` aliases) and guest-count regex detection. Pure extraction; never reads/writes Supabase, checks availability, sends email, or mints tokens.
- **Confirmed-guest info boundary (shipped).** `POST /api/butler/confirmed-guest-info` is the secret-guarded surface that returns the Phase 16A allow-list of fields a confirmed, identity-established guest is permitted to receive: public booking reference, villa name, check-in/check-out dates, signed `/booking/view/[token]` URL, high-level `checkin_guidance` (operator-managed via the `butler_checkin_guidance` settings key — placeholder when unset), and an explicit `location_access_note` that exact location, gate codes, and smart-lock access are not yet provided and remain a Phase 16D approval-gated concern. Reuses `orchestrateButlerIdentity` for the identity decision and refuses pending / cancelled / unverified bookings without surfacing any sensitive structured field. Never returns: PIN, exact GPS, payment links, admin notes, internal IDs.
- **Write endpoints (shipped).**
  - `/api/butler/lead` - persists a WhatsApp lead into `whatsapp_leads`. The lead is **not** a booking. `prefill_url` is additive and best-effort only: if `BUTLER_PREFILL_SECRET` is missing, lead capture still succeeds and the handoff is omitted. WhatChimp should use the returned `prefill_url` as the website continuation link; a static `/book` URL is only a fallback.
  - `/api/butler/prefill` - public short-lived prefill hydration. Returns only `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `bedroom_count` (additive 2026-07-02 — surfaced from `whatsapp_leads.raw_payload` only when it validates to `"1" | "2" | "3"`; advisory-only, `/book` re-validates), `full_name`, and `source`.
  - Website continuity after handoff - `/book` remains the only public booking surface. WhatsApp does **not** submit a booking directly in the current approved architecture. Instead, the signed prefill token continues the guest into the existing `/book` flow, and the final `POST /api/bookings` request may include the opaque Butler token so the server can best-effort update `whatsapp_leads.linked_booking_id` after successful insert.
- **Admin counterpart (shipped).**
  - `/api/admin/leads` GET lists leads.
  - `/api/admin/leads/[id]` PATCH updates follow-up status, labels, notes, or linkage.
  - `/admin/leads` is the operator dashboard.
- **Provenance writer on the locked booking route.** `/api/bookings` POST accepts an optional `butler_prefill_token`. After successful booking insert, the locked route verifies the token and best-effort updates `whatsapp_leads.linked_booking_id`. None of those failure paths block booking creation.
- **Booking reference vs access PIN.** The 8-character uppercased prefix of `bookings.id` shown on `/booking/view/[token]` and in emails is intentionally a public support reference code, not an access PIN. Access credential issuance is Phase 16D.
- **Website CTA prefill (plain human sentences; marker scheme withdrawn 2026-06-03).** The two booking-support WhatsApp CTAs on `/booking/view/[token]` and `/booking-confirmed` pre-fill the WhatsApp compose box with **plain human sentences** built by [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts): `"Check my booking <8-char-reference>"` for the view/status CTA and `"Help with my booking <8-char-reference>"` for the cancel/change CTA. WhatChimp triggers route on the `"Check my booking"` / `"Help with my booking"` substrings (the only platform capability available on the production tenant — see [KNOWN_BUGS.md](KNOWN_BUGS.md) #7). The 8-character reference inside the sentence is the public guest-facing support code from [lib/booking-reference.ts](../../lib/booking-reference.ts) and is not a credential. Normal greetings ("hi", "hello", free-form questions) continue to enter the welcome menu. The earlier `#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>` structured-marker scheme has been withdrawn — see [DECISIONS_LOG.md](DECISIONS_LOG.md) "WhatsApp CTA prefills reverted to plain human sentences" (2026-06-03). Operator routing details live in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Website CTA prefill routing".
- **No payment or smart-lock behavior in Butler.** Payment remains Phase 16B. Smart-lock remains 16D. Member -> phone linkage is a later phase. The current approved architecture is lead capture plus secure website continuation into the existing locked `/api/bookings` pipeline, not direct WhatsApp-side booking submission.
- **Hosted payment lives after booking creation, not inside Butler.** The website Reserve path creates the booking through the locked `/api/bookings` POST first, then starts provider-hosted payment via `/api/payments/checkout`. Credit Libanais / NetCommerce / CyberSource Unified Checkout is the production target gateway; the retained Stripe shim is for isolated dev/test use only. `/api/payments/readiness` is the admin-only safe surface for provider configuration/readiness gaps. Butler still does not create payment links or mark payments received.
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
