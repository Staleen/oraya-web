# Phase 16 Plan (Planning Context)

This document is the forward-looking roadmap. For per-sub-phase implementation detail, see [/docs/phases/PHASE_INDEX.md](docs/phases/PHASE_INDEX.md) and the per-phase plan documents linked below.

**Last updated:** 2026-06-03.

---

## Canonical domain reminder

The single canonical Oraya web origin is **`https://stayoraya.com`** and only `https://stayoraya.com`. AI Training / WhatChimp Bot Reply / generic AI assistants must not name any other host (`www.oraya.com.lb`, `oraya.com.lb`, unprefixed `oraya.com`) as an Oraya web property. See [/docs/system/KNOWN_BUGS.md](docs/system/KNOWN_BUGS.md) #8 and [/docs/system/BUTLER_PLAYBOOK.md](docs/system/BUTLER_PLAYBOOK.md) canonical-origin section.

---

## Roadmap

### 16A — WhatsApp AI Butler — 🟡 in progress, substantially complete

Shipped:
- Read-only Butler API foundation (`/api/butler/health|event-types|addons|availability|normalize-dates`).
- Lead intake (`POST /api/butler/lead` → `whatsapp_leads` table → `/admin/leads` operator console).
- Secure WhatsApp → website prefill handoff (`/api/butler/prefill` + opaque `?h=…` token on `/book`).
  - No PII in the URL — the token payload is HMAC-signed and the public prefill route returns a strict safe-field allow-list only.
- Prefill hydration on `/book` (villa, normalized stay dates, sleeping guest count, full name).
- Lead → booking identity continuity (best-effort `whatsapp_leads.linked_booking_id` writer in `/api/bookings` POST, non-blocking).
- WhatChimp response mapping: `prefill_url` → `oraya_prefill_url` (documented in [/docs/system/BUTLER_PLAYBOOK.md](docs/system/BUTLER_PLAYBOOK.md)).
- WhatsApp identity v2 (`/api/butler/identify`): `subscriber_id` is the **primary** WhatsApp identity key; `chat_id` is **diagnostic / context only** and must NEVER be treated as a phone number; the reference fallback gates disclosure behind an identity proof accepting **email OR full name** (exact-after-normalization match); the response is enriched with the 8-character public booking reference plus the signed `/booking/view/[token]` URL on identity-established active branches.
- Confirmed-guest support foundation (`POST /api/butler/confirmed-guest-info`) — narrow Phase 16A allow-list (reference / villa / dates / view URL / operator-configured `butler_checkin_guidance` / explicit `location_access_note`); refuses pending / cancelled / unverified.
- Returning-guest support foundation via the identity orchestrator's subscriber-id auto-resume path.
- Butler namespace standardization (`/api/butler/*` — namespace, secret name `BUTLER_WEBHOOK_SECRET`, source-of-truth boundary).
- Website CTA prefill routing (plain human sentences `"Check my booking <ref>"` / `"Help with my booking <ref>"` built by [lib/booking-trust-messaging.ts](lib/booking-trust-messaging.ts)). The brief 2026-05-23 `#ORAYA_REF:` / `#ORAYA_CHANGE:` structured-marker scheme was withdrawn on 2026-06-03 — see [/docs/system/DECISIONS_LOG.md](docs/system/DECISIONS_LOG.md).
- Inbound-message convenience: `/api/butler/identify` accepts `message_text` and runs a bounded `\b[0-9A-Fa-f]{8}\b` extractor ([lib/butler/extract-booking-reference.ts](lib/butler/extract-booking-reference.ts)) so non-WhatChimp channels (Telegram, Messenger, WhatsApp Cloud API) that DO expose inbound text auto-skip the reference ask. WhatChimp does not expose inbound text on the production tenant today.

Outstanding (operator-side / policy-side):
- WhatChimp confirmed-guest flow wiring (the endpoint exists; the WhatChimp flow that calls it on identity-established confirmed guests still needs to be wired and tested).
- Confirmed-guest routing refinement (operator routing between deliver-confirmed-guest-info vs wait-for-confirmation vs acknowledge-cancellation).
- Generic AI containment: the generic AI Training layer must not answer booking-sensitive confirmed-guest questions outside the `confirmed-guest-info` boundary.
- `POST /api/butler/flow-submit` — write-capable booking adapter (WhatsApp Flow → locked `/api/bookings` POST) if/when WhatsApp-side booking submission is scoped in. The current architecture keeps `/book` as the authoritative booking surface.

Known WhatChimp platform limitations:
- No inbound-message text extraction (only first name, last name, label, email, phone number, chat ID are available as system fields on the production tenant).
- No regex capture support inside Condition nodes or HTTP API request bodies.
- No dynamic booking-reference extraction from free text — the extractor lives on the Oraya backend (`message_text` field) and is forward-compatible for other channels.

Explicitly **not** Phase 16A:
- Exact location / address disclosure — Phase 16D.
- Smart-lock PIN / gate code / door code issuance — Phase 16D.
- Payment links, payment ledger detail, payment confirmation URLs — Phase 16B.
- Admin notes, internal IDs, follow-up status, raw payload — admin-only via `/admin/leads`.
- Signed confirm/cancel tokens — admin email surface only.

WhatChimp / Butler invariants:
- WhatChimp is **not** the source of truth — Oraya's backend (Supabase + the locked `/api/bookings*` surface) is.
- `subscriber_id` is the primary WhatsApp identity key.
- `chat_id` is diagnostic / context only and must NEVER be treated as a phone number.
- The Butler must never expose: exact location, PIN, gate code, payment links, admin notes, internal IDs, or signed confirm/cancel tokens.

### 16B — Payment processing + refunds — 🟡 in progress, active

- Architecture plan: [/docs/phases/PHASE_16B_PLAN.md](docs/phases/PHASE_16B_PLAN.md).
- **Production direction:** Credit Libanais / NetCommerce / MPGS — the only approved production provider.
- **Not production direction:** Stripe — the retained adapter is isolated to local / dev (`PAYMENT_PROVIDER=stripe` is explicitly rejected in production).
- **Architectural decisions:** hosted-checkout preferred (Oraya does not collect card data directly); verified webhook / server notification is the **authority** for payment receipt; browser redirect to `/booking/view/[token]?payment=...` is informational only; the payment provider must fail closed when its configuration is missing; payment secrets remain server-only env vars; admin settings may contain only guest-safe / non-secret payment controls.
- **Shipped foundation:** payment-link columns on `bookings`, provider-agnostic adapter contract, hosted-checkout runtime, Credit Libanais readiness foundation + provider-schema compatibility migration ([sql/phase-16b4-credit-libanais-provider-compat.sql](sql/phase-16b4-credit-libanais-provider-compat.sql)), admin payment settings, guest-safe `/api/payments/readiness` admin readiness surface, three-step `/book` flow + dual-CTA Step 3 (primary "Continue to secure payment" + secondary "Reserve now, pay later"), webhook-first authority on `POST /api/payments/webhook/[provider]`.
- **Outstanding:** live MPGS session creation, callback verification, settlement reconciliation, refunds automation, WhatsApp payment-status replies, Instant Book payment execution.
- WhatsApp payment-reply branching by booking status is part of this phase, not Phase 16A.

### 16C — Guest manual
- villa-specific manuals
- pre-arrival guide
- during-stay guide
- house rules
- troubleshooting

### 16D — Smart lock integration
- PIN generation
- check-in/check-out validity windows
- guest access delivery
- cancellation/access revocation

### 16E — Membership points and rewards
- member benefits
- points earning
- redemption logic
- admin control

---

## Dependencies (high level)

- 16A depends on WhatsApp channel setup, message templates/policies, token-safe guest identity mapping, and escalation routing.
- 16B depends on payment provider selection, secure webhook ingestion, idempotency strategy, and refund policy/ops alignment.
- 16C depends on finalized villa operations content and multilingual content strategy if needed.
- 16D depends on lock vendor selection, access credential lifecycle model, and cancellation hooks.
- 16E depends on reward economics rules, points ledger design, and anti-abuse controls.

---

## Risk notes

- Channel automation risk: wrong guest routing or stale booking context can produce trust damage.
- Payment risk: webhook replay, partial state mismatch, and refund race conditions.
- Lock risk: invalid access windows or delayed revocation can create security/guest-friction incidents.
- Rewards risk: unclear earn/redeem logic can generate financial leakage and support overhead.
- Cross-phase coupling risk: 16A, 16B, and 16D can create cascading failure modes if shipped without shared lifecycle contracts.

---

## Must NOT be implemented yet

- No direct WhatsApp bot execution in production.
- No payment gateway checkout or live refund automation.
- No smart-lock credential issuance in production.
- No points accrual/redemption writes in production.
- No schema/API redesign for speculative features without approved architecture.
- No Phase 15 scope reopening unless a production blocker is identified.

---

## Suggested first audit for 16A (WhatsApp readiness)

Run an architecture and security audit before coding:

1. Map booking/event/member lifecycle states to allowed WhatsApp intents.
2. Define identity trust model for chat sender -> member/guest linkage.
3. Define token delivery constraints (single-use, expiry, revoke behavior, redaction in logs).
4. Define escalation contract (handoff triggers, SLA targets, transcript retention policy).
5. Define operational guardrails (rate limits, retries, fallback channels, abuse handling).
6. Produce go/no-go checklist for implementation kickoff.
