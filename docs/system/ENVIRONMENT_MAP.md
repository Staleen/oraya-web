# Oraya Web — Environment Variable Map

**Purpose:** single source of truth for every environment variable the Oraya web app reads, where it is consumed, who owns the secret, and what breaks if it is missing.

**Scope:** all `process.env.*` reads in the repo as of this commit. Re-run the audit (`grep -rn "process\.env\." app lib components scripts`) after every release that touches API routes, lib helpers, or `vercel.json`.

> ⚠️ **Never commit real values.** This document and `.env.example` contain placeholder names only. Real values live in `.env.local` (gitignored) for local dev and in the Vercel Project → Settings → Environment Variables panel for preview/production.

---

## At-a-glance inventory

| Variable | Scope | Required local | Required preview | Required prod | Configure in Vercel? |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | yes | yes | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | yes | yes | yes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | yes (full flow) | yes | yes | yes |
| `RESEND_API_KEY` | server-only | optional (email becomes a no-op) | yes | yes | yes |
| `NEXT_PUBLIC_SITE_URL` | public | optional (falls back) | recommended | recommended | yes |
| `BOOKING_ACTION_SECRET` | server-only | yes | yes | yes | yes |
| `CRON_SECRET` | server-only | optional (cron only fires in Vercel) | yes (Vercel auto-injects for Cron) | yes (Vercel auto-injects for Cron) | yes |
| `ADMIN_SECRET` | server-only | yes (admin login + admin APIs) | yes | yes | yes |
| `BUTLER_WEBHOOK_SECRET` | server-only | optional (no consumer yet) | not yet required | not yet required | not yet — wire in Phase 16A.1 |
| `NODE_ENV` | system | auto | auto | auto | n/a (Next.js / Vercel sets) |

Public vs server-only:

- **public** — prefixed `NEXT_PUBLIC_`, inlined into the browser bundle by Next.js at build time. Treat as world-readable.
- **server-only** — only available in Node runtimes (API routes, server components, lib helpers imported from server code). Never read from a `"use client"` component.

---

## Per-variable detail

### `NEXT_PUBLIC_SUPABASE_URL`

- **Scope:** public (browser + server).
- **Used in:**
  - [lib/supabase.ts:7](lib/supabase.ts:7) — browser/anon client.
  - [lib/supabase-admin.ts:16](lib/supabase-admin.ts:16) — server admin client.
  - [app/api/admin/bookings/[id]/route.ts:18](app/api/admin/bookings/%5Bid%5D/route.ts:18) — admin booking read/update guard.
  - [app/api/admin/bookings/[id]/approve-addon/route.ts:7](app/api/admin/bookings/%5Bid%5D/approve-addon/route.ts:7) — admin addon approval guard.
- **Required:** local · preview · production.
- **Where to get it:** Supabase Dashboard → Project Settings → API → **Project URL** (e.g. `https://abcd1234.supabase.co`).
- **Configure in Vercel:** yes — Production + Preview + Development scopes.
- **Risk if missing:** every Supabase call (auth, members, bookings, addons, calendar sync, admin) throws. The lazy `Proxy` in `lib/supabase.ts` and `lib/supabase-admin.ts` only defers the failure to first use — it does not eliminate it.
- **Detectable status:** routes throw `[api/admin/bookings] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set` (admin endpoints have an explicit guard message).

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- **Scope:** public (browser).
- **Used in:**
  - [lib/supabase.ts:8](lib/supabase.ts:8) — only consumer.
- **Required:** local · preview · production.
- **Where to get it:** Supabase Dashboard → Project Settings → API → **Project API keys → `anon` public**.
- **Configure in Vercel:** yes — Production + Preview + Development scopes.
- **Risk if missing:** browser-side Supabase fails to initialise. Auth, member dashboards, the public booking flow, and any client component that imports `@/lib/supabase` are broken end-to-end.

### `SUPABASE_SERVICE_ROLE_KEY`

- **Scope:** server-only. **Never expose in a `"use client"` component or any `NEXT_PUBLIC_*` variable.**
- **Used in:**
  - [lib/supabase-admin.ts:17](lib/supabase-admin.ts:17) — module-level admin client used by every server route that bypasses RLS.
  - [app/api/admin/bookings/[id]/route.ts:19](app/api/admin/bookings/%5Bid%5D/route.ts:19) — admin booking guard.
  - [app/api/admin/bookings/[id]/approve-addon/route.ts:8](app/api/admin/bookings/%5Bid%5D/approve-addon/route.ts:8) — admin addon approval guard.
- **Required:** local (for the full admin/cron/email flow) · preview · production.
- **Where to get it:** Supabase Dashboard → Project Settings → API → **Project API keys → `service_role` (secret)**. Click the eye icon to reveal once.
- **Configure in Vercel:** yes — Production + Preview + Development. Mark as Sensitive.
- **Risk if missing:** RLS-bypassing server paths fail with `supabaseKey is required` (per the comment in `.env.example` and `README.md`). Affects: admin dashboard, addon approvals, booking server-side writes, calendar sync, member profile creation, signed booking links and the data behind every transactional email.
- **Rotation:** rotating the service role in Supabase invalidates this key everywhere — update Vercel + every developer's `.env.local` simultaneously.

### `RESEND_API_KEY`

- **Scope:** server-only.
- **Used in:**
  - [lib/send-booking-email.ts:119](lib/send-booking-email.ts:119) — confirmed booking email.
  - [lib/send-booking-pending-email.ts:114](lib/send-booking-pending-email.ts:114) — pending booking notification.
  - [lib/send-booking-payment-email.ts:231](lib/send-booking-payment-email.ts:231) — payment confirmation email.
  - [lib/send-booking-request-email.ts:271](lib/send-booking-request-email.ts:271) — booking request → admin email.
  - [lib/send-event-confirmation-email.ts:68](lib/send-event-confirmation-email.ts:68) — event booking confirmation.
  - [lib/send-event-proposal-email.ts:187](lib/send-event-proposal-email.ts:187) — event proposal to guest.
  - [lib/send-event-proposal-response-email.ts:133](lib/send-event-proposal-response-email.ts:133) — guest accept/decline reply email.
  - [lib/send-feedback-request-email.ts:116](lib/send-feedback-request-email.ts:116) — post-stay feedback request.
- **Required:** local is optional (each sender logs and skips when missing — no throw); preview · production are required.
- **Where to get it:** [resend.com](https://resend.com) → Dashboard → **API Keys** → create a key with sending permission for the verified `stayoraya.com` domain.
- **Configure in Vercel:** yes — Production + Preview. Mark as Sensitive.
- **Risk if missing:** every transactional email becomes a silent no-op. Bookings still write to the DB, but the guest never receives confirmation, the admin loses notification, and event proposals/responses are not delivered. No user-facing error — this is a stealth failure.
- **Rotation:** keys are revocable in the Resend dashboard. Multiple keys can coexist during rollover.

### `RESEND_FROM_EMAIL` — removed by decision (2026-05-09)

- **Status:** **not an env var of this project.** Removed from `.env.example` on 2026-05-09 to avoid false expectations. Future operators should not set it in Vercel — it has no consumer.
- **Current behavior:** the Resend `from` address is hardcoded as `Oraya Reservations <bookings@stayoraya.com>` in each `lib/send-*-email.ts` (`FROM_EMAIL` constant). This is intentional for now.
- **If you need a configurable sender:** that is a separate, approved implementation task (wire `process.env.RESEND_FROM_EMAIL` into each `lib/send-*-email.ts` and re-add the variable here and in `.env.example`). Do not introduce it ad-hoc.
- **Reference:** [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-09 entry "`RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded".

### `NEXT_PUBLIC_SITE_URL`

- **Scope:** public.
- **Used in:**
  - [app/api/bookings/route.ts:744](app/api/bookings/route.ts:744) — base for booking links embedded in confirmation emails.
  - [lib/send-booking-email.ts:141](lib/send-booking-email.ts:141), [lib/send-booking-pending-email.ts:121](lib/send-booking-pending-email.ts:121), [lib/send-booking-payment-email.ts:220](lib/send-booking-payment-email.ts:220), [lib/send-event-confirmation-email.ts:60](lib/send-event-confirmation-email.ts:60), [lib/send-event-proposal-email.ts:70](lib/send-event-proposal-email.ts:70) — base URL for email CTA links and absolute asset references.
- **Fallback:** every consumer falls back to `SITE_URL` from [lib/brand.ts:6](lib/brand.ts:6) (currently `https://stayoraya.com`).
- **Required:** local optional (fallback works) · preview recommended (set to the Vercel preview URL so test emails link to the preview deployment) · production recommended (canonical `https://stayoraya.com`).
- **Where to get it:**
  - **Production:** the canonical site origin (`https://stayoraya.com`).
  - **Preview:** the per-deployment Vercel URL, or set to `https://$VERCEL_URL` style if reuse is acceptable.
  - **Local:** `http://localhost:3000` (only matters if you want emails sent from `npm run dev` to link back locally).
- **Configure in Vercel:** yes for previews and production (so emails sent from a non-prod environment do not silently link to live).
- **Risk if missing:** no errors — emails still send. But every link inside email bodies points to `https://stayoraya.com`, even from preview/local. Guests testing on preview would land on production data, which is misleading and dangerous for staging email tests.

### `BOOKING_ACTION_SECRET`

- **Scope:** server-only.
- **Used in:**
  - [lib/booking-action-token.ts:22](lib/booking-action-token.ts:22) — required for HMAC signing/verification of booking action tokens (admin confirm/cancel and the Phase 6 guest "view" link).
- **Required:** local · preview · production. **No fallback** — the helper throws on first use if the secret is missing or whitespace-only.
- **Where to get it:** generate a high-entropy random secret, e.g. `openssl rand -base64 32`. Treat it as you would a JWT signing key.
- **Configure in Vercel:** yes — Production + Preview + Development. Mark as Sensitive. **Use the same value across all environments only if you want preview tokens to be redeemable in production (you usually do not).**
- **Risk if missing:** any code path that creates or verifies a booking action token throws `[booking-action-token] BOOKING_ACTION_SECRET is required …`. That breaks: emailed booking links, admin confirm/cancel actions, and the booking-view page. Booking writes themselves still succeed but the follow-up email cannot be assembled.
- **Rotation:** rotating invalidates every outstanding signed link (admin confirm/cancel and guest view tokens, default 72 h TTL). Schedule rotations during low-traffic windows.

### `CRON_SECRET`

- **Scope:** server-only.
- **Used in:**
  - [app/api/cron/calendar-sync/route.ts:18](app/api/cron/calendar-sync/route.ts:18) — bearer-token guard on the cron endpoint (`Authorization: Bearer ${CRON_SECRET}`).
- **Cron schedule:** `0 0 * * *` daily, defined in [vercel.json:5](vercel.json:5).
- **Required:** local optional (no scheduler runs locally; you can still hit the route manually if you set it) · preview/production required.
- **Where to get it:** generate a random secret (`openssl rand -hex 32`) and store it in Vercel. Vercel's Cron product reads this env var and injects the bearer header automatically when invoking the cron path — see Vercel's [cron-jobs documentation](https://vercel.com/docs/cron-jobs).
- **Configure in Vercel:** yes — Production + Preview. Mark as Sensitive.
- **Risk if missing:** the cron endpoint returns `401 Unauthorized` and `runCalendarSync` never runs. Effect: external iCal blocking sources stop refreshing → availability drifts away from reality → double-booking risk.
- **Manual invocation (dev/staging):** `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/calendar-sync`.

### `ADMIN_SECRET`

- **Scope:** server-only.
- **Used in:**
  - [lib/admin-auth.ts:10](lib/admin-auth.ts:10) — HMAC key for the signed `oraya_admin` session cookie and the bearer-fallback path on every `/api/admin/*` route guard.
  - [app/api/admin/verify-password/route.ts:9](app/api/admin/verify-password/route.ts:9) — required before issuing the signed admin session cookie after password check.
- **Required:** local (admin login) · preview · production. No fallback.
- **Where to get it:** generate (`openssl rand -base64 32`) and store. Distinct from `BOOKING_ACTION_SECRET` and `CRON_SECRET` — do not reuse.
- **Configure in Vercel:** yes — Production + Preview + Development. Mark as Sensitive.
- **Risk if missing:** every admin route returns `503 Server misconfiguration: ADMIN_SECRET is not set.` (see [lib/admin-auth.ts:73-77](lib/admin-auth.ts:73)). Admin password verification cannot mint cookies. The whole `/admin` surface area is locked out.
- **Rotation:** rotating immediately invalidates all live admin sessions (every signed cookie's HMAC fails verification). Force a re-login.

### `BUTLER_WEBHOOK_SECRET`

- **Scope:** server-only. **Never expose in a `"use client"` component or any `NEXT_PUBLIC_*` variable.**
- **Status:** **reserved by decision (2026-05-12), not yet consumed.** No `process.env.BUTLER_WEBHOOK_SECRET` read exists in the repo as of this commit. Wiring lands in Phase 16A.1 as the shared-secret guard on the read-only `/api/butler/*` endpoints (health, event-types, addons, availability).
- **Used in:** none yet — see status above. Phase 16A.1 will introduce a `lib/butler/auth.ts` helper that compares an inbound `X-Butler-Auth` header against this value, used by every `/api/butler/*` route.
- **Required:** local optional (only needed to test Butler endpoints against a synthetic caller) · preview not yet required (becomes required once 16A.1 ships) · production not yet required (becomes required once 16A.1 ships).
- **Where to get it:** generate (`openssl rand -base64 32`). Distinct from `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `ADMIN_SECRET` — do not reuse.
- **Configure in Vercel:** not yet — defer until the Phase 16A.1 PR that wires the first consumer. Once wired: Production + Preview, marked Sensitive. Different value per environment recommended (so a leaked preview secret cannot authorize production Butler calls).
- **Risk if missing (after 16A.1):** every `/api/butler/*` endpoint returns 401, blocking the WhatsApp AI Butler from reading add-ons / event types / availability through the supported channel. The locked production endpoints (`/api/bookings*`, `/api/admin/*`, etc.) are unaffected — they have their own guards.
- **Rotation:** rotating immediately invalidates the WhatChimp outbound webhook header; rotate the WhatChimp side in the same change window. A short overlap window via a future `BUTLER_WEBHOOK_SECRET_PREVIOUS` accepter is out of scope until proven necessary.
- **Reference:** [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-12 entry "Phase 16A Butler architecture freeze — `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`".

### `NODE_ENV`

- **Scope:** system; managed by Next.js and Vercel — **do not set manually**.
- **Used in:**
  - [lib/admin-auth.ts:99](lib/admin-auth.ts:99), [lib/admin-auth.ts:111](lib/admin-auth.ts:111) — admin session cookie `secure` flag is enabled only in production.
  - [app/api/bookings/route.ts:318](app/api/bookings/route.ts:318), [app/api/bookings/route.ts:630](app/api/bookings/route.ts:630) — verbose dev-only logging.
- **Configure in Vercel:** no.
- **Risk if missing/wrong:** if accidentally set to `production` in `.env.local`, dev cookies become `secure: true` and will not be sent over `http://localhost`. Conversely, never set it to `development` in Vercel.

---

## Vercel configuration checklist

For each non-`NODE_ENV` variable above, confirm in **Vercel → Project → Settings → Environment Variables** that:

1. The variable exists.
2. It is enabled for the right environments (Production / Preview / Development).
3. Sensitive variables (everything except `NEXT_PUBLIC_*`) are marked **Sensitive** so the value is masked after creation.
4. Variable names match exactly — Vercel is case-sensitive and treats trailing whitespace as part of the value.

A redeploy is required after adding or editing any variable; existing deployments keep their build-time snapshot.

---

## Local setup checklist (developers)

1. Copy `.env.example` to `.env.local` (do **not** commit).
2. Fill values from the sources listed above. Minimum to run the public site without admin/cron flows: the two `NEXT_PUBLIC_SUPABASE_*` keys.
3. To exercise the full flow locally — admin, cron, addon approvals, transactional emails — also set `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `BOOKING_ACTION_SECRET`, `ADMIN_SECRET`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
4. `CRON_SECRET` is only needed locally if you intend to `curl` the cron endpoint by hand.
5. Restart `npm run dev` after editing `.env.local` — Next.js does **not** hot-reload env vars.

---

## Audit hygiene

- Re-run `grep -rn "process\.env\." app lib components scripts` whenever a new server route, lib helper, or background job is added — confirm any new variable is documented here and added to `.env.example`.
- The `.env.example` file in repo root and this map must list the same set of variables. Diff them as part of release review.

## Known gaps / follow-ups

- No env var currently controls the WhatsApp support number — it is read at runtime from the Supabase `settings` table (`whatsapp_number` row) via [app/book/page.tsx:952](app/book/page.tsx:952). If/when that becomes an env var, add it here.
