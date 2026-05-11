# Current Phase — Phase 16A.1 (planned) — Read-only Butler API foundation

**Updated:** 2026-05-12
**Status:** 16A.0 (architecture freeze) closing in this commit; 16A.1 planned, not yet implemented.

This file is rewritten at every phase transition. Treat it as a snapshot, not a log.

---

## Active phase

**Phase 16A.1 — Read-only Butler API foundation.**

Stand up the four read-only endpoints that the WhatsApp AI Butler (WhatChimp) and any future routing layer will rely on to render menus, event-type pickers, add-on options, and a soft availability check. No writes. No booking creation. No payment. No smart-lock. No member linking.

This phase is the first code commit of Phase 16A. The architecture is frozen — see [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-12 entry) — and the secret name `BUTLER_WEBHOOK_SECRET` is reserved in [/.env.example](../../.env.example) and [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) but not yet consumed.

## Active objective

Ship the four read-only endpoints under `/api/butler/*`, each guarded by a single shared-secret helper:

1. **`GET /api/butler/health`** — liveness + secret check. Returns `{ ok: true }` when the header matches; `401` otherwise. No domain data.
2. **`GET /api/butler/event-types`** — returns `CANONICAL_EVENT_TYPE_VALUES` from [lib/event-types.ts](../../lib/event-types.ts) with descriptions. Static; safe to cache.
3. **`GET /api/butler/addons`** — returns add-ons filtered by `?villa=…&context=stay|event[&event_type=…]`. Hydrated from the existing `addons` table and `addon_operational_settings`. **Never** returns price; returns id, label, applies-to, recommended flag, description.
4. **`GET /api/butler/availability`** — thin wrapper over the locked `/api/bookings/availability`. Same response shape, added cache headers, and (in a later step) per-IP rate limit.

Shared helper: `lib/butler/auth.ts` (server-only) that validates `X-Butler-Auth` against `BUTLER_WEBHOOK_SECRET`. HMAC + timestamp is a 16A.1.x follow-on once WhatChimp's outbound signing posture is confirmed.

## Just completed

- **Phase 16A audit (2026-05-11)** — read-only architecture audit of the booking, event-inquiry, add-on, pricing, and settings surface against the WhatsApp / WhatChimp / WhatsApp Flows integration shape. Delivered in chat; the conclusions are recorded durably in this phase's plan and in the 2026-05-12 [DECISIONS_LOG.md](DECISIONS_LOG.md) entry.
- **Phase 16A.0 architecture freeze (this commit)** — locked the Butler namespace (`/api/butler/*`), secret name (`BUTLER_WEBHOOK_SECRET`), auth model (shared secret, future HMAC + timestamp), and the source-of-truth boundary (Oraya backend owns pricing / availability / add-ons / booking status / access codes / policies; WhatChimp / WhatsApp / AI Training do not). Documented in [DECISIONS_LOG.md](DECISIONS_LOG.md) (2026-05-12), [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md), and [/.env.example](../../.env.example). No code, no schema, no API routes touched.
- **AI Project Bootstrap (prior phase)** — `/docs/system/` is the durable AI source of truth; ChatGPT Project orchestrator pattern validated; first small validation task (`RESEND_FROM_EMAIL` cleanup) shipped via the worktree → PR workflow.

## Open issues to be aware of right now

Not blockers for 16A.1, but every agent working in the next session should know:

- **Missing `RESEND_API_KEY` is a stealth failure.** Bookings still write but emails silently no-op. The Butler is about to start telling guests "you'll get an email confirmation" — this gap becomes more visible. Pre-emptive fix belongs to Phase 16A.2 hardening, not 16A.1. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #2.
- **Missing `NEXT_PUBLIC_SITE_URL` on preview links to production.** When the Butler echoes a booking view URL, preview-environment Butler messages would point at live data. Set `NEXT_PUBLIC_SITE_URL` on Vercel Preview before 16A.2 launches. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #3.
- **Vercel env vars not yet manually populated.** `BUTLER_WEBHOOK_SECRET` will need to be set on Vercel Production and Preview (Sensitive) as part of the 16A.1 ship, not before. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #4.

## Out of scope this phase (16A.1)

- ❌ **No booking creation via WhatsApp.** That is Phase 16A.2 (`POST /api/butler/flow-submit`), which maps a WhatsApp Flow payload into the locked `/api/bookings` body. Not in 16A.1.
- ❌ **No payment / refund flow over WhatsApp.** Phase 16B.
- ❌ **No smart-lock PIN issuance or access-code delivery.** Phase 16D.
- ❌ **No member ↔ phone linkage.** Every Butler interaction is the guest path until a later phase ships a verified linkage flow.
- ❌ **No AI prompt engineering in this repo.** AI Training, Bot Reply, Labels, and Custom Fields live in WhatChimp; this repo ships only the data plane.
- ❌ **No schema changes.** No new tables. No new columns. Advisory enrichment in existing `jsonb` snapshot fields is the only allowed persistence under [AGENT_RULES.md](AGENT_RULES.md) rule 4 — and 16A.1 is read-only, so it shouldn't need any.
- ❌ **No locked-API touches.** `/api/bookings`, `/api/bookings/availability`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, the email senders, the auth / token systems, and the existing schema are off-limits. The Butler endpoints are additive.
- ❌ **No widening of `/api/settings` allowlist.** New Butler reads belong under `/api/butler/*`, not in the existing settings endpoint.
- ❌ **No `NEXT_PUBLIC_BUTLER_*` env vars.** Server-only.

## Next recommended steps

In order:

1. **Human action:** confirm WhatChimp's outbound-webhook signing capability so 16A.1 can ship HMAC at the same time as the bare-secret path (or punt HMAC to 16A.1.x). Confirm Meta business verification status — does not block 16A.1, but blocks 16A.2 publication.
2. **16A.1 implementation (next coding session):** create `app/api/butler/health/route.ts`, `app/api/butler/event-types/route.ts`, `app/api/butler/addons/route.ts`, `app/api/butler/availability/route.ts`, and `lib/butler/auth.ts`. Add `BUTLER_WEBHOOK_SECRET` to Vercel Production + Preview (Sensitive) in the same PR. Update [ARCHITECTURE.md](ARCHITECTURE.md) API surface table to list the new open-but-secret-guarded routes.
3. **16A.2:** `POST /api/butler/flow-submit` — adapter that maps a WhatsApp Flow payload into the locked `/api/bookings` body, idempotent on `flow_token`. Requires either a small new `butler_submissions` dedup table or `jsonb` advisory enrichment (decide before ship).
4. **Health gates (16A.2 hardening):** make `RESEND_API_KEY` absence a loud failure on Butler submissions, not silent. Resolves [KNOWN_BUGS.md](KNOWN_BUGS.md) #2 for this surface.
