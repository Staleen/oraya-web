# Phase 16 Plan (Planning Context Only)

This document is planning context for future agent execution.

Phase 16 is not implemented in this document.

---

## Roadmap

### 16A — WhatsApp AI Butler
- WhatsApp concierge / butler
- booking support
- event inquiry support
- guest support
- booking token delivery
- future payment and lock coordination
- human escalation

### 16B — Payment processing + refunds
- instant booking checkout
- reserve payment after confirmation
- refund request/processing flow
- payment status lifecycle
- webhook safety

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
