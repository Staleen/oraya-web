# Oraya - Project State (Source of Truth)

**This file is the highest authority for AI sessions** (ChatGPT, Claude Code, Codex, Cursor). If anything in chat memory, side-channel notes, or older root-level docs disagrees with this file, **this file wins**. When in doubt, stop and ask.

**Last updated:** 2026-07-02

---

## What Oraya is

Oraya is a luxury boutique villa brand in Lebanon. The web app is the booking surface, member experience, admin operations console, and the brand's primary marketing site. Two villas are live: **Villa Mechmech** and **Villa Byblos**.

The site supports stay bookings (Reserve and Instant Book paths), event inquiries, member accounts, transactional email, and a private admin console.

## Current production status

- **Live in production** on Vercel. **Canonical origin: `https://stayoraya.com`** - this is the only valid Oraya web origin. Any AI / WhatChimp / human-facing reply that proposes a different host (e.g. `www.oraya.com.lb`) is a wrong-domain response and must be treated as a bug, not a migration. See [KNOWN_BUGS.md](KNOWN_BUGS.md) and [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md).
- **Phase 15 - CLOSED / COMPLETE** (public trust layer, theme system, adaptive `/book` UX, instant booking control plane, cancellation/refund visibility). Instant booking remains UI-only; Reserve-path hosted payment execution is shipped through Phase 16B's settings-driven Step 3 (live MPGS execution still pending).
- **Phase 16A - CLOSED / COMPLETE for the approved production scope (WhatChimp production wiring locked 2026-07-09).** The WhatsApp AI Butler backend foundation (`/api/butler/health|event-types|addons|availability|normalize-dates|normalize-stay-intent`), lead intake (`/api/butler/lead` + `whatsapp_leads` + `/admin/leads`), secure website handoff (`/api/butler/prefill` + `?h=...` on `/book`), lead -> booking identity continuity (best-effort `whatsapp_leads.linked_booking_id` writer in `/api/bookings` POST), and the identity orchestrator (`/api/butler/identify` with subscriber-id primary + chat-id diagnostic + email-or-name proof + booking-view URL enrichment) are shipped, and the production WhatChimp flows are wired and live: **Book a Stay** (natural stay intake + secure website prefill handoff), **Plan an Event** (quick qualifier → `/events/inquiry` redirect, no duplicate WhatsApp detail collection), and **Guest Identification v2** (identify-first booking support; every booking-sensitive reply from `/api/butler/identify` `safe_message`). The manual WhatChimp closeout was completed by David on 2026-07-09; the builder method, API contract, trigger strategy, limitations, and release checklist are preserved in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Phase 16A WhatChimp production builder (LOCKED 2026-07-09)" (production flow exports are intentionally **not** committed). See [DECISIONS_LOG.md](DECISIONS_LOG.md) 2026-07-09 "Phase 16A WhatChimp production wiring locked". **New scoped work, not remaining Phase 16A closeout** (each needs a fresh scoped task): a WhatChimp confirmed-guest flow calling `/api/butler/confirmed-guest-info`, and `POST /api/butler/flow-submit` (WhatsApp write-capable booking adapter). **Preserved exclusions (unchanged):** no WhatsApp-side confirmed booking submission unless separately reapproved; no payment promises or payment-state ownership in Phase 16A; no location / PIN / access automation in Phase 16A (that remains Phase 16D); the 8-character booking reference on `/booking/view/[token]` is a **public support code, not proof of identity and not an access PIN/credential**.
- **Phase 16B - IN PROGRESS, active.** PR #64 merged the Credit Libanais / NetCommerce / CyberSource Unified Checkout sandbox foundation on 2026-07-02 after NetCommerce confirmed successful sandbox testing. One-time hosted checkout, official seal placement, server-side transient-token payment completion, and saved-card/tokenization disablement are shipped. Browser returns remain informational; normal successful payment updates payment fields but leaves `bookings.status` pending for Oraya operations. The temporary Preview QA bypass/auto-confirm behavior has been retired. The adapter reports checkout ready only for `sandbox`; production remains fail-closed until production credentials, verified webhook/MLE reconciliation, idempotency and settlement controls, deliberate Vercel Production configuration, and explicit human rollout approval are complete. Declined-card validation, refunds automation, payment email lifecycle validation, WhatsApp payment-status replies, and Instant Book execution remain open. See [PHASE_16B_PAYMENT_OPERATIONS_AUDIT.md](PHASE_16B_PAYMENT_OPERATIONS_AUDIT.md).
- **Retired readiness branch note.** The old `C:\Users\David\OneDrive - Sela\Desktop\oraya-web` checkout remains on `codex/phase-16b-payment-readiness` only as historical local evidence and must not be used for Phase 16B implementation or merged. Its local mass-churn commit and untracked `STATUS_MAP.md` are not part of the payment implementation. New work starts from updated `master` on a clean branch/worktree.
- **Phase 16B payment operations audit (2026-06-18).** The docs-only full payment operations architecture audit lives at [docs/system/PHASE_16B_PAYMENT_OPERATIONS_AUDIT.md](PHASE_16B_PAYMENT_OPERATIONS_AUDIT.md). It maps what PR #64 implements, what the existing admin/payment-provider foundation already covers, what must remain env-only, and the next roadmap for webhooks/MLE, refunds, voids, captures, balance links, settlement, reconciliation, tokenization, fraud/risk, and production rollout.
- **AI Project Bootstrap (this layer)** - in progress. Establishes `/docs/system/` as the durable AI memory.

For the full per-phase history (15A through 15I.11 and earlier), see the legacy detail log at [/PROJECT_STATE.md](../../PROJECT_STATE.md). That file is **not** the day-to-day authority - this one is - but it remains the historical record.

## Tech stack

- **Framework:** Next.js 14 (App Router), TypeScript, React 18.
- **Styling:** Tailwind CSS v3 + inline styles (project convention - see [/CLAUDE.md](../../CLAUDE.md) "Key conventions").
- **Database / Auth:** Supabase (Postgres + Auth, RLS on user-facing tables, service-role bypass for server routes).
- **Email:** Resend (transactional only).
- **Hosting:** Vercel (Production + Preview, Vercel Cron for daily calendar sync).
- **Fonts:** Playfair Display (display) + Lato (body), Google Fonts.
- **Logos / brand:** Inline React SVG components, hardcoded color/font constants.

Full per-route, per-helper, and per-secret detail is in [ARCHITECTURE.md](ARCHITECTURE.md) and [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

## Main completed systems

- **Booking flow** - public stay booking via [app/book/page.tsx](../../app/book/page.tsx). The Reserve path is a **three-step** UX (Villa & Dates -> Stay Setup -> Review & Guest Details) with two distinct Step 3 actions: **primary "Continue to secure payment"** (gold solid CTA, blocked when the configured hosted-checkout provider is not truly ready) and **secondary "Reserve now, pay later"** (outline button). Instant Book remains UI-only today. Add-ons and special requests do NOT block the stay payment; approval-based add-ons are reviewed and charged separately after Oraya confirms. Server-side overlap protection and booking creation authority remain in [app/api/bookings/route.ts](../../app/api/bookings/route.ts).
- **Event inquiry flow** - public event request via [app/events/inquiry/page.tsx](../../app/events/inquiry/page.tsx); admin proposal management with line-item totals.
- **Admin console** - password-gated, signed `oraya_admin` session cookie. Surfaces under `/admin/*`: dashboard, bookings, calendar, rates, media, members, settings (incl. payment settings).
- **Pricing engine** - base / weekday / weekend / seasonal; per-night breakdown; server-side enforced for booking creation; snapshots persisted on the booking row.
- **Add-ons** - Supabase `addons` table is source of truth; per-villa applicability; commercial layer (percent pricing, recommended flag, descriptions); strict operational enforcement; snapshots on the booking row.
- **Calendar sync** - daily Vercel Cron (`0 0 * * *`) calls `/api/cron/calendar-sync`; iCal export per villa at `/api/calendar/[villa].ics` with UTC + exclusive `DTEND` semantics.
- **Email system** - Resend-backed transactional emails (booking confirmed/pending/payment, event proposal/response/confirmation, feedback request, booking request to admin). Signed HMAC tokens for confirm/cancel/view links.
- **WhatsApp / Butler surface** - secret-guarded `/api/butler/*` namespace owned by Oraya; WhatChimp is **not** source of truth. Read endpoints cover health, event-types, addons (no prices), availability (GET merged ranges + POST yes/no), normalize-dates. Write endpoint `/api/butler/lead` persists `whatsapp_leads` and may mint a short-lived opaque `prefill_url`; `/book?h=...` hydrates safe fields only. Successful website-originated bookings best-effort back-link the originating `whatsapp_leads.linked_booking_id`. **WhatsApp identity v2** is shipped through `/api/butler/identify`: subscriber-id is the primary continuity key, `chat_id` is diagnostic-only (never treated as phone), and the reference fallback gates disclosure behind an identity proof (email OR full name). `/api/butler/confirmed-guest-info` is the confirmed-guest info boundary (allows: reference, villa, dates, signed booking-view URL, operator-configured `butler_checkin_guidance`, explicit `location_access_note`; blocks: PIN, exact GPS, payment links, admin notes, internal IDs, action tokens). Generic AI must not answer booking-sensitive questions about confirmed guests outside this endpoint.
- **Website CTA prefill routing** - the two booking-support WhatsApp CTAs on `/booking/view/[token]` and `/booking-confirmed` pre-fill the WhatsApp compose box with **plain human sentences** built by [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts): `"Check my booking <8-char-reference>"` for view/status, `"Help with my booking <8-char-reference>"` for change/cancel. WhatChimp triggers on the `"Check my booking"` / `"Help with my booking"` substrings (the only platform capability available on the production tenant - see [KNOWN_BUGS.md](KNOWN_BUGS.md) #7). The earlier `#ORAYA_REF:` / `#ORAYA_CHANGE:` marker scheme has been withdrawn - see [DECISIONS_LOG.md](DECISIONS_LOG.md) "WhatsApp CTA prefills reverted to plain human sentences".
- **Hosted payment execution (sandbox foundation merged; production disabled)** - `POST /api/payments/checkout` resolves the configured adapter after the booking exists, and the NetCommerce/CyberSource flow creates capture contexts, loads Unified Checkout with the official seal, and completes transient-token payment server-side. Browser returns remain informational. Payment completion updates payment fields only and does not auto-confirm `bookings.status`. Saved-card/tokenization is disabled. The adapter is sandbox-ready only; declined-card validation, webhook/MLE reconciliation, idempotency, settlement reconciliation, and refunds automation remain incomplete. `/api/payments/readiness` exposes non-secret readiness to admins.
- **Admin payment settings** - `/admin/settings` owns guest-safe payment behavior: mode (`request_only` / `manual_payment` / `online_payment` / `hybrid`), deposit minimum %, full/custom deposit availability, manual rails, guest instructions, bank-transfer public details, provider display name, online-payment-enabled flag. Gateway credentials remain server-only env vars, never in the database.
- **Trust + legal layer** - `/legal/terms`, `/legal/payment`, `/legal/refund`, `/legal/privacy`; cancellation/refund visibility on booking surfaces.
- **Theme system** - `data-theme="light" | "dark"` on `<html>`; shared `--oraya-*` CSS tokens; default light, explicit dark via `oraya-theme` localStorage key.

## Current operational rules

- **Branch model:** all work happens on feature branches -> PR -> merge to `master`. Production deploys from `master` via Vercel.
- **No direct edits to `master`** from any AI agent. The auto-backup snippet in [/CLAUDE.md](../../CLAUDE.md) (`git push origin master`) is **shorthand from the pre-PR era** - the current rule is "commit to your worktree/feature branch, push that branch, open a PR". See [AGENT_RULES.md](AGENT_RULES.md).
- **Locked systems must not be modified** without explicit approval. Authoritative locked-list lives in [/PROJECT_STATE.md](../../PROJECT_STATE.md) under "LOCKED SYSTEMS - DO NOT MODIFY"; cross-referenced in [AGENT_RULES.md](AGENT_RULES.md).
- **Booking pipeline is authoritative.** `/api/bookings`, `/api/bookings/availability`, `/api/booking-action/*`, `/api/calendar/*`, `/api/cron/*`, `/api/admin/*`, the email trigger system, the auth system, the token system (`booking_action_tokens`), and existing schema are locked.
- **Time/date discipline:** UTC in the database; `Asia/Beirut` for display; admin uses 24-hour format. Stay dates (`check_in`, `check_out`) are date-only strings (`YYYY-MM-DD`) and **must never** pass through JS `Date` parsing.
- **Auto-backup:** every task ends with a commit + push (to the feature/worktree branch, not directly to `master`). PR opens after that.

## Non-negotiable constraints

These are red lines. Crossing them needs explicit human approval before code is written.

1. **No production logic or API behavior changes** without explicit task approval.
2. **No schema changes** to any existing Supabase table or column. Additive `jsonb` enrichment inside existing snapshot fields is allowed only when non-blocking and not used for validation.
3. **No authentication changes** (admin password, signed cookies, Supabase auth, member RLS).
4. **No calendar-sync logic changes** (iCal semantics, cron contract, blocking-source ingestion).
5. **No secret exposure.** Real values never appear in commits, docs, code, comments, or PR descriptions. Server-only secrets (e.g. `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`) must never be referenced from a `"use client"` file or any `NEXT_PUBLIC_*` variable. See [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).
6. **No new direct-to-`master` pushes** from AI agents. PR + human review only.
7. **No fake completion reports.** "Done" requires evidence: files changed list, build/typecheck output, test results, and explicit risk callouts. See [AGENT_RULES.md](AGENT_RULES.md).
8. **No Phase 15 reopens** unless a production blocker is identified - Phase 15 is closed.
9. **No Phase 16 implementation work** before its architecture/audit step is complete and approved.
10. **Inline-style + hardcoded color/font convention is locked.** Do not migrate to Tailwind utility colors or font classes - earlier attempts were unreliable. Constants documented in [/CLAUDE.md](../../CLAUDE.md) and [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md).

## Document hierarchy

Read top-to-bottom on every new AI session:

1. **This file** - high-level state and constraints.
2. [CURRENT_PHASE.md](CURRENT_PHASE.md) - what is being worked on right now.
3. [AGENT_RULES.md](AGENT_RULES.md) - how AI agents must behave.
4. [ARCHITECTURE.md](ARCHITECTURE.md) - system shape (when implementing).
5. [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - every env var and its risk profile.
6. [KNOWN_BUGS.md](KNOWN_BUGS.md) - open issues to be aware of.
7. [DECISIONS_LOG.md](DECISIONS_LOG.md) - why things are the way they are.
8. [/PROJECT_STATE.md](../../PROJECT_STATE.md) (root) - full historical phase log; consult on demand for deep history.
9. [/CLAUDE.md](../../CLAUDE.md), [/AGENTS.md](../../AGENTS.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) - repo-root operational notes; still valid where they don't conflict with `/docs/system/`.
