# Phase 16 Plan (Planning Context)

This document is the forward-looking roadmap. For per-sub-phase implementation detail, see [/docs/phases/PHASE_INDEX.md](docs/phases/PHASE_INDEX.md) and the per-phase plan documents linked below.

---

## Roadmap

### 16A — WhatsApp AI Butler — 🟡 in progress

Shipped:
- Read-only Butler API foundation (`/api/butler/health|event-types|addons|availability|normalize-dates`).
- Lead intake (`POST /api/butler/lead` → `whatsapp_leads` table → `/admin/leads` operator console).
- Secure WhatsApp → website prefill handoff (`/api/butler/prefill` + opaque `?h=…` token on `/book`).
- Lead → booking identity continuity (best-effort `whatsapp_leads.linked_booking_id` writer in `/api/bookings` POST, non-blocking).
- WhatChimp response mapping: `prefill_url` → `oraya_prefill_url` (documented in [/docs/system/BUTLER_PLAYBOOK.md](docs/system/BUTLER_PLAYBOOK.md)).

Outstanding:
- Human-escalation routing.
- AI prompt tuning (lives in WhatChimp, not this repo).
- Vercel env wiring (`BUTLER_WEBHOOK_SECRET`, `BUTLER_PREFILL_SECRET`, `NEXT_PUBLIC_SITE_URL` on Preview).

Explicitly **not** Phase 16A:
- **`POST /api/butler/flow-submit` (write-capable booking adapter) — deferred indefinitely** per the 2026-05-18 product decision. WhatsApp is an intake + website continuation channel; final booking submission stays on the website (`/api/bookings` POST). Re-opening this would need a new product decision recorded in [/docs/system/DECISIONS_LOG.md](docs/system/DECISIONS_LOG.md).
- Access PIN / gate code issuance — Phase 16D.
- Payment via WhatsApp — Phase 16B (the payment lookup response template is provisioned in [/docs/phases/PHASE_16B_PLAN.md](docs/phases/PHASE_16B_PLAN.md)).

### 16B — Payment processing + refunds — ⏳ provisioned, no implementation

- Architecture plan: [/docs/phases/PHASE_16B_PLAN.md](docs/phases/PHASE_16B_PLAN.md).
- **Starting condition:** a booking row exists in `bookings` (created by the website's `/api/bookings` POST). Phase 16B never runs ahead of an authoritative booking request.
- Instant booking checkout, post-confirmation pay link, refund request/processing flow, payment status lifecycle, webhook safety.
- WhatsApp payment-reply branching by booking status is part of this phase, not Phase 16A. The Butler must not discuss payment until the `whatsapp_leads.linked_booking_id` provenance link has resolved.

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
