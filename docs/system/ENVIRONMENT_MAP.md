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
| `BUTLER_WEBHOOK_SECRET` | server-only | optional (only for Butler endpoint testing) | yes (once WhatChimp is wired) | yes (once WhatChimp is wired) | yes — Sensitive |
| `BUTLER_PREFILL_SECRET` | server-only | optional (only for WhatsApp -> /book prefill testing) | yes (once the handoff is wired) | yes (once the handoff is wired) | yes - Sensitive |
| `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL` | server-only | no (unset = dispatch off) | **no — keep unset** (fail closed) | yes at activation (after Meta template approval + WhatChimp workflow) | yes — Sensitive, Production only |
| `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_SECRET` | server-only | no | no | optional (only if the WhatChimp workflow verifies a shared-secret header) | yes — Sensitive, if used |
| `WHATSAPP_CONFIRMATION_ALLOW_NONPROD` | server-only | no | **no — set `true` only during a supervised test** | **never** | only temporarily on Preview |
| `PAYMENT_PROVIDER` | server-only | optional (defaults to `stripe` only outside production) | yes | yes | yes |
| `NETCOMMERCE_CYBERSOURCE_ENVIRONMENT` | server-only | yes (sandbox test) | yes | yes | yes |
| `NETCOMMERCE_CYBERSOURCE_MERCHANT_ID` | server-only | yes (sandbox test) | yes | yes | yes - Sensitive |
| `NETCOMMERCE_CYBERSOURCE_KEY_ID` | server-only | yes (sandbox test) | yes | yes | yes - Sensitive |
| `NETCOMMERCE_CYBERSOURCE_SHARED_SECRET` | server-only | yes (sandbox test) | yes | yes | yes - Sensitive |
| `NETCOMMERCE_CYBERSOURCE_API_BASE_URL` | server-only | yes (sandbox test) | yes | yes | yes |
| `NETCOMMERCE_CYBERSOURCE_COUNTRY` | server-only | yes (sandbox test) | yes | yes | yes |
| `NETCOMMERCE_CYBERSOURCE_LOCALE` | server-only | yes (sandbox test) | yes | yes | yes |
| `NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID` | server-only | optional for sandbox completion; required for webhook reconciliation | optional for sandbox checkout; yes for webhook test | yes before live rollout | yes - Sensitive |
| `NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY` | server-only | optional for sandbox completion; required for webhook reconciliation | optional for sandbox checkout; yes for webhook test | yes before live rollout | yes - Sensitive |
| `NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID` | server-only | optional for sandbox completion; required for webhook reconciliation | optional for sandbox checkout; yes for webhook test | yes before live rollout | yes - Sensitive |
| `STRIPE_SECRET_KEY` | server-only | optional (Stripe local/dev test only) | optional | optional | optional |
| `STRIPE_WEBHOOK_SECRET` | server-only | optional (Stripe local/dev webhook only) | optional | optional | optional |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public | optional (Stripe local/dev only) | optional | optional | optional |
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
  - **Local:** `http://localhost:3000` for general app testing and local email links.
  - **CyberSource sandbox browser testing:** Unified Checkout requires the payment page origin in the capture context to be HTTPS. Use Vercel Preview, production, or a local HTTPS tunnel for real browser payment UI validation; plain `http://localhost:3000` cannot complete the Unified Checkout browser flow.
- **Configure in Vercel:** yes for previews and production (so emails sent from a non-prod environment do not silently link to live).
- **Risk if missing:** no errors — emails still send. But every link inside email bodies points to `https://stayoraya.com`, even from preview/local. Guests testing on preview would land on production data, which is misleading and dangerous for staging email tests. For CyberSource, a non-HTTPS local origin causes capture-context or browser SDK validation to fail before payment UI can mount.
- **Payment-link behavior:** Phase 16B payment execution routes resolve `/payments/checkout/[token]`, payment return, and payment booking-view URLs from the current request origin when running on Vercel Preview. This prevents Preview-hosted checkout links from falling back to the production host when the Preview env value is stale or missing. Production still falls back to the canonical `https://stayoraya.com` origin. Transactional email and Butler link generation still depend on `NEXT_PUBLIC_SITE_URL` or the canonical fallback.

### Vercel Preview CyberSource sandbox checklist

For a Draft PR / Preview deployment that validates the NetCommerce / Credit Libanais CyberSource sandbox flow, configure these variable names in Vercel Preview only, with sandbox values and no production activation. Do not commit real merchant values, shared secrets, capture contexts, card numbers, signed checkout URLs, or private Vercel share links to this repository.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOOKING_ACTION_SECRET`
- `PAYMENT_PROVIDER`
- `NETCOMMERCE_CYBERSOURCE_ENVIRONMENT`
- `NETCOMMERCE_CYBERSOURCE_MERCHANT_ID`
- `NETCOMMERCE_CYBERSOURCE_KEY_ID`
- `NETCOMMERCE_CYBERSOURCE_SHARED_SECRET`
- `NETCOMMERCE_CYBERSOURCE_API_BASE_URL`
- `NETCOMMERCE_CYBERSOURCE_COUNTRY`
- `NETCOMMERCE_CYBERSOURCE_LOCALE`
- `NEXT_PUBLIC_SITE_URL`

Preview expectations:

- `PAYMENT_PROVIDER` should select `credit_libanais`.
- `NETCOMMERCE_CYBERSOURCE_ENVIRONMENT` should be sandbox.
- `NETCOMMERCE_CYBERSOURCE_API_BASE_URL` should point to the CyberSource test API host.
- `NETCOMMERCE_CYBERSOURCE_COUNTRY` should be the bank-confirmed country code, currently expected as `LB`.
- `NETCOMMERCE_CYBERSOURCE_LOCALE` should be the bank-confirmed locale, currently expected as `en_US`.
- `NEXT_PUBLIC_SITE_URL` should be the HTTPS Vercel Preview origin used for the payment page, because CyberSource validates the capture-context target origin.
- Payment checkout routes use the actual Vercel Preview request origin for payment-link generation, so the tested branch alias and generated checkout links should stay on the same HTTPS host.
- The webhook/MLE variables are optional for this sandbox server-side completion test. They are required before production live rollout and before asynchronous webhook reconciliation can be trusted.
- Browser redirects remain informational. Server-side CyberSource authorization and/or a verified webhook are authoritative for payment state.
- PR #64 passed the approved-card sandbox path, NetCommerce confirmed successful testing, and the implementation was merged on 2026-07-02. Declined-card validation remains pending until NetCommerce/CyberSource provides an official declined-card vector or decline trigger.
- Production checkout remains code-gated off even if production credentials are later supplied. Webhook/MLE reconciliation and explicit live rollout controls must be implemented and approved before the adapter can report production checkout ready. Never copy Preview sandbox values into Production as a shortcut.

### `BOOKING_ACTION_SECRET`

- **Scope:** server-only.
- **Used in:**
  - [lib/booking-action-token.ts:22](lib/booking-action-token.ts:22) — required for HMAC signing/verification of booking action tokens (admin confirm/cancel and the Phase 6 guest "view" link).
  - [lib/profile/member-booking-view.ts](../../lib/profile/member-booking-view.ts) — member-profile mint of relative `/booking/view/[token]` paths via `POST /api/profile/booking-view` (import of `createActionToken` only; default temporary TTL, remintable while owned).
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
- **Status:** **live as of Phase 16A.1.** Consumed by [lib/butler/auth.ts](lib/butler/auth.ts) `requireButlerAuth`, which guards every `/api/butler/*` route.
- **Used in:**
  - [lib/butler/auth.ts](lib/butler/auth.ts) — sole reader. Compares the inbound `X-Butler-Secret` header against this value using `crypto.timingSafeEqual`.
  - Transitive guard on [app/api/butler/health/route.ts](app/api/butler/health/route.ts), [app/api/butler/event-types/route.ts](app/api/butler/event-types/route.ts), [app/api/butler/addons/route.ts](app/api/butler/addons/route.ts), [app/api/butler/availability/route.ts](app/api/butler/availability/route.ts).
- **Required:** local optional (only needed when you want to curl Butler endpoints against `npm run dev`) · preview yes (once WhatChimp is wired against the preview environment) · production yes (once WhatChimp is wired against production).
- **Where to get it:** generate (`openssl rand -base64 32`). Distinct from `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `ADMIN_SECRET` — do not reuse.
- **Configure in Vercel:** yes — Production + Preview, marked Sensitive. Different value per environment strongly recommended (so a leaked preview secret cannot authorize production Butler calls).
- **Header name:** inbound `X-Butler-Secret`. (The 2026-05-12 DECISIONS_LOG entry illustrated this with `X-Butler-Auth`; the implemented name in 16A.1 is `X-Butler-Secret`. Architecturally identical — shared secret in header — only the canonical header label differs.)
- **WhatChimp usage:** `BUTLER_WEBHOOK_SECRET` is the value WhatChimp sends in the `X-Butler-Secret` header on every `/api/butler/*` HTTP API call (e.g. Oraya Identify - Production → `/api/butler/identify`). WhatChimp stores it **privately** in its own HTTP API header config — it is never placed in a WhatChimp flow export, this repo, docs, or any guest-facing surface. Because the value lives in two places (Vercel env + WhatChimp header), **rotating requires updating both together**: change the Vercel value and the WhatChimp header in the same change window, or the Butler calls start returning 401.
- **Risk if missing:** every `/api/butler/*` endpoint returns 503 ("Server misconfiguration: BUTLER_WEBHOOK_SECRET is not set."). The Butler is dark; the locked production endpoints (`/api/bookings*`, `/api/admin/*`, etc.) are unaffected — they have their own guards.
- **Risk if header missing or wrong:** 401 Unauthorized.
- **Rotation:** rotating immediately invalidates the WhatChimp outbound webhook header; rotate the WhatChimp side in the same change window. A short overlap window via a future `BUTLER_WEBHOOK_SECRET_PREVIOUS` accepter is out of scope until proven necessary.
- **Reference:** [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-12 entry "Phase 16A Butler architecture freeze — `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`".

### `BUTLER_PREFILL_SECRET`

- **Scope:** server-only. **Never expose in a `"use client"` component or any `NEXT_PUBLIC_*` variable.**
- **Status:** live for the WhatsApp -> website prefill handoff.
- **Used in:**
  - [lib/butler/prefill-token.ts](lib/butler/prefill-token.ts) - HMAC signing and verification for short-lived opaque prefill tokens.
  - [app/api/butler/prefill/route.ts](app/api/butler/prefill/route.ts) - public token-auth prefill endpoint.
  - [app/api/butler/lead/route.ts](app/api/butler/lead/route.ts) - additive `prefill_url` issuance after successful lead insert.
- **Required:** local optional (lead capture still succeeds without it; prefill URL is omitted); preview yes once the handoff is tested there; production yes once the handoff is live.
- **Where to get it:** generate (`openssl rand -base64 32`). Distinct from `BUTLER_WEBHOOK_SECRET`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, and `ADMIN_SECRET` - do not reuse.
- **Configure in Vercel:** yes - Production + Preview, marked Sensitive. Different value per environment strongly recommended.
- **Risk if missing:** `POST /api/butler/lead` still succeeds, but it omits `prefill_url`. `GET /api/butler/prefill` treats tokens as invalid because verification cannot run.
- **Security contract:** token payload is opaque HMAC-signed data only; raw booking intent and PII are not placed in the public URL. The public prefill route returns a strict allow-list only.

### `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL`

- **Scope:** server-only. **Never expose in a `"use client"` component or any `NEXT_PUBLIC_*` variable. Never log the full value.**
- **Status:** Phase 16C automatic WhatsApp Arrival Guide dispatch. **Presence is the activation switch** — while unset, the dispatcher logs a safe "skipped: not_configured" line and makes no outbound call; booking confirmation and the confirmed email are unaffected.
- **Used in:** [lib/whatsapp/confirmed-stay-notification.ts](../../lib/whatsapp/confirmed-stay-notification.ts) — sole reader. The two authoritative confirmation writers ([app/api/booking-action/route.ts](../../app/api/booking-action/route.ts), [app/api/admin/bookings/[id]/route.ts](../../app/api/admin/bookings/%5Bid%5D/route.ts)) call the dispatcher after a stay booking is confirmed.
- **Required:** local no · preview **no — keep unset (fail closed; Preview shares the production database)** · production yes, but **only at activation**: after Meta approves `oraya_booking_confirmed_arrival_guide_v1`, WhatChimp syncs the template, and the WhatChimp Webhook Workflow exists.
- **Where to get it:** the WhatChimp Webhook Workflow URL from the WhatChimp platform (operator-created; not stored in this repo).
- **Configure in Vercel:** yes — Production only, marked Sensitive.
- **Risk if missing:** WhatsApp automation is simply off; the Stage 4A admin "Copy Arrival Guide link" manual flow still works.
- **Risk if leaked:** anyone holding the URL can trigger the WhatChimp workflow — treat it as a capability credential; rotate on the WhatChimp side if exposed.

### `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_SECRET`

- **Scope:** server-only. Optional.
- **Used in:** [lib/whatsapp/confirmed-stay-notification.ts](../../lib/whatsapp/confirmed-stay-notification.ts) — when set, sent as the outbound `X-Oraya-Webhook-Secret` header on the webhook POST. When unset, no header is sent and dispatch proceeds (the secret is optional by contract).
- **Required:** no in all environments. Set only if the WhatChimp Webhook Workflow is configured to verify a shared-secret header.
- **Where to get it:** generate (`openssl rand -base64 32`); configure the same value on the WhatChimp workflow. Distinct from every other secret — do not reuse.
- **Configure in Vercel:** yes if used — Production only, marked Sensitive.

### `WHATSAPP_CONFIRMATION_ALLOW_NONPROD`

- **Scope:** server-only.
- **Used in:** [lib/whatsapp/confirmed-stay-notification.ts](../../lib/whatsapp/confirmed-stay-notification.ts) — outside `VERCEL_ENV === "production"`, dispatch is skipped ("skipped: non_production") unless this is exactly the string `true`.
- **Required:** never in normal operation. Set `true` only on a Preview deployment during a deliberate, supervised test against a **disposable** WhatChimp workflow — and remove it immediately after. **Warning:** Preview shares the production Supabase database, so a Preview dispatch consumes the real booking's one-shot `whatsapp_confirmation_sent_at` claim and can message a real guest.
- **Configure in Vercel:** only temporarily, Preview scope only. Never in Production (production does not read it).

### `PAYMENT_PROVIDER`

- **Scope:** server-only.
- **Used in:**
  - [lib/payments/runtime.ts](../../lib/payments/runtime.ts) - selects the hosted-checkout adapter used by [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts).
- **Required:** local optional (defaults to `stripe` only outside production) · preview yes · production yes.
- **Allowed values today:** `credit_libanais`, `stripe`.
- **Configure in Vercel:** yes — Production + Preview, plus Development if you want local parity.
- **Risk if missing:** in `NODE_ENV=production`, checkout fails closed with a configuration error and no provider is selected. Outside production, runtime defaults to Stripe so local/dev can still exercise the hosted checkout flow intentionally.
- **Operational note:** Credit Libanais / NetCommerce / CyberSource Unified Checkout is the approved Oraya production direction. `PAYMENT_PROVIDER=stripe` is accepted only outside production for isolated local/dev testing.
- **Admin/runtime note:** non-secret readiness is surfaced to admins via `/api/payments/readiness` and `/admin/settings`; raw env values are never returned there.

### `NETCOMMERCE_CYBERSOURCE_ENVIRONMENT`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - labels Credit Libanais / NetCommerce runtime as `sandbox` or `production`.
- **Required:** local yes for sandbox testing - preview yes with sandbox value - production yes only after production credentials and explicit production enablement are approved.
- **Allowed values:** `sandbox`, `production`.
- **Where to get it:** NetCommerce / CyberSource technical package and deployment target.
- **Configure in Vercel:** yes - Production + Preview.
- **Risk if missing:** `/api/payments/readiness` reports the provider as incomplete and checkout remains blocked.

### `NETCOMMERCE_CYBERSOURCE_MERCHANT_ID`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - `v-c-merchant-id` and CyberSource HTTP Signature authentication.
- **Required:** local yes for sandbox testing - preview yes with sandbox value - production yes only after production credentials and explicit production enablement are approved.
- **Where to get it:** NetCommerce / CyberSource merchant credential package.
- **Configure in Vercel:** yes - Production + Preview, marked Sensitive.
- **Risk if missing:** Oraya cannot create CyberSource Unified Checkout sessions.

### `NETCOMMERCE_CYBERSOURCE_KEY_ID`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - CyberSource HTTP Signature `keyid`.
- **Required:** local yes for sandbox testing - preview yes with sandbox value - production yes only after production credentials and explicit production enablement are approved.
- **Where to get it:** NetCommerce / CyberSource key material package.
- **Configure in Vercel:** yes - Production + Preview, marked Sensitive.
- **Risk if missing:** session creation requests cannot be authenticated.

### `NETCOMMERCE_CYBERSOURCE_SHARED_SECRET`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - HMAC signing for CyberSource session creation. Never expose to browser code.
- **Required:** local yes for sandbox testing - preview yes with sandbox value - production yes only after production credentials and explicit production enablement are approved.
- **Where to get it:** NetCommerce / CyberSource key material package.
- **Configure in Vercel:** yes - Production + Preview, marked Sensitive.
- **Risk if missing:** session creation requests cannot be signed.

### `NETCOMMERCE_CYBERSOURCE_API_BASE_URL`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - base URL for `POST /uc/v1/sessions` and `POST /pts/v2/payments`.
- **Required:** local yes for sandbox testing - preview yes with sandbox host - production yes only after production credentials and explicit production enablement are approved.
- **Where to get it:** NetCommerce / CyberSource documentation. Sandbox commonly points at the CyberSource test API host; production must use the bank-confirmed production host.
- **Configure in Vercel:** yes - Production + Preview.
- **Risk if missing:** the adapter cannot create capture-context sessions or authorize transient-token payments.

### `NETCOMMERCE_CYBERSOURCE_COUNTRY`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - Unified Checkout capture-context `country` and Payments API billing country.
- **Required:** local yes for sandbox testing - preview yes with bank-confirmed sandbox value - production yes only after production credentials and explicit production enablement are approved.
- **Where to get it:** NetCommerce / CyberSource technical package. Current Lebanon merchant expectation is `LB` unless the bank specifies otherwise.
- **Configure in Vercel:** yes - Production + Preview.
- **Risk if missing:** the adapter fails readiness because CyberSource country is part of the gateway request contract.

### `NETCOMMERCE_CYBERSOURCE_LOCALE`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - Unified Checkout capture-context `locale`.
- **Required:** local yes for sandbox testing - preview yes with bank-confirmed sandbox value - production yes only after production credentials and explicit production enablement are approved.
- **Where to get it:** NetCommerce / CyberSource technical package. Current English checkout expectation is `en_US` unless the bank specifies otherwise.
- **Configure in Vercel:** yes - Production + Preview.
- **Risk if missing:** the adapter fails readiness because CyberSource locale is part of the gateway request contract.

### `NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) readiness contract for CyberSource Unified Checkout webhook/message-level encryption.
- **Required:** optional for sandbox server-side completion testing; required before production live rollout and before asynchronous webhook reconciliation can be trusted.
- **Where to get it:** CyberSource Business Center / NetCommerce webhook setup.
- **Configure in Vercel:** optional in Preview for checkout-only sandbox validation; required in Preview when testing webhooks; required in Production before live rollout. Mark as Sensitive.
- **Risk if missing:** Oraya cannot safely trust asynchronous Unified Checkout webhook payloads; browser redirects remain informational and server-side authorization must carry the sandbox test.

### `NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) readiness contract for decrypting/verifying CyberSource webhook payloads.
- **Required:** optional for sandbox server-side completion testing; required before production live rollout and before asynchronous webhook reconciliation can be trusted.
- **Where to get it:** key material generated/registered for CyberSource webhook MLE.
- **Configure in Vercel:** optional in Preview for checkout-only sandbox validation; required in Preview when testing webhooks; required in Production before live rollout. Mark as Sensitive.
- **Risk if missing:** Oraya cannot safely trust asynchronous Unified Checkout webhook payloads; browser redirects remain informational and server-side authorization must carry the sandbox test.

### `NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID`

- **Scope:** server-only.
- **Used in:** [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) readiness contract for the CyberSource webhook MLE certificate binding.
- **Required:** optional for sandbox server-side completion testing; required before production live rollout and before asynchronous webhook reconciliation can be trusted.
- **Where to get it:** CyberSource Business Center / NetCommerce webhook setup.
- **Configure in Vercel:** optional in Preview for checkout-only sandbox validation; required in Preview when testing webhooks; required in Production before live rollout. Mark as Sensitive.
- **Risk if missing:** Oraya cannot safely trust asynchronous Unified Checkout webhook payloads; browser redirects remain informational and server-side authorization must carry the sandbox test.

### `STRIPE_SECRET_KEY`

- **Scope:** server-only.
- **Status:** optional dev/test adapter only. No longer the assumed production provider.
- **Used in:**
  - [lib/payments/stripe.ts](../../lib/payments/stripe.ts) - authorizes Stripe Checkout session creation against Stripe's server API.
  - [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) - Reserve-path hosted payment session creation when `PAYMENT_PROVIDER=stripe` outside production.
- **Required:** local optional (only if you want real Stripe test-mode checkout locally) · preview optional · production not used.
- **Where to get it:** Stripe Dashboard -> Developers -> API keys -> **Secret key** for the correct mode (test vs live).
- **Configure in Vercel:** optional. If used at all, prefer local/development only.
- **Risk if missing:** none unless a non-production environment intentionally sets `PAYMENT_PROVIDER=stripe`.
- **Operational note:** Stripe is not an approved Oraya production provider.

### `STRIPE_WEBHOOK_SECRET`

- **Scope:** server-only.
- **Status:** optional dev/test adapter only. No longer the assumed production provider.
- **Used in:**
  - [lib/payments/stripe.ts](../../lib/payments/stripe.ts) - verifies Stripe `Stripe-Signature` headers.
  - [app/api/payments/webhook/stripe/route.ts](../../app/api/payments/webhook/stripe/route.ts) - rejects unsigned/invalid webhook deliveries.
- **Required:** local optional (only if you are forwarding Stripe webhooks locally) · preview optional · production not used.
- **Where to get it:** Stripe Dashboard -> Developers -> Webhooks -> select the endpoint -> **Signing secret**.
- **Configure in Vercel:** optional. If used at all, prefer local/development only.
- **Risk if missing:** none unless a non-production environment intentionally uses the Stripe adapter.
- **Operational note:** each Stripe webhook endpoint has its own signing secret. Stripe remains isolated to dev/test use.

### `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

- **Scope:** public.
- **Used in:** no runtime consumer in the current hosted-checkout flow. Reserved only if Stripe is exercised in local/dev later.
- **Required:** optional in local / preview / production for the current implementation.
- **Where to get it:** Stripe Dashboard -> Developers -> API keys -> **Publishable key**.
- **Configure in Vercel:** optional for now.
- **Risk if missing:** none today.

### Butler secret rotation checklist

Use this checklist whenever rotating either `BUTLER_WEBHOOK_SECRET` or `BUTLER_PREFILL_SECRET`:

1. Pick the target environment first: Preview or Production. Do not rotate both casually in the same untested step.
2. Generate a fresh value with `openssl rand -base64 32`.
3. Update the Vercel environment variable for the target environment.
4. If rotating `BUTLER_WEBHOOK_SECRET`, update the matching WhatChimp outbound header value in the same change window.
5. Redeploy the affected environment so the new runtime value is loaded.
6. Validate after deploy:
   - `POST /api/butler/lead` still succeeds
   - `prefill_url` is returned when `BUTLER_PREFILL_SECRET` is set
   - `GET /api/butler/prefill?h=...` still returns 200 for a fresh token
7. Expect impact:
   - rotating `BUTLER_WEBHOOK_SECRET` invalidates old WhatChimp calls immediately
   - rotating `BUTLER_PREFILL_SECRET` invalidates previously minted handoff tokens immediately
8. If Production rotation fails, restore the prior value first, then debug. Do not leave WhatChimp and Vercel on mismatched secrets.

Operational note:

- `BUTLER_WEBHOOK_SECRET` and `BUTLER_PREFILL_SECRET` are separate on purpose. Do not reuse one for the other.
- Rotate them independently unless there is a specific incident reason to rotate both.

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
