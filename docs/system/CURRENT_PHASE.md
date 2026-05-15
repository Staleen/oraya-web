# Current Phase — Phase 16A.2 (planned) — Butler Flow-submit adapter

**Updated:** 2026-05-12
**Status:** 16A.1 (read-only Butler API foundation) shipped in this commit; 16A.2 planned, not yet implemented.

This file is rewritten at every phase transition. Treat it as a snapshot, not a log.

---

## Active phase

**Phase 16A.2 — Flow submission adapter (planned).**

Wire `POST /api/butler/flow-submit` so a WhatsApp Flow submission becomes a real Oraya booking row through the **existing** locked `/api/bookings` POST contract. No schema changes. No locked-API behavior changes. Idempotency keyed on the Flow's submission token so retries do not create duplicates.

16A.2 is the first **write-capable** Butler endpoint. The read-only foundation it depends on (`/api/butler/health|event-types|addons|availability` + the `lib/butler/auth.ts` helper) is now in place.

## Active objective

Design and ship the Flow submission adapter:

1. **`POST /api/butler/flow-submit`** — accepts a WhatsApp Flow payload, validates it, maps it into the existing `/api/bookings` POST body shape, and forwards into the locked code path. Never bypasses the existing overlap / pricing / addon-audit pipeline.
2. **Idempotency.** Dedup on a Flow-supplied `flow_token`. Decision pending in 16A.2 kickoff: small new `butler_submissions` table vs advisory enrichment inside the existing `addons_snapshot` jsonb. Either is consistent with [AGENT_RULES.md](AGENT_RULES.md) rule 4 (the table option is additive; the jsonb option is non-blocking enrichment).
3. **Structured response.** `{ ok, status, booking_id?, view_url?, user_message }`. The `user_message` is the **only** sentence the AI Butler is allowed to repeat to the guest about outcome.
4. **Health gates.** Refuse Flow submissions when `RESEND_API_KEY` is unset in production — turns [KNOWN_BUGS.md](KNOWN_BUGS.md) #2 from a stealth failure into an explicit one for this surface.

## Just completed

- **Phase 16A.2.c — Butler `normalize-dates` read-only scaffolding (this commit).** Added [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts) and [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) — a secret-guarded `POST` endpoint that turns natural-language date text from WhatChimp (`"this Saturday"`, `"June 10"`, `"10 June 2026"`, `"two nights"`, ISO) into a structured `{ check_in, check_out, nights, human_readable, safe_message }` suggestion. Always advisory (`status: "needs_confirmation"` even on clean parses); Butler must echo back for guest confirmation before any availability check. Reuses the existing 2026-05-12 Butler auth contract via [lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth` (503 if env unset, 401 if header missing/wrong). **Does not create bookings, check availability, write DB rows, send emails, or issue tokens.** This is additional read-only Butler scaffolding for 16A.2 — the `flow-submit` adapter itself is still outstanding. See [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-14 entry.
- **Phase 16A.1.x — Butler Playbook + minor hardening (this commit).** Established [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) as the operational source-of-truth for the AI Butler (identity, conversation behavior, availability/pricing/add-on philosophy, knowledge boundary, event vs stay separation, deferred future-phase systems, forbidden AI behaviors, cross-references). Extracted the duplicated villa-slug map from the addons + availability routes into a shared [lib/butler/villa.ts](../../lib/butler/villa.ts) helper (`resolveButlerVilla` + `KNOWN_BUTLER_VILLAS`). [ARCHITECTURE.md](ARCHITECTURE.md) Butler flow section cross-references the playbook. See [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-12 "Butler Playbook established as operational source-of-truth". No code behavior change beyond the surgical helper extraction; same 503/401/200 contract on every `/api/butler/*` route.
- **Phase 16A.1 — Read-only Butler API foundation (prior commit).** Shipped:
  - [lib/butler/auth.ts](../../lib/butler/auth.ts) — `requireButlerAuth` helper. Validates `X-Butler-Secret` against `BUTLER_WEBHOOK_SECRET` using `crypto.timingSafeEqual`. 503 on missing/empty env; 401 on missing/wrong header.
  - [app/api/butler/health/route.ts](../../app/api/butler/health/route.ts) — liveness + secret check; returns `{ ok: true, service: "oraya-butler", mode: "read-only" }`.
  - [app/api/butler/event-types/route.ts](../../app/api/butler/event-types/route.ts) — projects `CANONICAL_EVENT_TYPES` from [lib/event-types.ts](../../lib/event-types.ts) into `{ value, label, description }`.
  - [app/api/butler/addons/route.ts](../../app/api/butler/addons/route.ts) — villa+context filtered add-ons with `event_type` optional. Prices and currency intentionally omitted; operational internals never echoed.
  - [app/api/butler/availability/route.ts](../../app/api/butler/availability/route.ts) — thin wrapper over `getMergedAvailabilityRanges` + heated-pool carryover. Does not modify or call the locked `/api/bookings/availability` route.
  - [ARCHITECTURE.md](ARCHITECTURE.md) — API surface table updated; new "Butler flow (Phase 16A.1 — read-only)" section added.
  - [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) — `BUTLER_WEBHOOK_SECRET` flipped from "reserved/not consumed" to "consumed by /api/butler/* (live)".
  - No locked-API touches. No schema changes. No new dependencies. `npx tsc --noEmit` clean. `npm run build` clean.
- **Phase 16A.0 — Architecture freeze ([apps#10](https://github.com/Staleen/oraya-web/pull/10)).** Locked namespace `/api/butler/*`, secret name `BUTLER_WEBHOOK_SECRET`, source-of-truth boundary, implementation order. Documented in [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-12).
- **Phase 16A audit (2026-05-11).** Read-only architecture audit; conclusions recorded in the 2026-05-12 DECISIONS_LOG entry.
- **AI Project Bootstrap (prior phase).** `/docs/system/` is the durable AI source of truth.

## Open issues to be aware of right now

Pre-existing gaps that become more visible when 16A.2 ships:

- **Missing `RESEND_API_KEY` is a stealth failure.** The Butler tells guests "you'll get an email confirmation"; without Resend wired, no email goes out and no error surfaces. 16A.2 should refuse submissions when the key is unset in production. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #2.
- **Missing `NEXT_PUBLIC_SITE_URL` on preview links to production.** When 16A.2 echoes a booking view URL, preview-environment Butler messages would point at live data. Set `NEXT_PUBLIC_SITE_URL` on Vercel Preview before 16A.2 ships. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #3.
- **`BUTLER_WEBHOOK_SECRET` not yet in Vercel.** This PR wires the consumer but does not populate the Vercel env panel. Production and Preview need the value set (Sensitive) before WhatChimp can call any `/api/butler/*` route in those environments. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #4.
- **DECISIONS_LOG header-name example drift.** The 2026-05-12 DECISIONS_LOG entry used `X-Butler-Auth` as an illustrative header name; the actual implementation in 16A.1 uses `X-Butler-Secret` per the 16A.1 task spec. Architecturally identical ("shared secret in header"); only the header name differs. Not worth a superseding DECISIONS_LOG entry — flagged here for future agents reading old context.

## Out of scope this phase (16A.2)

- ❌ **No schema changes** without explicit approval in the task prompt — even for the idempotency table. If a new `butler_submissions` table is chosen over the jsonb-enrichment path, that decision goes through a separate approval gate.
- ❌ **No payment / refund flow over WhatsApp.** Phase 16B.
- ❌ **No smart-lock PIN issuance or access-code delivery.** Phase 16D.
- ❌ **No member ↔ phone linkage.** Every Butler-originated booking is the guest path. A future phase ships the verification flow.
- ❌ **No AI prompt engineering in this repo.** AI Training, Bot Reply, Labels, and Custom Fields live in WhatChimp.
- ❌ **No `/api/bookings` POST behavior change.** The adapter normalizes the Flow payload into the existing body shape — pricing/overlap/addon audit remain the locked source of truth.
- ❌ **No locked-API touches.** `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, the email senders, the auth/token systems, and existing schema remain off-limits.
- ❌ **No widening of `/api/settings` allowlist** to satisfy WhatChimp. Butler reads belong under `/api/butler/*`.
- ❌ **No `NEXT_PUBLIC_BUTLER_*` env vars.** Server-only.

## Next recommended steps

In order:

1. **Human action:** set `BUTLER_WEBHOOK_SECRET` in Vercel (Production + Preview, Sensitive; different value per environment recommended). Generate with `openssl rand -base64 32`. Confirm WhatChimp's outbound webhook is configured to send the resulting secret in the `X-Butler-Secret` header.
2. **Human action:** confirm WhatChimp's outbound-signing capability. If supported, 16A.1.x adds HMAC + timestamp; if not, the bare shared secret remains the floor.
3. **16A.2 implementation (next coding session):** design and ship `POST /api/butler/flow-submit` per "Active objective" above. Decide the idempotency persistence shape (new `butler_submissions` table vs `addons_snapshot` enrichment) in the kickoff and surface that decision in DECISIONS_LOG before writing code.
4. **16A.2 hardening:** make `RESEND_API_KEY` absence a loud failure on `/api/butler/flow-submit` in production. Resolves [KNOWN_BUGS.md](KNOWN_BUGS.md) #2 for the Butler surface.
