# Current Phase — Phase 16A (operational closeout) — Butler / WhatChimp website continuation

**Updated:** 2026-05-18
**Status:** Phase 16A implementation is shipped in production. Current work is operational hardening, documentation alignment, and human-run readiness checks. **Phase 16B payment execution is not implemented.**

This file is rewritten at every phase transition. Treat it as a snapshot, not a log.

---

## Active phase

**Phase 16A — WhatsApp AI Butler operational closeout.**

The secure WhatsApp → website continuation path is live:

- `POST /api/butler/lead` persists `whatsapp_leads`
- a short-lived opaque `prefill_url` may be returned
- `GET /api/butler/prefill?h=...` hydrates safe fields only
- `/book?h=...` survives the guest/member gate and remounts
- non-instant continuation waits for readiness before auto-continuing
- successful website bookings best-effort link back to `whatsapp_leads.linked_booking_id`

The remaining Phase 16A work is operational:

1. keep WhatChimp production wiring aligned with the shipped backend contract
2. keep Butler prompt/escalation rules aligned with human operations
3. keep secret handling, rotation, and Vercel env posture explicit
4. avoid any accidental Phase 16B payment promises in WhatsApp or website handoff copy

## Active objective

Close the operational gaps around the shipped Phase 16A surface without redesigning the booking engine:

1. **WhatChimp contract clarity.** The production bot must call `POST /api/butler/lead`, capture `prefill_url`, and use that dynamic URL in the WhatsApp continuation reply. Static `/book` placeholders are no longer the intended primary path.
2. **Human escalation clarity.** Butler prompt guidance must make clear when the AI escalates to a human instead of improvising about unavailable dates, uncertain pricing, payment, lock/access, or policy exceptions.
3. **Secret hygiene.** `BUTLER_WEBHOOK_SECRET` and `BUTLER_PREFILL_SECRET` need an explicit rotation checklist and same-window WhatChimp/Vercel coordination notes.
4. **Phase boundary clarity.** WhatsApp may continue a booking journey, but **it does not take payment** and **does not issue access credentials**. Those remain later-phase capabilities.

## Just completed

- **Phase 16A — secure WhatsApp → website handoff (shipped).**
  - [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) signs short-lived opaque handoff tokens with `BUTLER_PREFILL_SECRET`.
  - [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts) verifies `h=<token>` and returns a strict allow-list only: `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `full_name`, `source`.
  - [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) persists leads and may return additive `prefill_url`; lead capture remains business-critical and does **not** fail if `BUTLER_PREFILL_SECRET` is missing.
  - [app/book/page.tsx](../../app/book/page.tsx) hydrates safe fields from `/api/butler/prefill?h=...`, strips `h` after hydration, persists prefill through the guest/member gate, normalizes Butler villa aliases, and auto-continues only after readiness is settled.
  - [app/api/bookings/route.ts](../../app/api/bookings/route.ts) now accepts an optional Butler prefill token from `/book`, verifies it server-side, and best-effort updates `whatsapp_leads.linked_booking_id` after successful booking insert.
- **Phase 16A — WhatsApp lead persistence + admin operations (shipped).**
  - `whatsapp_leads` remains the source of truth for WhatsApp-originated intent before a booking exists.
  - `/admin/leads` is the operator surface for follow-up status, notes, and manual inspection.
  - The website continuation path now upgrades that lead with booking provenance when the guest finishes online.
- **Phase 16A — Butler read surfaces (shipped).**
  - `/api/butler/health`, `/api/butler/event-types`, `/api/butler/addons`, `/api/butler/availability` GET/POST, and `/api/butler/normalize-dates` are live and remain server-authenticated via `X-Butler-Secret`.

## Open issues to be aware of right now

- **WhatChimp remains an operational dependency outside this repo.**
  - The exported flow must stay aligned with the backend contract:
    - call `POST /api/butler/lead`
    - capture `prefill_url`
    - use that returned URL in the outgoing WhatsApp reply
  - If WhatChimp drifts back to a static `/book` link, guests lose the secure continuation benefit even though the backend is healthy.

- **`BUTLER_PREFILL_SECRET` remains required for full handoff.**
  - Without it, `POST /api/butler/lead` still succeeds but omits `prefill_url`, and `/api/butler/prefill` cannot verify tokens.
  - This is an intentional business-continuity trade-off for lead capture, but production should treat the env as required for normal operations.

- **Missing `RESEND_API_KEY` is still a stealth failure.**
  - Lead capture and website booking can still succeed while email delivery silently no-ops.
  - This matters operationally because humans may assume a guest received a follow-up when they did not. See [KNOWN_BUGS.md](KNOWN_BUGS.md) #2.

- **Payment remains Phase 16B.**
  - Instant-book UI exists, but WhatsApp and the website continuation path must not imply payment completion, payment collection, refund handling, or any final paid confirmation state.

## Out of scope this phase

- ❌ **No payment / refund flow over WhatsApp.** Phase 16B.
- ❌ **No smart-lock PIN issuance or access-code delivery.** Phase 16D.
- ❌ **No member ↔ phone auto-linking.** Current website continuation is provenance-aware, not identity-merging.
- ❌ **No WhatsApp-side booking creation through a separate `/api/butler/flow-submit` adapter.** The current approved path is lead capture → secure website continuation → locked `/api/bookings` pipeline.
- ❌ **No widening of `/api/settings` allowlist** to satisfy WhatChimp. Butler reads belong under `/api/butler/*`.
- ❌ **No `NEXT_PUBLIC_BUTLER_*` env vars.** Butler secrets remain server-only.

## Next recommended steps

1. **Human action:** verify Production and Preview WhatChimp flows still send the current environment's `X-Butler-Secret` value and use the returned `prefill_url` dynamically rather than a static `/book` link.
2. **Human action:** rotate `BUTLER_WEBHOOK_SECRET` and `BUTLER_PREFILL_SECRET` only with a same-window Vercel + WhatChimp change plan; follow [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).
3. **Docs / ops action:** keep [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) aligned with real escalation routing, payment language, and handoff promises whenever WhatChimp messaging changes.
4. **Phase 16B kickoff:** define payment lifecycle, webhook safety, and user-facing wording before any WhatsApp or `/book` copy implies payment execution.
