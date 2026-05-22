# Current Phase - Phase 16A closeout / Phase 16B hosted payment provider refactor

**Updated:** 2026-05-22
**Status:** Phase 16A WhatsApp / WhatChimp / Butler lead capture + secure website handoff + identity continuity remain shipped. Phase 16A.2 `flow-submit` write-capable booking adapter remains outstanding. Phase 16B is now live through the settings-driven Reserve payment foundation: payment-link schema, runtime plumbing, admin payment settings, premium Step 3 decision UX, provider-agnostic hosted checkout architecture, and verified hosted-payment callbacks. Credit Libanais / MPGS is the only approved production provider path; Stripe remains isolated to local/dev testing only.

This file is rewritten at every phase transition. Treat it as a snapshot, not a log.

---

## Active phase

**Phase 16A closeout + Phase 16B hosted payment provider refactor.**

Phase 16A is functionally complete for the lead-intake half of the WhatsApp Butler journey:

- `/api/butler/health|event-types|addons|availability|normalize-dates|lead|prefill` are live and guarded by `BUTLER_WEBHOOK_SECRET` (or `BUTLER_PREFILL_SECRET` for the public prefill route).
- `whatsapp_leads` is the operational source of truth for WhatsApp-originated booking intent.
- `/book` accepts a short-lived opaque handoff token (`?h=...`) and continues the conversation on the website without retyping.
- A successful booking now best-effort links `whatsapp_leads.linked_booking_id` to the new booking row via `butler_prefill_token` in the booking POST body. This closes the lead -> booking provenance loop without changing locked-pipeline behavior on failure.

The remaining Phase 16A scope is `POST /api/butler/flow-submit` - the write-capable booking adapter that turns a WhatsApp Flow submission directly into an Oraya booking row through the locked `/api/bookings` POST contract. No schema changes. No locked-API behavior changes. Idempotency keyed on a Flow-supplied submission token so retries do not create duplicates.

Phase 16B is now active on the website Reserve path:

- payment-link columns exist on `bookings`
- admin + guest runtime surfaces understand `payment_link_*`
- `/book` Step 3 now supports a settings-driven premium decision flow for the Reserve path: pay now when hosted checkout is truly ready, or submit the booking request and pay later after confirmation
- `/admin/settings` now owns public payment behavior such as mode, deposit minimum, guest instructions, manual rails, and whether online payment is enabled guest-side
- `POST /api/payments/checkout` creates a hosted checkout session only after the locked `/api/bookings` POST successfully creates the booking row
- `POST /api/payments/webhook/[provider]` is the authority for payment receipt updates; success redirects are informational only

Phase 16B is still incomplete. Real Credit Libanais execution, WhatsApp payment replies, refunds automation, and Instant Book execution are not part of the shipped path yet. See [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) for the broader roadmap.

The current closeout work around those shipped Phase 16A surfaces is operational:

1. keep WhatChimp production wiring aligned with the shipped backend contract
2. keep Butler prompt/escalation rules aligned with human operations
3. keep secret handling, rotation, and Vercel env posture explicit
4. avoid any accidental Phase 16B payment promises in WhatsApp or website handoff copy

## Active objective

Keep the new hosted Reserve payment flow stable while Phase 16A closeout continues:

1. **Hosted-checkout execution hardening.** Ensure `POST /api/payments/checkout` and verified provider callbacks remain the only payment execution authority for Reserve bookings after the booking row exists.
2. **Webhook-first truth.** Guest return URLs on `/booking/view/[token]` stay informational; payment state comes from verified webhook updates only.
3. **Phase 16A closeout.** `POST /api/butler/flow-submit` is still the remaining WhatsApp booking-adapter scope, but it must not bypass the locked `/api/bookings` POST or promise any payment automation beyond the shipped website hosted-payment flow.
4. **Operational readiness.** Preview + production must carry `PAYMENT_PROVIDER`, `NEXT_PUBLIC_SITE_URL`, the Phase 16A Butler secrets, and whichever provider-specific payment secrets match the selected hosted gateway before the new payment flow is considered stable.

## Just completed

- **Phase 16A - Butler website handoff date/auth persistence hardening (this commit).** `normalizeLeadInput` now accepts plain `check_in` / `check_out` aliases in addition to the normalized WhatChimp fields when persisting `whatsapp_leads`, and also falls back to the nested `raw_payload` object WhatChimp sends when the ISO stay dates are not duplicated at the top level. This closes the production gap where villa/name/guest count were mapped from top-level fields but `oraya_check_in` / `oraya_check_out` existed only inside `raw_payload`, leaving `normalized_check_in` / `normalized_check_out` null and causing `/api/butler/prefill` to return null dates. On the `/book` client, Butler date hydration is queued into the exact `dateRange` state the calendar uses and is re-applied after the auth gate resolves, so late villa resets or the guest/member gate cannot drop the decoded stay dates, and the visible calendar month now follows the hydrated `dateRange` so a December handoff opens on December rather than staying anchored to the current month. The `/book` auth gate also preserves the full current booking URL in its member sign-in redirect, so the signed handoff token survives the login round-trip instead of depending on session timing. No schema changes. No locked API behavior changes.
- **Phase 16B - admin payment settings + Step 3 decision foundation (this commit).** `/admin/settings` now manages the guest-facing payment mode (`request_only`, `manual_payment`, `online_payment`, `hybrid`), deposit minimum percentage, full/custom deposit availability, manual payment rails, guest payment instructions, bank-transfer public details, provider display name, and the guest-visible online-payment enabled flag through the existing `settings` table. `/book` Step 3 now presents two clear Reserve paths: `Pay now and reserve` and `Submit booking request and pay later`. The pay-now path still uses hosted-checkout amount validation and the existing `/api/payments/checkout` route, but it is blocked in the UI whenever the configured provider is not truly ready. The pay-later path keeps booking-first behavior, records payment preferences in the booking request context, and makes it explicit that no charge is collected on the website until Oraya confirms the stay. No schema change. No locked booking-creation behavior change.

- **Phase 16A - WhatsApp -> website identity continuity (2026-05-18 merge, PR #27).** `/api/bookings` POST now accepts an optional `butler_prefill_token` in the request body. After a successful insert, the locked route best-effort verifies the token (`lib/butler/prefill-token.ts`) and updates `whatsapp_leads.linked_booking_id` with a `.is("linked_booking_id", null)` race guard so an existing linkage is never overwritten. Verification failure, expired token, missing lead, conflicting linkage, and Supabase errors all log a server-side warning and return early - they **never** block booking creation. `/book` reads the token from sessionStorage at submit time, sends it in the booking POST body, and clears the token on success. Closes the lead -> booking provenance loop without changing locked-pipeline behavior on failure. See [DECISIONS_LOG.md](DECISIONS_LOG.md) - 2026-05-18 entry "WhatsApp lead -> booking provenance linkage in `/api/bookings` POST".

- **Phase 16A - Butler prefill villa alias normalization (2026-05-18 merge, PR #26).** [app/book/page.tsx](../../app/book/page.tsx) `normalizeVillaFromSearchParam` now folds the operator-facing aliases `Byblos`, `Byblos/Jbeil`, `Jbeil` -> `Villa Byblos` and `Mechmech`, `Mechmech/Annaya`, `Annaya` -> `Villa Mechmech` when normalizing both `?villa=` and Butler-prefilled villa values. Aliases are case-insensitive. Unknown villa labels pass through unchanged so the canonical villa selection check still rejects them.

- **Phase 16A - Butler continuation auto-advance readiness gate (2026-05-18 merge, PR #25).** The non-instant auto-advance from step 1 -> 2 on `/book` is now gated on (a) `butlerPrefillReady` (the `?h=...` handoff hydration has settled, success or failure) and (b) `availabilityReadyForSelection` (the availability fetch for the prefilled villa+check-in has settled and is not loading). Prevents auto-advance from firing before prefill or availability resolves and causing a flash-of-mismatched-step on slower connections.

- **Phase 16A.2.j - WhatsApp -> website prefill handoff (prior commit).** Added [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) and [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts) for a short-lived opaque handoff token signed with `BUTLER_PREFILL_SECRET`. POST `/api/butler/lead` now attempts to return an additive `prefill_url` after successful lead insert, but lead capture remains business-critical and **does not fail** if `BUTLER_PREFILL_SECRET` is missing - the URL is omitted instead. [app/book/page.tsx](../../app/book/page.tsx) now hydrates safe fields from `/api/butler/prefill?h=...` and strips `h` from the URL after success or failure. No schema changes. No locked-API touches. No raw booking data in the public URL. Normalized lead dates remain the only dates eligible for website prefill; raw WhatsApp text is never used for `/book` hydration.

- **Phase 16A.2.e - WhatsApp lead persistence + admin lead dashboard (this commit).** Added a new `whatsapp_leads` Supabase table (schema in [/sql/phase-16a2e-whatsapp-leads.sql](../../sql/phase-16a2e-whatsapp-leads.sql)) and the surfaces that read and write it:
  - `POST /api/butler/lead` ([app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts)) - first Butler write endpoint. Accepts the flexible WhatChimp payload (canonical `oraya_*` keys + short aliases), normalizes it via [lib/butler/leads.ts](../../lib/butler/leads.ts) `normalizeLeadInput`, inserts one row, returns `{ ok: true, lead_id, message }`. Reuses the existing 2026-05-12 Butler auth contract via `requireButlerAuth` (503 if env unset, 401 if header missing/wrong). Raw Supabase / driver errors collapse to a safe `{ ok: false, error: "server_error" }` 500 - never echoed.
  - `GET /api/admin/leads` ([app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts)) - admin list with optional `follow_up_status` / `request_type` / `villa` filters. `raw_payload` intentionally not returned in the list shape.
  - `PATCH /api/admin/leads/[id]` ([app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts)) - admin update for `follow_up_status` (allow-listed: `new`/`contacted`/`needs_action`/`converted`/`lost`/`spam`), `labels`, `admin_notes`, `linked_booking_id`. Identity fields (`source`/`phone`/`name`/dates/`raw_payload`) intentionally not mutable from PATCH in v1.
  - `/admin/leads` ([app/admin/leads/page.tsx](../../app/admin/leads/page.tsx)) - admin dashboard page. Status-filter bar, status badges + inline status change, `wa.me` link for the phone, inline `admin_notes` edit, empty state. Matches the existing inline-style admin visual convention. A new "Leads" link was added to the admin top-nav in [components/admin/AdminChrome.tsx](../../components/admin/AdminChrome.tsx) - the minimum non-invasive change needed to make the page discoverable.
  - RLS posture for `whatsapp_leads`: **enabled with NO policies**. Service role bypasses RLS so both the Butler ingest and admin routes (both server-only via `SUPABASE_SERVICE_ROLE_KEY`) can read/write. Any future anon/authenticated client query is denied by default. Stricter than the repo's existing operational tables (e.g. `booking_action_tokens` runs RLS off) and the choice is documented in the SQL file + [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-15 entry).
  - **No booking creation, no availability check, no DB writes outside `whatsapp_leads`, no email sends, no token issuance, no payment, no access details, no smart-lock, no new dependency.** Lead intake only - operators triage from `/admin/leads`. `BUTLER_WEBHOOK_SECRET` and `X-Butler-Secret` are reused unchanged; no new env var. Active sub-phase remains `flow-submit`; this is the operational backbone the future `flow-submit` will hand off to.
- **Phase 16A.2.d - Butler `availability` yes/no POST (this commit).** Added an **additive** `POST /api/butler/availability` handler alongside the existing 16A.1 GET. The new POST takes `{ villa, check_in, check_out, request_type?, event? }` and returns a safe `{ status: "available" | "unavailable" | "unclear", safe_message, ... }` shape WhatChimp can repeat to the guest. Wraps [lib/calendar/availability.ts](../../lib/calendar/availability.ts) `findAvailabilityConflict` - the same overlap logic the locked `/api/bookings` POST uses - so the Butler answer is consistent with the booking-creation answer. Extended [lib/butler/villa.ts](../../lib/butler/villa.ts) `resolveButlerVilla` to accept canonical names (`"Villa Byblos"`) in addition to slugs (`mechmech`/`byblos`); existing GET callers continue to work unchanged. Response shapes live in a new [lib/butler/availability-formatter.ts](../../lib/butler/availability-formatter.ts). Reuses the existing 2026-05-12 Butler auth contract via `requireButlerAuth` (503 if env unset, 401 if header missing/wrong). **No booking creation, no DB writes, no email, no token, no schema change, no new dependency.** Internal errors collapse to `status: "unclear"` - raw Supabase / driver messages are never echoed. Active sub-phase remains `flow-submit`; this is additional read-only Butler scaffolding.
- **Phase 16A.2.c - Butler `normalize-dates` read-only scaffolding (this commit).** Added [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts) and [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) - a secret-guarded `POST` endpoint that turns natural-language date text from WhatChimp (`"this Saturday"`, `"June 10"`, `"10 June 2026"`, `"two nights"`, `"24may"`, ISO) into a structured `{ check_in, check_out, nights, human_readable, safe_message }` suggestion. Returns `status: "clear"` when both dates parse, `status: "unclear"` otherwise; the `safe_message` always asks the Butler to echo back for guest confirmation before any availability check. Reuses the existing 2026-05-12 Butler auth contract via [lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth` (503 if env unset, 401 if header missing/wrong). **Does not create bookings, check availability, write DB rows, send emails, or issue tokens.** This is additional read-only Butler scaffolding for 16A.2 - the `flow-submit` adapter itself is still outstanding. See [DECISIONS_LOG.md](DECISIONS_LOG.md) - 2026-05-14 entry.
- **Phase 16A.1.x - Butler Playbook + minor hardening (this commit).** Established [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) as the operational source-of-truth for the AI Butler (identity, conversation behavior, availability/pricing/add-on philosophy, knowledge boundary, event vs stay separation, deferred future-phase systems, forbidden AI behaviors, cross-references). Extracted the duplicated villa-slug map from the addons + availability routes into a shared [lib/butler/villa.ts](../../lib/butler/villa.ts) helper (`resolveButlerVilla` + `KNOWN_BUTLER_VILLAS`). [ARCHITECTURE.md](ARCHITECTURE.md) Butler flow section cross-references the playbook. See [DECISIONS_LOG.md](DECISIONS_LOG.md) - 2026-05-12 "Butler Playbook established as operational source-of-truth". No code behavior change beyond the surgical helper extraction; same 503/401/200 contract on every `/api/butler/*` route.
- **Phase 16A.1 - Read-only Butler API foundation (prior commit).** Shipped:
  - [lib/butler/auth.ts](../../lib/butler/auth.ts) - `requireButlerAuth` helper. Validates `X-Butler-Secret` against `BUTLER_WEBHOOK_SECRET` using `crypto.timingSafeEqual`. 503 on missing/empty env; 401 on missing/wrong header.
  - [app/api/butler/health/route.ts](../../app/api/butler/health/route.ts) - liveness + secret check; returns `{ ok: true, service: "oraya-butler", mode: "read-only" }`.
  - [app/api/butler/event-types/route.ts](../../app/api/butler/event-types/route.ts) - projects `CANONICAL_EVENT_TYPES` from [lib/event-types.ts](../../lib/event-types.ts) into `{ value, label, description }`.
  - [app/api/butler/addons/route.ts](../../app/api/butler/addons/route.ts) - villa+context filtered add-ons with `event_type` optional. Prices and currency intentionally omitted; operational internals never echoed.
  - [app/api/butler/availability/route.ts](../../app/api/butler/availability/route.ts) - thin wrapper over `getMergedAvailabilityRanges` + heated-pool carryover. Does not modify or call the locked `/api/bookings/availability` route.
  - [ARCHITECTURE.md](ARCHITECTURE.md) - API surface table updated; new "Butler flow (Phase 16A.1 - read-only)" section added.
  - [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - `BUTLER_WEBHOOK_SECRET` flipped from "reserved/not consumed" to "consumed by /api/butler/* (live)".
  - No locked-API touches. No schema changes. No new dependencies. `npx tsc --noEmit` clean. `npm run build` clean.
- **Phase 16A.0 - Architecture freeze ([apps#10](https://github.com/Staleen/oraya-web/pull/10)).** Locked namespace `/api/butler/*`, secret name `BUTLER_WEBHOOK_SECRET`, source-of-truth boundary, implementation order. Documented in [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-12).
- **Phase 16A audit (2026-05-11).** Read-only architecture audit; conclusions recorded in the 2026-05-12 DECISIONS_LOG entry.
- **AI Project Bootstrap (prior phase).** `/docs/system/` is the durable AI source of truth.

## Open issues to be aware of right now

Pre-existing gaps that become more visible when 16A.2 ships:

- **WhatChimp remains an operational dependency outside this repo.**
  - The exported flow must stay aligned with the backend contract:
    - call `POST /api/butler/lead`
    - capture `prefill_url`
    - use that returned URL in the outgoing WhatsApp reply
  - If WhatChimp drifts back to a static `/book` link, guests lose the secure continuation benefit even though the backend is healthy.

- **Booking reference is a public support code, not an access PIN.** The 8-character uppercased prefix of `bookings.id` that appears on `/booking/view/[token]` and in emails is intentionally a guest-facing support reference only. There is **no access PIN, smart-lock PIN, or gate code** in Phase 16A or Phase 16B. Access credential issuance is Phase 16D (smart lock). The Butler must never present the booking reference as an access PIN or imply it grants entry.

- **BUTLER_PREFILL_SECRET must be set in Vercel for website handoff.** Without it, POST /api/butler/lead still succeeds but omits `prefill_url`, and `/api/butler/prefill` cannot verify tokens. This is an intentional business-continuity trade-off for lead capture, but production needs the env set before the handoff can be relied on. The same secret is now consumed by `/api/bookings` POST to verify `butler_prefill_token` for identity-continuity linkage - failure to verify is non-blocking; the booking still goes through.

- **Missing `RESEND_API_KEY` is a stealth failure.** The Butler tells guests "you'll get an email confirmation"; without Resend wired, no email goes out and no error surfaces. 16A.2 should refuse submissions when the key is unset in production. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #2.
- **Missing `NEXT_PUBLIC_SITE_URL` on preview links to production.** When 16A.2 echoes a booking view URL, preview-environment Butler messages would point at live data. Set `NEXT_PUBLIC_SITE_URL` on Vercel Preview before 16A.2 ships. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #3.
- **`BUTLER_WEBHOOK_SECRET` not yet in Vercel.** This PR wires the consumer but does not populate the Vercel env panel. Production and Preview need the value set (Sensitive) before WhatChimp can call any `/api/butler/*` route in those environments. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #4.
- **DECISIONS_LOG header-name example drift.** The 2026-05-12 DECISIONS_LOG entry used `X-Butler-Auth` as an illustrative header name; the actual implementation in 16A.1 uses `X-Butler-Secret` per the 16A.1 task spec. Architecturally identical ("shared secret in header"); only the header name differs. Not worth a superseding DECISIONS_LOG entry - flagged here for future agents reading old context.
- **Payment remains Phase 16B.** Instant-book UI exists, but WhatsApp and the website continuation path must not imply payment completion, payment collection, refund handling, or any final paid confirmation state.
- **Payment-provider envs are now required for the hosted Reserve payment path.** Missing or incomplete provider configuration no longer means "feature unavailable only on paper" - it means Step 3 can create a booking row but fail to start hosted checkout, leaving the guest on `/booking/view/[token]?payment=setup_failed` until Oraya follows up manually.

## Out of scope this phase (16A.2)

- No schema changes without explicit approval in the task prompt - even for the idempotency table. If a new `butler_submissions` table is chosen over the jsonb-enrichment path, that decision goes through a separate approval gate.
- No payment / refund flow over WhatsApp. Phase 16B.
- No refunds automation or manual-transfer rails in this hosted-checkout refactor step. Those remain later 16B work.
- No smart-lock PIN issuance or access-code delivery. Phase 16D.
- No member -> phone linkage. Every Butler-originated booking is the guest path. A future phase ships the verification flow.
- No AI prompt engineering in this repo. AI Training, Bot Reply, Labels, and Custom Fields live in WhatChimp.
- No `/api/bookings` POST behavior change. The adapter normalizes the Flow payload into the existing body shape - pricing/overlap/addon audit remain the locked source of truth.
- No locked-API touches. `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, the email senders, the auth/token systems, and existing schema remain off-limits.
- No widening of `/api/settings` allowlist to satisfy WhatChimp. Butler reads belong under `/api/butler/*`.
- No `NEXT_PUBLIC_BUTLER_*` env vars. Server-only.

## Next recommended steps

In order:

1. **Human action:** confirm the real bank gateway contract for Credit Libanais / MPGS: merchant id, API endpoint, auth secret/key/certificate, callback verification method, and settlement/currency rules.
2. **Human action:** set `PAYMENT_PROVIDER` and the matching provider secrets in Vercel Preview + Production, then register the real provider callback URL for each environment.
3. **Human action:** confirm `NEXT_PUBLIC_SITE_URL` is set correctly in Preview + Production so hosted-payment success/cancel returns land on the right booking-view host.
4. **16A.2 implementation (next coding session):** design and ship `POST /api/butler/flow-submit` per "Active objective" above without bypassing the locked `/api/bookings` authority.
5. **Next 16B increment:** real Credit Libanais / MPGS adapter implementation, then admin payment controls / link reissue / payment refresh and the separate refund workflow, then WhatsApp payment-status replies only after identity-safe continuity remains stable.
