# Oraya — Project State (Source of Truth)

**This file is the highest authority for AI sessions** (ChatGPT, Claude Code, Codex, Cursor). If anything in chat memory, side-channel notes, or older root-level docs disagrees with this file, **this file wins**. When in doubt, stop and ask.

**Last updated:** 2026-05-18

---

## What Oraya is

Oraya is a luxury boutique villa brand in Lebanon. The web app is the booking surface, member experience, admin operations console, and the brand's primary marketing site. Two villas are live: **Villa Mechmech** and **Villa Byblos**.

The site supports stay bookings (Reserve and Instant Book paths), event inquiries, member accounts, transactional email, and a private admin console.

## Current production status

- **Live in production** on Vercel, domain `https://stayoraya.com`.
- **Phase 15 — CLOSED / COMPLETE** (public trust layer, theme system, adaptive `/book` UX, instant booking control plane, cancellation/refund visibility). Instant booking exists as UI only — **payment execution is Phase 16B work and not yet implemented**.
- **Phase 16A — IN PROGRESS.** WhatsApp AI Butler read-only foundation (`/api/butler/health|event-types|addons|availability|normalize-dates`), lead intake (`/api/butler/lead` + `whatsapp_leads` + `/admin/leads`), secure website handoff (`/api/butler/prefill` + `?h=…` on `/book`), and lead → booking identity continuity (best-effort `whatsapp_leads.linked_booking_id` writer in `/api/bookings` POST) all shipped. Outstanding 16A scope: `POST /api/butler/flow-submit` (write-capable booking adapter), human-escalation routing, AI prompt tuning. The 8-character booking reference on `/booking/view/[token]` is a **public support code, not an access PIN** — access credentials remain Phase 16D.
- **Phase 16B — PROVISIONED, no implementation.** Payment + refunds architecture / schema decision / WhatsApp payment branching / admin workflow / guest workflow / refund workflow / PR-safe roadmap in [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md). Roadmap in [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md).
- **AI Project Bootstrap (this layer)** — in progress. Establishes `/docs/system/` as the durable AI memory.

For the full per-phase history (15A through 15I.11 and earlier), see the legacy detail log at [/PROJECT_STATE.md](../../PROJECT_STATE.md). That file is **not** the day-to-day authority — this one is — but it remains the historical record.

## Tech stack

- **Framework:** Next.js 14 (App Router), TypeScript, React 18.
- **Styling:** Tailwind CSS v3 + inline styles (project convention — see [/CLAUDE.md](../../CLAUDE.md) "Key conventions").
- **Database / Auth:** Supabase (Postgres + Auth, RLS on user-facing tables, service-role bypass for server routes).
- **Email:** Resend (transactional only).
- **Hosting:** Vercel (Production + Preview, Vercel Cron for daily calendar sync).
- **Fonts:** Playfair Display (display) + Lato (body), Google Fonts.
- **Logos / brand:** Inline React SVG components, hardcoded color/font constants.

Full per-route, per-helper, and per-secret detail is in [ARCHITECTURE.md](ARCHITECTURE.md) and [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

## Main completed systems

- **Booking flow** — public stay booking via [app/book/page.tsx](../../app/book/page.tsx); Reserve (request → admin confirm) and Instant Book (UI only today). Server-side overlap protection in [app/api/bookings/route.ts](../../app/api/bookings/route.ts).
- **Event inquiry flow** — public event request via [app/events/inquiry/page.tsx](../../app/events/inquiry/page.tsx); admin proposal management with line-item totals.
- **Admin console** — password-gated, signed `oraya_admin` session cookie. Surfaces under `/admin/*`: dashboard, bookings, calendar, rates, media, members, settings.
- **Pricing engine** — base / weekday / weekend / seasonal; per-night breakdown; server-side enforced for booking creation; snapshots persisted on the booking row.
- **Add-ons** — Supabase `addons` table is source of truth; per-villa applicability; commercial layer (percent pricing, recommended flag, descriptions); strict operational enforcement; snapshots on the booking row.
- **Calendar sync** — daily Vercel Cron (`0 0 * * *`) calls `/api/cron/calendar-sync`; iCal export per villa at `/api/calendar/[villa].ics` with UTC + exclusive `DTEND` semantics.
- **Email system** — Resend-backed transactional emails (booking confirmed/pending/payment, event proposal/response/confirmation, feedback request, booking request to admin). Signed HMAC tokens for confirm/cancel/view links.
- **Trust + legal layer** — `/legal/terms`, `/legal/payment`, `/legal/refund`, `/legal/privacy`; cancellation/refund visibility on booking surfaces.
- **Theme system** — `data-theme="light" | "dark"` on `<html>`; shared `--oraya-*` CSS tokens; default light, explicit dark via `oraya-theme` localStorage key.

## Current operational rules

- **Branch model:** all work happens on feature branches → PR → merge to `master`. Production deploys from `master` via Vercel.
- **No direct edits to `master`** from any AI agent. The auto-backup snippet in [/CLAUDE.md](../../CLAUDE.md) (`git push origin master`) is **shorthand from the pre-PR era** — the current rule is "commit to your worktree/feature branch, push that branch, open a PR". See [AGENT_RULES.md](AGENT_RULES.md).
- **Locked systems must not be modified** without explicit approval. Authoritative locked-list lives in [/PROJECT_STATE.md](../../PROJECT_STATE.md) under "LOCKED SYSTEMS – DO NOT MODIFY"; cross-referenced in [AGENT_RULES.md](AGENT_RULES.md).
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
8. **No Phase 15 reopens** unless a production blocker is identified — Phase 15 is closed.
9. **No Phase 16 implementation work** before its architecture/audit step is complete and approved.
10. **Inline-style + hardcoded color/font convention is locked.** Do not migrate to Tailwind utility colors or font classes — earlier attempts were unreliable. Constants documented in [/CLAUDE.md](../../CLAUDE.md) and [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md).

## Document hierarchy

Read top-to-bottom on every new AI session:

1. **This file** — high-level state and constraints.
2. [CURRENT_PHASE.md](CURRENT_PHASE.md) — what is being worked on right now.
3. [AGENT_RULES.md](AGENT_RULES.md) — how AI agents must behave.
4. [ARCHITECTURE.md](ARCHITECTURE.md) — system shape (when implementing).
5. [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) — every env var and its risk profile.
6. [KNOWN_BUGS.md](KNOWN_BUGS.md) — open issues to be aware of.
7. [DECISIONS_LOG.md](DECISIONS_LOG.md) — why things are the way they are.
8. [/PROJECT_STATE.md](../../PROJECT_STATE.md) (root) — full historical phase log; consult on demand for deep history.
9. [/CLAUDE.md](../../CLAUDE.md), [/AGENTS.md](../../AGENTS.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) — repo-root operational notes; still valid where they don't conflict with `/docs/system/`.
