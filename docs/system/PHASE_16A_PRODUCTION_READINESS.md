# Phase 16A — Production Readiness (WhatsApp Butler)

**Audience:** Oraya operators / future agents doing a go-live or regression check on the WhatsApp Butler.
**Authority order:** [PROJECT_STATE.md](PROJECT_STATE.md) > [AGENT_RULES.md](AGENT_RULES.md) > [DECISIONS_LOG.md](DECISIONS_LOG.md) > [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) > this file.
**Updated:** 2026-07-09.

This is the internal readiness checklist for the approved Phase 16A production scope. It complements the builder method in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Phase 16A WhatChimp production builder (LOCKED 2026-07-09)". Production/operator WhatChimp exports are **not** committed to the repo — download the live flow from WhatChimp when you need the node graph. Do not paste secret values anywhere.

## Readiness checklist

Mark each ✅ before declaring the bot production-ready. Run on a real WhatsApp thread against the production bot.

### Flows

- [ ] **Book a Stay — natural intake.** One-message stay request is parsed and echoed back as a structured confirmation (dates, villa, guests, bedrooms). No rigid step-by-step re-asking of fields the guest already gave.
- [ ] **Secure website prefill handoff.** The confirmation offers a working secure `/book?h=...` continuation link (or the plain `https://stayoraya.com/book` fallback when a link cannot be minted). The link hydrates `/book` with the guest's details.
- [ ] **Plan an Event — direct `/events/inquiry` redirect.** An event message routes **directly** to `https://stayoraya.com/events/inquiry`. WhatsApp asks **no** event-type / villa / attendee / date / setup / services questions.
- [ ] **Explore villas / location.** A guest asking to see the villas or location is pointed to the canonical villa pages (`https://stayoraya.com/villas/mechmech`, `https://stayoraya.com/villas/byblos`) / `https://stayoraya.com`. The bot does **not** invent exact addresses, gate codes, or arrival coordinates. *(Verify the exact WhatChimp wiring of this route against the live platform — see Risks/Human verification.)*
- [ ] **Guest Identification v2 — known-subscriber path.** A subscriber already linked to a booking gets a safe booking-status reply directly from `#oraya_identity_safe_message#` (no reference ask).
- [ ] **Guest Identification v2 — unknown-guest fallback.** A subscriber with no linked booking is asked for the 8-character booking reference, which is saved to `oraya_booking_reference` and re-submitted to Oraya Identify.
- [ ] **Wrong-reference fallback.** An unrecognized reference does not produce a confident wrong-booking answer; the bot safely asks the guest to double-check / re-enter, or escalates.
- [ ] **Identity-proof mismatch fallback.** A valid reference with a wrong email/full name does **not** leak booking details; it routes to a human / safe fallback. The bot does not loop endlessly on retries.

### Guardrails

- [ ] **Human follow-up expectations set.** Stay requests read as *requests* (not confirmations); event inquiries read as *inquiries* (not confirmed bookings). The bot says the Oraya team will review/confirm.
- [ ] **Trigger conflict check.** Booking-support triggers are specific multi-word phrases; no broad single-word triggers (`booking`, `reservation`, `stay`) route into the wrong flow.
- [ ] **Duplicate mini-flow check.** No leftover standalone "website booking" / "Check my booking" / "Help with my booking" mini-flows exist — booking-support is consolidated into Guest Identification v2.
- [ ] **API secret / header check (no values exposed).** Oraya Identify sends the `X-Butler-Secret` header (value = `BUTLER_WEBHOOK_SECRET`, stored privately in WhatChimp) and receives a direct `2xx` from the configured `www` host (a `3xx` redirect leaves response mappings empty — verify with a redirect-following test). Never read or paste the secret value.
- [ ] **No availability-confirmation promise.** The bot never says a date/villa is confirmed available.
- [ ] **No payment promise.** No "paid" / "payment link active" / "deposit received" / "confirmed booking" claims (payment is Phase 16B).
- [ ] **No access/PIN/location disclosure.** No gate codes, smart-lock PINs, exact GPS, or arrival credentials (Phase 16D). The 8-character reference is a public support code, not a PIN.
- [ ] **No bot-invented booking details.** Booking-sensitive replies come only from `/api/butler/identify` `safe_message`; the bot never composes booking status/dates/villa on its own.

## Final manual smoke test list

Run each and confirm the expected outcome:

| # | Send | Expect |
|---|---|---|
| 1 | **Book a Stay:** `July 10 to July 15 Mechmech 4 guests 2 bedrooms` | Structured confirmation with both dates, Villa Mechmech, 4 guests, 2 bedrooms + a secure `/book` continuation link. Reads as a request, not a confirmation. |
| 2 | **Plan an Event:** `I want to plan a birthday` / `private dinner` / `event inquiry` | Routes **directly** to `https://stayoraya.com/events/inquiry`. No event-detail questions in WhatsApp. |
| 3 | **Known guest booking support:** `Check my booking` (from a subscriber linked to a booking) | Identify is called first; bot returns the safe booking status directly (no reference ask). |
| 4 | **Unknown guest booking support:** `Check my booking` (subscriber not linked) | Bot asks for the 8-character booking reference. |
| 5 | **Wrong reference:** send an unrecognized 8-char code | Bot safely asks the guest to double-check the reference (no confident wrong booking); escalates if needed. |
| 6 | **Identity proof required:** send a valid reference for a pending/confirmed booking | Bot asks for the email or full name on the booking. |
| 7 | **Identity proof mismatch:** send a wrong email/full name | Bot does **not** disclose booking details; routes to a human / safe fallback. |

A run is "good" only when every checklist box is ✅ and all seven smoke tests behave as above. If any booking-sensitive reply is composed by the bot rather than echoed from `#oraya_identity_safe_message#`, stop and fix before go-live.
