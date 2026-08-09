# Decisions Log

Durable architectural and operational decisions. Append-only - never edit a past entry except to add a follow-up dated link below it. If a decision is reversed, add a new entry that explicitly supersedes the old one.

**Format:**

```
## YYYY-MM-DD - <short title>

**Decision:** what was decided.
**Reason:** why.
**Impact:** what changes (files, processes, future work).
**Reversible?:** yes / no / hard.
**Supersedes:** (optional) date + title of older entry this replaces.
```

---

## 2026-08-09 - Consolidated Phase 16 roadmap becomes the canonical general roadmap

**Decision:** adopt one canonical Phase 16 business roadmap across the repository:

1. **16A — WhatsApp AI Butler & Guest Identification:** complete.
2. **16B — Complete Payment System:** active closeout.
3. **16C — Guest Experience & Arrival Guide:** complete.
4. **16D — Smart Access & Arrival Automation:** planned.
5. **16E — Guest Operations & Automated Hospitality:** planned.
6. **16F — Membership, Loyalty & CRM:** planned.
7. **16G — SEO & Organic Growth:** planned.
8. **16H — Multilingual & International Guest Experience:** planned.
9. **16I — Reputation, Reviews & Guest Retention:** planned.
10. **16J — Revenue & Business Intelligence:** planned.

The `/admin` → `/ops` migration remains a **cross-phase closeout**, not a numbered Phase 16 workstream. The Operational Messaging layer that disappeared when WhatsApp expanded into the larger 16A program is restored as **16E — Guest Operations & Automated Hospitality**. The old **16E Membership** workstream moves to **16F — Membership, Loyalty & CRM**.

**Reason:** the older forward A–E map no longer represented the systems Oraya has shipped or the remaining business work. It still described 16A and 16C as open/planned, treated NetCommerce checkout as the practical Phase 16B boundary, omitted the broader hospitality-operations layer, and stopped before the approved growth, internationalization, reputation, and business-intelligence workstreams. The consolidated sequence makes the general roadmap discoverable without chat memory while keeping implementation detail in the existing source-of-truth documents.

**Impact:** [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) becomes the canonical forward-looking roadmap; [PROJECT_STATE.md](PROJECT_STATE.md), [CURRENT_PHASE.md](CURRENT_PHASE.md), [/docs/phases/PHASE_INDEX.md](../phases/PHASE_INDEX.md), and [OPS_MIGRATION_PLAN.md](OPS_MIGRATION_PLAN.md) expose the same sequence and classification. Historical delivery records remain intact and receive supersession notes where they could otherwise be mistaken for current planning. Existing technical SEO/indexing, member accounts, Phase 16C delivery paths, `/ops` business metrics, and Phase 16B provider/evidence gates remain current technical truth. This decision is documentation-only and does **not** authorize implementation, schema, dependency, environment, provider, or behavior changes for any planned phase.

**Reversible?:** only through a later explicit owner roadmap decision recorded here; historical phase evidence remains append-only either way.

**Supersedes:** the forward-looking A–E roadmap in `/PHASE_16_PLAN.md` last updated 2026-06-03 and matching current/general roadmap references. It does not supersede historical implementation decisions or the current technical boundaries of completed and active work.

---

## 2026-08-09 - The live card-payments switch also lives in /ops, confirmed by the owner's own password

**Decision:** `POST /api/ops/setup/payments-live` becomes a second writer of the `payments_live_enabled` settings row. Enabling requires the signed-in **owner's own** password and shares the login throttle; disabling requires only an owner session. `/api/admin/payments/live-toggle` is left exactly as it is.

**Reason:** the 2026-07-25 decision placed the switch behind a single password-confirmed control in /admin Settings. That was right while /admin was the console. It stops being right the moment /admin goes dormant, because the only kill switch would live in a console nobody opens. Two writers of one row is acceptable here in a way it is not elsewhere: the row remains the single source of truth, both paths demand a password to enable, and neither can be reached without an authenticated session.

Requiring the owner's *own* password rather than a shared admin secret is a strengthening, not a relaxation: the log now records which person turned real card charging on, instead of recording that somebody who knew the admin password did.

The asymmetry is deliberate and is surfaced in the UI rather than hidden: turning payments **on** asks for a password, turning them **off** is one click. A kill switch that is slow at the moment it is needed is not a kill switch.

**Impact:** [app/api/ops/setup/payments-live/route.ts](../../app/api/ops/setup/payments-live/route.ts) added; [components/ops/LivePaymentsSwitch.tsx](../../components/ops/LivePaymentsSwitch.tsx) added and rendered on /ops/payments, replacing the banner that used to point at /admin. `/api/ops/setup` still exposes the value read-only.

**Reversible?:** yes — deleting the /ops route restores the single-writer arrangement.

**Supersedes:** 2026-07-25 "one switch, one ritual" insofar as it named /admin Settings as the sole writer. The ritual itself is unchanged.

---

## 2026-08-09 - Owner recovery for /ops is a parallel token system, not a shared one

**Decision:** `lib/ops-recovery.ts` duplicates the structure of `lib/admin-recovery.ts` with a distinct `ops_recovery` purpose claim and its own `ops_recovery_token_jti` settings row, rather than parameterising the existing helper. Operator lockout is handled by owner reset from the Team screen; only the owner gets a self-service email route.

**Reason:** both systems sign with `ADMIN_SECRET`, so the purpose claim is the only thing preventing an admin recovery link from resetting an /ops account and vice versa. Making one helper serve both would put that separation behind a parameter that a future caller can forget to pass. Two modules that each hardcode their own purpose cannot be misused that way. Cross-redemption is covered by tests in both directions.

Operators are excluded on purpose: an owner reset needs no mailbox, leaves a human in the loop, and avoids giving every staff member an emailed path to a console that can move money.

**Impact:** [lib/ops-recovery.ts](../../lib/ops-recovery.ts), [lib/ops-recovery.test.mts](../../lib/ops-recovery.test.mts), [app/api/ops/recovery/request/route.ts](../../app/api/ops/recovery/request/route.ts), [app/api/ops/recovery/reset/route.ts](../../app/api/ops/recovery/reset/route.ts), [app/ops-reset-password/page.tsx](../../app/ops-reset-password/page.tsx) added. `sendAdminRecoveryEmail` gained an optional `consoleName` (default preserves existing wording).

**Reversible?:** yes.

---

## 2026-08-09 - An /ops session ends when the staff row loses its password

**Decision:** `requireOps` now refuses any session whose staff row has `password_hash IS NULL`, in addition to the existing checks for a missing row and a deactivated account.

**Reason:** /ops sessions are stateless HMAC tokens with a 12-hour life and no server-side session table. Without this, an owner resetting a compromised account would clear the password while the intruder's cookie stayed valid for the rest of the day — the reset would look like it worked and would not have. Tying revocation to the row is what makes "Reset password" an actual containment action.

Consequence worth stating: changing your **own** password does not end your other sessions, because the row still has a password. Ending every session for a person requires the owner reset, or a schema change to add a token version. That limitation is documented in the change-password route rather than hidden.

**Impact:** [lib/ops-auth.ts](../../lib/ops-auth.ts), [app/api/ops/staff/[id]/route.ts](../../app/api/ops/staff/[id]/route.ts) (`reset_password` action), [app/api/ops/change-password/route.ts](../../app/api/ops/change-password/route.ts), [app/ops/account/page.tsx](../../app/ops/account/page.tsx).

**Reversible?:** yes, but reversing reintroduces the containment hole.
## 2026-08-09 - Card production completion is an evidence-gated activation mission

**Decision:** NetCommerce onboarding and live merchant activation for one-time Visa/Mastercard Unified Checkout are verified complete and must not be represented as future work. The remaining card-production work follows the seven evidence gates in [PHASE_16B_CARD_PRODUCTION_ACTIVATION_MISSION.md](PHASE_16B_CARD_PRODUCTION_ACTIVATION_MISSION.md): baseline reconciliation, Business Center security material, disabled production configuration, verified webhooks, non-charging readiness, one controlled real-card transaction, and refund/reconciliation/settlement plus deliberate monitored activation. Code completion, an activation email, a deployment, a browser success page, or a provider transaction by itself cannot close the mission.

**Reason:** the earlier planning language conflated provider onboarding, application engineering, credential configuration, and operational proof. That allowed completed NetCommerce activation to be described as missing while completed engineering sounded like live payment operation. An explicit evidence ladder makes ownership and completion objectively verifiable across future sessions and machines.

**Impact:** the card workstream starts from the existing PR #115 `master` baseline and preserves all implemented security/ledger controls. Production charging remains fail-closed. Every step records non-secret evidence, and the final result requires agreement among CyberSource, Oraya's immutable ledger/projections, verified webhook history, refund/reconciliation, and settlement/remittance. Apple Pay, saved cards, and native wallets retain separate activation gates.

**Reversible?:** the sequencing can be amended with new provider evidence; the rule against claiming completion without end-to-end money evidence is not reversible.

---

## 2026-08-09 - Provider capabilities require separate proof and activation

**Decision:** a configured card gateway does not implicitly activate Apple Pay, saved cards, or any Lebanese wallet. Apple Pay uses CyberSource Unified Checkout `APPLEPAY` only for an Apple-only payment request and only when `NETCOMMERCE_CYBERSOURCE_APPLE_PAY_ENABLED` is exactly `true`. Operations must create separate card and Apple Pay links so the immutable ledger can classify the method without guessing. The flag stays absent/off until merchant enrollment, exact-domain verification, and an Apple sandbox-device payment are proven. Whish, OMT, Suyool, and saved cards remain disabled as native rails until official merchant/TMS contracts, credentials, webhook/reconciliation behavior, and required policy approval are supplied.

**Reason:** a consumer app or a provider name is not proof that Oraya can initiate and reconcile merchant payments. Advertising an unapproved capability can strand guests, misclassify money, or create an unauditable settlement gap. Separate, fail-closed capability gates preserve accurate payment history and let manual receipt flows continue safely meanwhile.

**Impact:** Apple Pay capture-context support is dark by default, public payment pages do not show an actionable wallet button until both ordinary checkout readiness and the Apple-specific flag are true, and `/ops/payments` exposes the card/Apple readiness split plus ambiguous attempts, failed provider events, merchant references, and recorded gross/fee/net totals. [sql/phase-16b-apple-pay-provider-ledger.sql](../../sql/phase-16b-apple-pay-provider-ledger.sql) makes the canonical provider writer accept Apple-only requests, records them as `wallet` / `apple_pay`, protects against a duplicate active booking collection, and was installed with a rolled-back live proof. No provider is activated by this decision.

**Reversible?:** the individual capability flags are deliberately reversible after their evidence gates pass; the requirement for auditable provider proof is not.

---

## 2026-08-09 - Card authorization records through canonical payment requests

**Decision:** booking-time and standalone NetCommerce card payments share the canonical `payment_requests` front door, request-scoped `payment_attempts`, and atomic `oraya_record_provider_payment` ledger writer. `/pay/[token]` renders a card action only when server readiness is open. Browser return and verified webhook reconciliation use the same provider-attempt idempotency key; the immutable transaction is the money fact and booking fields are projections. Apple Pay is not implied or activated by card readiness.

**Reason:** a booking-only card path would duplicate payment truth and leave standalone links unable to use the bank gateway. The request ledger already represents what is owed, while attempt uniqueness, provider idempotency, and an atomic transaction/projection write prevent double charging and partial state updates.

**Impact:** [sql/phase-16b-card-payment-requests.sql](../../sql/phase-16b-card-payment-requests.sql) is installed on live Supabase. It permits standalone request attempts, enforces one in-flight attempt per request, serializes browser/webhook recording, and blocks operator receipts during a claimed provider call. New request-scoped session/completion routes reuse the existing bank-controlled Unified Checkout page. Production remains fail-closed and no card data is stored by Oraya.

**Reversible?:** application routing is reversible before live use; immutable provider transactions and their audit history must be retained once real payments exist.

---

## 2026-08-08 - Ops migration Batches 3–7: media, site settings, members, calendar feeds, business numbers

**Decision:** five batches shipped together so the owner can test a complete `/ops` in one pass rather than verifying each batch separately (David's explicit request).

- **Photos (B3):** owner-only screen over the new `/api/ops/media`, mirroring the admin route's rules — storage-path allowlist (`general` + villa slugs), DB row deleted BEFORE the storage object (ME-5, so a partial failure can only orphan a file), and **button-based reordering** because the legacy manager was HTML5-drag only and cover images could not be changed from a phone at all (ME-6). A failed reorder force-refetches so the screen shows server truth (ME-2). Testimonials edit/approve/hide via `PUT /api/ops/setup/testimonials`; an approved testimonial must have a guest and a quote (the site would otherwise render an empty card).
- **Site (B4):** WhatsApp number, notification emails, per-villa instant booking, Butler check-in guidance. `PUT /api/ops/setup/site` ALLOWLISTS exactly those keys, so the protected rows (admin password, recovery jti, live-payments switch) are unreachable by construction, not by filtering. Audit S-10 fixed: the number is validated (8–15 digits) instead of accepting any string — including empty — and still reporting success.
- **Members (B5):** search (M-4), booking count shown before deletion (M-5), and **edit** via the new `PATCH /api/ops/members/[id]` — the admin API had DELETE only, so fixing a phone number required SQL (M-6). Deletion revokes the auth account first (G8 ordering) and reports partial failure honestly; the dialog names the consequence (bookings survive, detached).
- **Calendar feeds (B6, partial):** owner-only CRUD at `/api/ops/calendar-sources` — connect, rotate a link, pause/resume, remove — closing audit C-2 (rotating an Airbnb URL previously required hand-written SQL). URLs are validated to http(s); rotating one clears the stale sync verdict. **Deliberately not done:** `/api/cron/calendar-sync` still returns 200 when every feed fails; it is a LOCKED route and editing it needs its own named approval. Feed staleness remains visible in /ops meanwhile.
- **Business (B7):** owner-only screen over pure, unit-tested `lib/ops-business.ts` (6 tests). Audit D-8 is the governing rule: cancelled bookings are excluded from revenue, occupancy and add-on uptake — appearing only in "refunds owed" — and every metric states its population. Revenue means money RECORDED; contracted-but-unpaid is reported separately as "still expected", never blended.

**Reason:** the operator is starting and David wants one console. After these, the only remaining reasons to open `/admin` are the auth flows (Batch 8, decision-gated) and the deletion itself (Batch 9, soak-gated).

**Impact:** new `app/api/ops/{media,members,members/[id],calendar-sources}/route.ts`, `app/api/ops/setup/{testimonials,site}/route.ts`, `app/ops/{media,site,members,business}/page.tsx`, `lib/ops-business.ts` + tests; extended `app/api/ops/setup/route.ts`, `components/ops/{setup-shared,OpsShell}.tsx`, `app/ops/availability/page.tsx`. No schema change, no locked-route edit, no new dependency.

**Reversible?:** yes.

---

## 2026-08-09 - CyberSource webhook MLE and digital-signature keys are separate

**Decision:** payment and Unified Checkout webhooks must decrypt the compact-JWE payload first, then verify the timestamped `v-c-signature` over `timestamp + "." + decryptedPayload` using a separately issued Base64 digital-signature secret and key ID. The delivery timestamp must be within five minutes. A verified delivery must claim both its provider delivery ID and a stable semantic replay key in `payment_provider_events` before any attempt or booking state can change.

**Reason:** CyberSource's current Webhooks guide requires MLE for payment/Unified Checkout events and documents a distinct digital-signature key from `/kms/egress/v2/keys-sym`. The earlier temporary receiver incorrectly used the webhook MLE private key as an HMAC secret over the raw request body and did not durably claim retries before reconciliation.

**Impact:** [lib/payments/credit-libanais-webhook.ts](../../lib/payments/credit-libanais-webhook.ts) now owns JWE decryption, protected-key checks, signature parsing/tolerance, event parsing, and replay-key derivation. The dedicated handler persists verified claims before reconciliation. Two new server-only Vercel variables hold the digital-signature key ID and secret; they are never reused for MLE or REST API authentication. [sql/phase-16b-nc-provider-events.sql](../../sql/phase-16b-nc-provider-events.sql) additively links `payment_attempts` to canonical requests. No provider was activated.

**Reversible?:** no for production security posture; the deployment can be rolled back, but the temporary raw-body/MLE-key HMAC scheme must not be restored or subscribed.

**Supersedes:** the temporary webhook signature scheme documented in the 2026-07-25 Plan 4 foundation. It does not supersede the monotonic attempt/reconciliation model.

---

## 2026-08-09 - Canonical payment ledger is server-only, append-only, and projection-safe

**Decision:** introduce `payment_requests`, `payment_transactions`, and `payment_provider_events` as the canonical Phase 16B foundation. Client roles receive no table access; authenticated `/ops` routes use the server service role. Financial transaction facts cannot be edited after insertion. A correction appends one linked reversal, and a booking-linked reversal restores the exact pre-receipt booking projection. Booking-linked requests use USD because the existing booking balance columns are USD; standalone requests may use USD or LBP, and a received amount may retain a distinct applied amount/exchange rate.

**Reason:** cash and Lebanese manual rails need an attributable history that cannot be silently overwritten, while the pre-existing booking columns must remain compatible for all current guest/admin screens. Exact pre-projection snapshots avoid corrupting older bookings whose legacy status fields predate the new balance lifecycle.

**Impact:** [sql/phase-16b-f1-payment-ledger.sql](../../sql/phase-16b-f1-payment-ledger.sql) was applied additively to the live ORAYA Supabase project and tested with rolled-back request/booking receipt and reversal transactions. New operations and public routes are described in [ARCHITECTURE.md](ARCHITECTURE.md). No provider was activated and no PAN/CVV/token is stored.

**Reversible?:** hard after real receipts exist; the application code is reversible, but ledger history must be retained for audit.

**Supersedes:** no security decision. It supersedes the architectural assumption that mutable `bookings.payment_*` columns alone are the payment history.

---

## 2026-08-09 - Phase 16B is Oraya's complete payment system

**Decision:** define Phase 16B as Oraya's complete business payment system, not as a synonym for NetCommerce/CyberSource card checkout. The phase includes cash, bank/manual transfer, credit/debit cards, Apple Pay, Whish, OMT Pay, Western Union, the provider provisionally identified as Suyool/"Sunbook Pay", standalone Oraya payment links, booking-linked requests, partial/multiple payments, refunds/reversals/reconciliation, and tokenized saved cards for members. The canonical target is a payment-request layer plus an immutable transaction ledger; `bookings.payment_*` fields remain summaries rather than the only money history. Delivery starts with the ledger foundation and complete cash workflow. Provider integrations and saved-card activation remain independently gated.

**Reason:** Oraya must collect money outside website booking checkout, including from callers/WhatsApp contacts with no booking, and must accurately operate several Lebanese payment rails. A single mutable payment summary and link stored on a booking cannot safely represent multiple payments, standalone requests, manual receipts, provider events, corrections, or reusable member instruments.

**Impact:** [PHASE_16B_PAYMENT_SYSTEM_MISSION.md](PHASE_16B_PAYMENT_SYSTEM_MISSION.md) is the canonical product/architecture mission. Existing NetCommerce security work, including PR #104 and PR #109/16B-2B1, remains valid as one workstream and must not be duplicated or discarded. The current NetCommerce launch's saved-card omission remains in force, but saved cards are now a later Phase 16B workstream requiring provider tokenization, explicit member consent, revoke controls, and security/legal approval. "Sunbook Pay" is not treated as a confirmed provider name; Suyool is only a provisional match pending owner confirmation. Public consumer features for Whish/OMT/Suyool do not prove an Oraya merchant API, so native integrations require official contracts and technical documentation.

**Reversible?:** hard - this is the owner's stated business-system boundary; changing it would alter the product mission.

**Supersedes:** the permanent-scope portion of the 2026-06-22 saved-card omission decision and older Phase 16B plans that use booking-linked NetCommerce/hosted checkout as the phase boundary. It does not supersede the current one-time-card launch constraint or any payment security control.

---

## 2026-08-08 - Phase 16B-2B1 replaces HTTP Signature with JWT and encrypts Payments API messages

**Decision:** authenticate CyberSource `/uc/v1/sessions` and `/pts/v2/payments` requests with shared-secret HS256 JWT/JWS v2. Apply compact-JWE request and response MLE to `/pts/v2/payments` only: request encryption uses the CyberSource SJC public certificate (`RSA-OAEP` + `A256GCM`), and response decryption requires the configured REST-API Response MLE key (`RSA-OAEP-256` + `A256GCM`) with an exact `kid` match. A missing, plaintext, malformed, wrongly keyed, or undecryptable post-submission response throws into the existing ambiguous/do-not-retry attempt path. Keep capture-context creation JWT-authenticated without unsupported request MLE.

**Reason:** CyberSource is deprecating HTTP Signature and requires the current JWT construction contract by September 2026. Payment request/response encryption closes the synchronous authorization confidentiality gap while preserving Oraya's already-merged duplicate-charge and monotonic state protections.

**Impact:** adds pinned server-only `jose@6.2.8`, [lib/payments/cybersource-jwt-mle.ts](../../lib/payments/cybersource-jwt-mle.ts), deterministic crypto contract tests, and four server-only MLE credential names. `capture: true`, `oraya_...` provider session IDs, `oraya-att-<attempt-id>` merchant references, booking/payment state separation, and the live kill switch are unchanged. No provider call, real credential, Vercel configuration, schema, webhook subscription, or production activation is included. Production remains blocked on final webhook JWE/signature/replay work plus the documented human gates.

**Reversible?:** yes at code level, but returning to HTTP Signature would violate the current provider migration direction.

---

## 2026-08-07 - Ops migration Batch 2: the full add-on rule set moves to /ops

**Decision:** the /ops Extras screen now edits **every** `AddonOperationalFields` value (`lib/addon-operations.ts`) through a per-row "Rules" panel — per-villa applicability, applies-to (stay/event/both), category, advance notice + cutoff type, enforcement mode, price basis (fixed/percentage + percentage value), recommended, display order, quantity enablement + unit label + min/max, event pricing unit, and the guest-facing description. `PUT /api/ops/setup/addons` validates all of it strictly server-side (unknown villa, event type, or enum value is refused; a percentage basis requires a 0–100 value; min ≤ max) because the shared parser is lenient by design for READS and would silently drop bad input on a write. The keys the screen owns are stripped from the stored blob before the merge, so clearing a value (e.g. deleting a description) actually clears it rather than the old value resurfacing; keys the screen does not send still round-trip untouched. The R-2 all-addon-wipe guard and the R-6 partial-failure reporting are unchanged. Audit R-5's warning is honoured in the UI: percentage pricing states that it reprices live guest quotes.

**Reason:** `/admin/rates` was the last place these rules could be changed. With this, the rates page has no unique capability left.

**Impact:** extended `app/api/ops/setup/addons/route.ts` and `app/ops/extras/page.tsx`. No schema change, no locked-route edit, no new dependency.

**Reversible?:** yes.

---

## 2026-08-07 - Ops migration plan adopted; Batch 1 (booking odds and ends) shipped

**Decision:** retiring `/admin` in favour of `/ops` is now a written, nine-batch plan — [OPS_MIGRATION_PLAN.md](OPS_MIGRATION_PLAN.md) — with each batch pre-written as a self-contained, dispatchable task prompt, plus two hard gates: a DECISION gate before Batch 8 (moving the live-payments switch ritual into /ops supersedes the 2026-07-25 single-writer decision, and the /ops password-recovery policy needs David's choice) and a SOAK gate before Batch 9 (at least one week of real operation entirely inside /ops before any deletion). Deliberately NOT executed as one mega-task: a single PR spanning money, auth, media and a 20k-line deletion is unreviewable and un-bisectable, and two of the batches depend on human decisions and lived verification that no prompt can fast-forward.

**Batch 1 shipped in the same session:** the ops feedback-request action mirrors `app/api/admin/bookings/[id]/send-feedback/route.ts` rule-for-rule (confirmed only, past-checkout only via `isPastCheckoutForFeedbackEmail`, cooldown → 409 via `isFeedbackEmailCooldownActive`, recipient via `resolveBookingRecipient`, same `sendFeedbackRequestEmail`, same `feedback_requested_at/channel/count` bookkeeping); `GET /api/ops/bookings/[id]/arrival-link` mirrors the Stage 4A admin mint (confirmed only, same signed view token at checkout-day expiry, returns nothing else); the Money card shows hosted payment-link state with an expiry-aware badge and copy; Enquiries shows and toggles the established `oraya_vip_lead` / `oraya_needs_human` labels (undo-over-confirm), with `labels` validated in the ops leads route. No admin route was edited.

**Reason:** David wants one console. The plan makes the remaining migration mechanical and resumable by any future session; Batch 1 removes the last booking-level reasons to open `/admin`.

**Impact:** new `docs/system/OPS_MIGRATION_PLAN.md`, `app/api/ops/bookings/[id]/arrival-link/route.ts`; extended `app/api/ops/bookings/[id]/route.ts`, `app/api/ops/leads/[id]/route.ts`, `app/api/ops/data/route.ts`, `lib/ops-queue.ts`(+test fixture), `app/ops/bookings/[id]/page.tsx`, `app/ops/enquiries/page.tsx`. No schema change, no locked-route edit, no new dependency.

**Reversible?:** yes.

---

## 2026-08-07 - /ops asks for money as Phase 16B continuity, and runs event proposals

**Decision:** /ops gains the ask-for-money half of the payment lifecycle and the event proposal flow — both as continuations of the existing systems, never as parallel ones.

**Money (16B continuity):** `request_deposit` writes `payment_status = "payment_requested"` with `payment_requested_at`, `deposit_amount`, `payment_due_at` and refreshes `amount_total`/`amount_due`/`payment_stage` through the shared `lib/payment-foundation.ts` helpers, then sends the SAME `sendBookingPaymentRequestedEmail`; `send_reminder` re-sends `sendBookingPaymentReminderEmail` and appends the same `appendPaymentReminderNote` trail; and `record_payment` now also advances `payment_status` to `deposit_paid`/`paid_in_full` with the same foundation math and sends `sendBookingPaymentReceivedEmail`. Every action is race-guarded on the lifecycle value the operator was shown (409 `changed_elsewhere`), preconditions match the admin's (confirmed stays only; reminders only while a request is open; refuses asking for more than is owed), and each is gated behind a rendered preview of the guest's email (`?action=request_deposit|send_reminder` on the message-preview route). Hosted-checkout payment links remain untouched — /ops asks and records; the 16B provider layer stays the only thing that charges a card.

**Events:** `save_proposal` / `send_proposal` write the Phase 15H proposal fields and send the existing `sendEventProposalEmail` (with `buildProposalEmailLineItems` over the stored included services), keeping the audit B-11 rule (an **accepted** proposal is a contract — /ops refuses to edit it, in the UI and at the API with a `.neq("proposal_status","accepted")` guard) and B-12 (no sending an already-expired validity date). Event **approval** is now allowed in /ops but only when `proposal_status === "accepted"` — the same rule the locked admin route enforces — and the availability conflict check passes `incomingIsEvent: true` so the Phase 14J setup-day block applies. The event confirmation email is the dedicated event one and no WhatsApp arrival guide is dispatched for events (16C boundary unchanged). The Today queue gained `event_proposal_needed` and `event_accepted_unconfirmed` so an accepted proposal cannot sit unnoticed.

**Reason:** the owner is handing day-to-day work to an operator; asking for money and running events were the last flows that still forced everyone back into the legacy admin. Events are real business (a stay can become a catered/decorated occasion), so they must live where the work happens.

**Impact:** extended `app/api/ops/bookings/[id]/route.ts` (+5 actions), `app/api/ops/bookings/[id]/message-preview/route.ts` (payment previews, event-aware), `app/api/ops/data/route.ts` + `lib/ops-queue.ts` (+proposal fields, +2 queue kinds, 5 new tests), `app/ops/bookings/[id]/page.tsx`, `app/ops/page.tsx`, `app/ops/enquiries/page.tsx`; new `components/ops/RequestMoneyDialog.tsx`, `components/ops/ProposalCard.tsx`. No schema change, no locked-route edit, no new dependency, no new email template.

**Open design question (named, not silently resolved):** converting an existing STAY into an event (catering/decoration on a booked stay) is not implemented — today that means either add-ons on the stay or a separate event enquiry. Which of the two should become the supported path is an owner decision.

**Reversible?:** yes.

---

## 2026-08-07 - /ops owner screens: Pricing, Extras, Payments per the approved prototype; setup writes are guarded

**Decision:** the owner half of /ops ships (branch `claude/ops-owner-screens`), built to the approved `oraya-admin-prototype` design: Live-now banners, a pending-changes bar that names every unsaved edit in a human sentence ("Villa Byblos weekend night: $700 → $750"), and strike-through removal with "Keep it". New owner-only API surface (`requireOps({requiredRole:"owner"})` — an ops session never passes an /api/admin guard, and the operator role is refused by the API): `GET /api/ops/setup` and `PUT /api/ops/setup/{pricing,addons,payments}`, writing the SAME stores the website reads (`villa_base_pricing`, the `addons` table + `addon_operational_settings`, `payment_public_settings`). Write discipline: strict server-side pricing validation (the shared lenient parser falls back to DEFAULTS and must never gate a write) + the shared `validatePricing` error gate; compare-and-set on both settings blobs via `expected_raw` (409 `changed_elsewhere` instead of the S-8 silent whole-blob overwrite); the R-2 all-addon-wipe guard preserved; the add-ons write round-trips unedited operational fields and overlays only `requires_approval`, reporting a second-phase failure explicitly (`code: "partial"` — R-6 lesson). **The fail-closed live-payments switch is read-only in /ops**; its only writer remains `/api/admin/payments/live-toggle` (2026-07-25 decision reaffirmed). Prototype deviations recorded: no cleaning fee (engine has none), minimum nights per villa/season. Team additionally gains re-invite (fresh one-time link, `password_hash IS NULL` guard) and the operator-capabilities panel.

**Reason:** the operator hire is imminent; these screens move pricing and money levers into /ops under real role enforcement, which is the precondition for handing over the console.

**Impact:** new `app/api/ops/setup/{route,pricing/route,addons/route,payments/route}.ts`, `components/ops/setup-shared.tsx`; rewritten `app/ops/{pricing,extras,payments}/page.tsx`; extended `app/api/ops/staff/[id]/route.ts` + `app/ops/team/page.tsx`. No schema change, no locked-route edit, no new dependency, no live-toggle writer added.

**Reversible?:** yes.

---

## 2026-08-07 - /ops display truth: member contact, estimated totals, parsed stay-setup messages, add-on resolution; A-1 fixed

**Decision:** first production use of /ops showed the console reading the booking row too literally (live evidence: ref 574D64A5 — a member booking rendered as "Guest" with blank contact and a $0 total while the legacy admin showed the person and a $620 estimate). Fixes, all display/ops-scoped: `GET /api/ops/data` resolves member contact for member bookings (bounded distinct-id set; auth emails behind a process-lifetime cache) as an additive `member_contact`; `lib/ops-booking-display.ts` provides `bookingMoneyView` (recorded `amount_total` first, else the confirmation email's estimate = snapshot subtotal + priced add-ons, always labelled estimated, never fed into payment records) and `parseStaySetupMessage` (machine "[Stay Setup]" blocks become honest rows; the "[Booking Protocol]" system section is dropped; human messages render raw); the /ops booking detail gains an add-ons card with approve/decline via the new ops-guarded `PATCH /api/ops/bookings/[id]/addons` (mirrors the admin route's optimistic-concurrency write; resolved rows keep a "Change" affordance — audit B-14 ops-side); and audit **A-1** is fixed in `components/admin/PasswordGate.tsx` (a 429 lockout surfaces the server's throttle message instead of "Incorrect password" — the exact failure that locked the owner out on 2026-08-07). Focused tests: `lib/ops-booking-display.test.mts` (9) + 2 new queue tests.

**Reason:** the operator console must show the person and the money truthfully for ALL bookings, member ones included; estimates must be visible but never masquerade as recorded money; and the login must not lie about lockouts.

**Impact:** new `lib/ops-booking-display.ts` (+ tests), `app/api/ops/bookings/[id]/addons/route.ts`; extended `app/api/ops/data/route.ts`, `lib/ops-queue.ts` (member name + estimate in queue items), `app/ops/bookings/page.tsx`, `app/ops/bookings/[id]/page.tsx`, `components/admin/PasswordGate.tsx` (A-1 only). No schema change, no locked-route change, no new dependency; guest messaging untouched.

**Reversible?:** yes.

---

## 2026-08-07 - /ops Team + accept-invite + read-only Availability; invite delivery is link-only

**Decision:** the /ops **Team** screen ships over the existing owner-only `/api/ops/staff` API (invite, role change, disable/re-enable, remove), with invite delivery deliberately **link-only**: creating an invite shows a one-time `https://…/ops-invite/<token>` link exactly once (the server stores only a scrypt hash), and the owner sends it by WhatsApp or in person. `app/ops-invite/[token]` (outside the /ops auth shell, so the sign-in gate cannot bounce an invitee) + `POST /api/ops/invite/accept` redeem it: same IP throttle as login, one indistinguishable 400 for unknown/expired/used/deactivated invites, min-12-char password (house rule), single-use via a `password_hash IS NULL` write guard, session cookie attached on success. The **Availability** screen ships read-only: per-villa 3-month occupancy from confirmed stays (events include their setup day via the shared `getOperationalRange`) plus active `external_blocks` (now returned by `GET /api/ops/data`), and per-feed freshness staged honestly against the real 10-minute cron-job.org schedule (fresh / limping ≥1h / dead ≥24h / failing). Feed CRUD stays with G13. `lib/ops-queue.test.mts` (12 tests) pins the queue's inclusion/ordering rules and the `villaName` fix (canonical "Villa X" values were double-prefixed to "Villa Villa X" on queue rows).

**Reason:** the Team screen is the gate to creating the operator's account (OPS_ADMIN_V2 §6); a Resend invite email is deliberate future work because one person is being hired, not fifty. Availability gives the operator the calendar truth the old admin scattered, without touching sync logic.

**Impact:** new `app/api/ops/invite/accept/route.ts`, `app/ops-invite/[token]/page.tsx`, `lib/ops-queue.test.mts`; rewritten `app/ops/team/page.tsx`, `app/ops/availability/page.tsx`; extended `app/api/ops/data/route.ts` (external_blocks), `components/ops/OpsProvider.tsx` (externalBlocks), `lib/ops-queue.ts` (villaName export + fix). No schema change, no locked-surface touch, no new dependency.

**Reversible?:** yes.

---

## 2026-08-07 - One shared guest-dispatch module for booking status changes; /ops gains Enquiries + approve/decline behind message previews

**Decision:** the confirm/cancel guest email block and the Phase 16C WhatsApp Arrival Guide dispatch block were extracted verbatim from `app/api/admin/bookings/[id]/route.ts` into **[lib/booking-guest-dispatch.ts](../../lib/booking-guest-dispatch.ts)** (`dispatchBookingStatusGuestMessages` + `isEventInquiryBooking`). Both `/admin` (the locked PATCH route, edit explicitly authorized in the task prompt) and the new `/ops` approve/decline actions call this one copy — guest messaging for a status change must never exist in two copies. On top of it, `/ops` shipped: the **Enquiries** screen with lead→booking conversion (L-1 duplicate-booking guard client-side, L-6 `already_linked` 409 server-side in the new `PATCH /api/ops/leads/[id]`), and **approve / decline / cancel** on a booking, gated behind a server-rendered preview of the actual messages (`GET /api/ops/bookings/[id]/message-preview`) instead of an "Are you sure?" dialog. Status writes are race-guarded (`.eq("status", <what the operator saw>)` → 409), and `/ops` approve runs the same pre-write availability-conflict check and exclusion-violation handling as the admin confirm. Event inquiries are refused by the `/ops` API (proposal flow stays in the legacy admin until the event screens exist).

**Reason:** OPS_ADMIN_V2 §6 named these as the next build and required the extraction ("two copies of 'message the guest' is how guests get double-messaged"). Preview-over-confirmation is the standing owner design rule.

**Impact:** new `lib/booking-guest-dispatch.ts`, `app/api/ops/leads/[id]/route.ts`, `app/api/ops/bookings/[id]/message-preview/route.ts`, `components/ops/MessagePreviewDialog.tsx`, `components/ops/ConvertLeadDialog.tsx`; rewritten `app/ops/enquiries/page.tsx`; extended `app/api/ops/bookings/[id]/route.ts` (approve/decline actions) and `app/ops/bookings/[id]/page.tsx` (action card + dialogs); `GET /api/ops/data` additionally selects `whatsapp_leads.addons_interest`. The admin route's behaviour is preserved exactly (same recipients, same emails, same WhatsApp gating, same log tag). The email preview is a display-only mirror of `lib/send-booking-email.ts` content; the send itself always goes through the shared module, so preview drift can only ever be cosmetic.

**Reversible?:** yes for the /ops surfaces; the extraction should not be reversed (it is the anti-double-messaging invariant).

---

## 2026-08-06 - Payment attempts are monotonic; only explicit terminal declines are retry-safe

**Decision:** Unified Checkout completion classifies provider results as `approved`, `declined`, or `unknown`. Only an HTTP-success response with the explicit provider status `DECLINED` is a retry-safe terminal decline and may transition an attempt to `failed`, releasing the one-in-flight claim. HTTP errors, missing/malformed response data, pending/review/unknown statuses, and apparent approvals whose server-authoritative amount/currency echo cannot be verified are `unknown`; they transition to `ambiguous` and block another attempt. All durable attempt mutations are compare-and-set/status-guarded and must follow this graph: `claimed -> authorized|recorded|failed|ambiguous`, `authorized -> recorded|failed|ambiguous`, `ambiguous -> recorded|failed`; `recorded` and `failed` have no outgoing transitions. When a verified webhook records before the browser completion resumes, the browser accepts the terminal `recorded` winner, does not write the booking charge again, and returns idempotent success.

**Reason:** the prior completion path collapsed every non-approved provider result into `failed`, including HTTP and verification failures, which released the claim even though a charge could have occurred. Attempt updates were unconditional by row id, so browser/webhook interleaving could regress `recorded -> authorized -> ambiguous`. The guest page then replaced the route's reconciliation warning with generic retry copy. Together these failures could invite a second charge and erase the ledger's authoritative terminal state.

**Impact:** `lib/payments/credit-libanais.ts` emits the three-way outcome; `lib/payments/unified-checkout-completion.ts` orchestrates retry-safe decline versus ambiguous handling and recognizes an already-recorded winner; `lib/payments/payment-attempts-store.ts` enforces the allowed graph with expected-status filters; webhook reconciliation uses the same guarded store; the completion route exposes idempotent already-recorded success; and the checkout client renders the server's safe message while treating post-submission client exceptions as unknown/do-not-retry. Focused tests cover provider response classification, terminal-state ordering, webhook-before-browser return, duplicate/concurrent behavior, decline retry, timeout/unknown blocking, missing-ledger fail-closed behavior, stale webhook races, and guest messaging. No schema, dependency, environment, credential, live gate, booking-confirmation, saved-card/tokenization, or refund-policy change.

**Reversible?:** technically yes, but reverting would reintroduce a duplicate-charge and ledger-regression risk. Any replacement must preserve the three-way outcome contract and monotonic terminal-state guarantees.

**Supersedes:** narrows the 2026-07-24 Plan 3 rule that described all provider non-approvals as `failed`; extends the 2026-07-25 verified-webhook authority decision with durable CAS/status guards.

---

## 2026-08-02 - Phase 16A native Flow closeout: 2026-08-01 funnel hardening recorded; canonical Flow artifacts committed

**Decision:** the Phase 16A native-Flow cutover (decided 2026-07-31, entry below) is closed out with three additions.

1. **2026-08-01 funnel hardening (operator-side, WhatChimp tenant only):** the guest-facing wrapper/launch message was rewritten around a **"Book now"** button and the direct-booking link was **removed from the wrapper** — the static `https://stayoraya.com/book` fallback now lives only in the post-submit handoff reply ("Stay Request - Website Handoff"). Multilingual trigger keywords were added to the greeting flow. The AI Agent **"Booking request" intent was repointed** from an empty/legacy target to the v7 bot flow, so AI-classified booking intent now launches Flow `40377`.
2. **Verification completed:** end-to-end test bookings on 2026-07-31 — `6ED26663` (keyword path) and `7D5C4BCD` (menu path) — and real guest traffic through the native Flow on 2026-08-01.
3. **Canonical artifacts committed:** [`artifacts/whatchimp/native-flow/`](../../artifacts/whatchimp/native-flow/) now holds the canonical Flow JSON v4 (the published, immutable Flow "Stay Request" = WhatChimp Flow ID `40377`; this JSON is the re-import source for any future v2), the v7 bot-flow export (carrying v6's **90 trigger phrases verbatim**), the "stay form" launcher export (**"stay form" is kept as the permanent private test entrance**), the handoff-reply export, the Flow banner image, and a README describing each file. The **archived v6 full export is intentionally not committed** — the operator's copy contains a live `X-Butler-Secret` and must never enter the repo; v6 remains intact on the tenant (triggers cleared) as the rollback path.

**Reason:** the 2026-07-31 entry recorded the cutover decision but predates the funnel hardening and the real-guest verification, and the canonical Flow source lived only on the operator's machine. A published Meta Flow is immutable, so losing the JSON would force a from-scratch rebuild for any v2.

**Impact:** docs and artifacts only — no product code, schema, secret, or WhatChimp/Meta asset changed. Standing operational rule reaffirmed: the wrapper text exists in THREE tenant locations that must always change together (v7 flow, greeting node, "stay form" launcher); the committed v7/launcher exports predate the 2026-08-01 wrapper rewrite, so the live tenant is authoritative for current wrapper copy. [PROJECT_STATE.md](PROJECT_STATE.md) updated to the post-cutover state; the pre-cutover audit is preserved at [PHASE_16A_NATIVE_WHATSAPP_FLOW_AUDIT.md](PHASE_16A_NATIVE_WHATSAPP_FLOW_AUDIT.md) with outcome lines updated (supersedes PR #97).

**Reversible?:** yes — the rollback path is unchanged from the 2026-07-31 entry (restore v6 triggers, repoint greeting/menu). Deleting the artifacts would only lose the canonical re-import source; not recommended.

**Supersedes:** nothing. Extends the 2026-07-31 "Native WhatsApp Flow becomes the production stay intake; v6 retained as rollback" entry below via its follow-up link.

---

## 2026-08-01 - Phase 16C: confirmed-stay dispatch template renamed to `oraya_arrival_guide_confirmed`; `#!variablename!#` composer rule is mandatory

**Decision:** the WhatsApp Utility Template sent by the confirmed-stay dispatcher is **`oraya_arrival_guide_confirmed`** (en_US, 5 body variables), replacing the never-activated planning name `oraya_booking_confirmed_arrival_guide_v1`. `CONFIRMED_STAY_TEMPLATE_NAME` in [lib/whatsapp/confirmed-stay-notification.ts](../../lib/whatsapp/confirmed-stay-notification.ts) and every doc reference were updated; the 2026-07-17 entry below is historical and intentionally unedited (append-only rule). Final chain: admin confirm → dispatcher (fires only when `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL` is set; Production only) → WhatChimp Webhook Workflow "Confirmed booking" → the Meta-approved template. Variable mapping lives inside WhatChimp (`villa`, `check_in`, `check_out`, `booking_reference`, `arrival_guide_url` → body variables; `phone` → recipient; `guest_name` → subscriber name); the payload allow-list is unchanged.

**Reason:** the live, Meta-approved, WhatChimp-linked template carries the new name. The rename surfaced a hard operational lesson: **WhatChimp-sent templates MUST be composed in WhatChimp's composer with `#!variablename!#` registry tokens** (Variables tab: `confirmedvilla`, `confirmedcheckin`, `confirmedcheckout`, `confirmedbookingreference`, `arrivalguideurl`). Templates authored Meta-side with numeric `{{n}}` placeholders have no WhatChimp variable linkage and send with zero parameters (Meta error `#132000`) — this cost weeks. Meta-side sample edits do not break the linkage. Sends are verified via WhatChimp → Workflow Report (message ID = success; `#132000` = broken linkage).

**Impact:** constant + comment in the dispatcher; doc sweep across [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) (final architecture + composer hard rule + ops runbook), [ARCHITECTURE.md](ARCHITECTURE.md), [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md), [CURRENT_PHASE.md](CURRENT_PHASE.md), `.env.example`. No gate, payload field, idempotency (`bookings.whatsapp_confirmation_sent_at`), or logic change.

**Reversible?:** yes — the constant is a single string; but the WhatChimp-side template linkage is authoritative, so the repo must always match the WhatChimp-composed name.

**Supersedes:** template name in the 2026-07-17 "Phase 16C: automatic WhatsApp Arrival Guide dispatch" entry (architecture there unchanged).

---

## 2026-07-31 - Native WhatsApp Flow becomes the production stay intake; v6 retained as rollback

**Decision:** production Book a Stay now uses the published native WhatsApp Flow **"Stay Request"** (WhatChimp Flow ID `40377`, one terminal screen). The Flow collects full name, ISO check-in/check-out through Meta DatePicker, villa, exact guests (`1`–`8` plus `more_than_8`), bedrooms (`1`–`3`), and optional requests. On terminal submit, WhatChimp calls the existing `POST /api/butler/lead` integration unchanged and sends the existing `prefill_url` website-handoff reply. The v6 Natural Stay Intake remains intact on the tenant with its trigger keywords cleared, making it the immediate rollback path rather than the active production intake.

**Reason:** the native Flow cutover was operator-completed and verified end-to-end twice on 2026-07-31 with real lead-to-booking continuations. DatePicker submitted `YYYY-MM-DD`, the lead rows held the correct normalized dates, and bookings completed through the existing secure website handoff. No repository backend or WhatChimp integration change was required.

**Impact:**

- A minimal **v7** bot flow and the Greeting / Main Menu Book a Stay button launch Flow `40377`; v6 stays dormant for rollback.
- The guest-facing wrapper/launch message exists in three WhatChimp locations that must remain aligned: the v7 flow, the greeting node, and the **"stay form"** test flow.
- Native-Flow subscribers receive the `oraya_flow_submitted` label.
- Accepted platform gaps at cutover: special requests and phone are not currently submitted by the native-Flow path.
- Native-Flow submissions can carry stale `check_in_text` / `check_out_text` subscriber fields because this path does not run v6's normalization response mappings. The authoritative parsed values are `normalized_check_in` / `normalized_check_out`; admin lead displays must prefer them and use raw text only for dates-pending fallback.
- Operator verification used leads `121580d1…` and `f39acccb…`, which continued to bookings `6ED26663` and `7D5C4BCD` respectively. These are operational test references, not credentials.
- No Meta asset, WhatChimp asset, API contract, schema, secret, booking pipeline, payment, email, auth, token, or calendar code changed for the cutover.

**Reversible?:** yes — restore the v6 trigger keywords and point the greeting/menu entry back to v6; disable the v7/native launch entry. The existing lead and secure `/book?h=...` contracts remain unchanged.

**Supersedes:** 2026-07-09 "Phase 16A WhatChimp production wiring locked" for the **production Book a Stay intake only**. v6 remains the documented rollback implementation; Plan an Event and Guest Identification v2 are unchanged.

**Follow-up 2026-08-02:** see the 2026-08-02 "Phase 16A native Flow closeout" entry above — records the 2026-08-01 funnel hardening (wrapper "Book now" rewrite, multilingual greeting keywords, AI Agent "Booking request" intent repointed to v7), the real-guest verification of 2026-08-01, and the commit of the canonical Flow artifacts to `artifacts/whatchimp/native-flow/`.

## 2026-07-25 - Plan 4 Phase 3: fail-closed live rollout switch replaces the sandbox-only gate

**Decision:** the hardcoded `checkoutReady = configured && environment === "sandbox"` gate is replaced by an explicit, fail-closed rollout decision (`lib/payments/live-rollout.ts` `decideCreditLibanaisCheckoutReady`): checkout is ready when (a) all session env config is present AND (b) environment is `sandbox`, OR (c) environment is `production` AND all webhook/MLE env vars are present AND the server-side settings row **`payments_live_enabled` reads exactly `"true"`**. Missing row, any other value, or an unreadable settings table ⇒ NOT ready. The row is the kill switch — flipping it away from `"true"` disables live checkout instantly without a deploy. The ONLY writer is the dedicated endpoint `/api/admin/payments/live-toggle`: ENABLING requires the current admin password (same throttle discipline as the password-change flow); DISABLING requires only the admin session so the kill switch is never slowed down. The generic settings POST shields the key exactly like `admin_password`; the admin Settings payments panel gains the toggle (stark copy) and shows the CURRENT readiness verdict with the exact missing items (readiness became async end-to-end: `provider.getReadiness()` now returns a Promise).

**Reason:** the production gate's second half — "live rollout controls". Go-live must be: env vars in Vercel → readiness shows zero missing → flip one admin switch; and un-live must be instant.

**Impact:** `lib/payments/live-rollout.ts` (+ tests, every gate combination), `live-rollout-setting.ts`, async readiness through `provider.ts`/`stripe.ts`/`runtime.ts` and the settings/readiness/session/completion routes, new `/api/admin/payments/live-toggle`, PROTECTED_KEYS extension, PaymentSettingsSection + admin settings page UI. Tests +9 (`live-rollout.test.mts`).

**Reversible?:** yes.

## 2026-07-25 - Plan 4 Phase 2: verified webhooks are authoritative for payment attempts; webhook endpoint fails closed

**Decision:** the CyberSource/NetCommerce webhook endpoint (`/api/payments/webhook/credit_libanais`) now has a dedicated fail-closed handler: missing MLE/verification env vars ⇒ **503** (payload never processed); missing/mismatched signature ⇒ **401** + structured log, never a state change (`lib/payments/credit-libanais-webhook.ts` — HMAC-SHA256 over the raw body keyed with the Base64-decoded webhook MLE private key, plus `v-c-key-id` match; if NetCommerce's delivered production spec differs, that one module adapts while the fail-closed contract stays). A VERIFIED event is matched to its `payment_attempts` row by `idempotency_key` (= `clientReferenceInformation.code`) or provider transaction id and is authoritative (`lib/payments/webhook-reconciliation.ts`): confirmed success for a claimed/authorized/**ambiguous** attempt records the payment on the booking through the EXISTING idempotent set-paid discipline (`decideSetPaidUpdate` + NULL-safe not-paid guard + matched-row check) and marks the attempt `recorded` — auto-resolving most ambiguous states without a human; confirmed decline/void marks it `failed` (releasing the one-in-flight claim). Contradictions with terminal states (success-for-failed, decline-for-recorded) log RECONCILIATION REQUIRED and change nothing. `GET /api/health` additionally reports counts of attempts stuck in claimed/ambiguous >1h (counts only, no amounts/guest data, verdict unchanged).

**Reason:** the production gate's first half — "webhook/MLE reconciliation" — plus KNOWN_BUGS #14's residual: `ambiguous` attempts previously always required manual Business Center lookups.

**Impact:** new `lib/payments/credit-libanais-webhook.ts`, `credit-libanais-webhook-handler.ts`, `webhook-reconciliation.ts`; `payment-attempts-store.ts` gains reference lookup + stuck counts; `webhook-handler.ts` routes credit_libanais to the dedicated handler (Stripe sandbox path untouched); `/api/health` extended. Tests +22 (`credit-libanais-webhook.test.mts` 12, `webhook-reconciliation.test.mts` 10).

**Reversible?:** yes.

## 2026-07-25 - Plan 4 Phase 1: manual-first refunds (KNOWN_BUGS #15 resolved-by-policy)

**Decision:** refunds stay MANUAL — executed by hand in the NetCommerce Business Center — and the admin UI records them honestly. The former "Issue refund" action is now **"Record manual refund"** with explicit copy that it only records an already-executed refund, and it REQUIRES the Business Center refund/transaction reference (`lib/payments/manual-refund.ts`; missing reference ⇒ 400). The reference is persisted to `bookings.refund_provider_reference` (`sql/plan4-refund-provider-reference.sql`, additive human-run; the PATCH route tolerates the pre-migration state by retrying without the column — the reference always also lands in `payment_notes`). Both money-back paths (manual refund + ambiguous payment-attempt reconciliation) live in one operator doc: `docs/system/REFUND_RUNBOOK.md`.

**Reason:** KNOWN_BUGS #15 — the old label implied the button moved money when it only wrote bookkeeping fields. David decided 2026-07-24 that automated provider-side refunds are a separate later plan; the honest baseline must ship before production card payments.

**Impact:** admin PaymentSection copy + required reference field; validation in `app/api/admin/bookings/[id]` PATCH; new runbook; KNOWN_BUGS #15 → resolved-by-policy. Tests +7 (`lib/payments/manual-refund.test.mts`).

**Reversible?:** yes.

## 2026-07-24 - Plan 3 Phase 5: Next 16 + React 19 upgrade

**Decision:** the stack moved from Next 14.2.35 / React 18 to **Next 16.2.11 (Turbopack build) / React 19.2.8**, with eslint 9 + `eslint-config-next` 16 (flat `eslint.config.mjs`; `next lint` no longer exists, `npm run lint` = `eslint app components lib`), `@types/react(-dom)` 19, and **react-day-picker 9** (v8 peers on React ≤18; `fromDate`→`startMonth`, `modifiersClassNames` keeps the `deadCheckIn` class, calendar CSS in `/book` and `/events/inquiry` mapped to v9 class names). The official `next-async-request-api` codemod converted all dynamic-route params to Promises (9 API routes, 4 server pages, one client page via `React.use()`). The new react-hooks v6 (React Compiler) lint rules are pinned off — the ~35 flagged sites pre-date the upgrade and are separate refactor work. `package.json` **overrides** force patched `sharp@^0.35` and `postcss@^8.5.23` inside next, taking `npm audit` from 5 high (inside next@14) to **0 vulnerabilities**. `next.config.mjs` behavior (Supabase `remotePatterns` derivation + `unoptimized` fallback) is unchanged; tsconfig deltas are Next 16's auto-migration.

**Reason:** the last remaining `npm audit` high findings all lived inside next@14; the upgrade was deliberately sequenced LAST so Plan 3's payment/observability work landed on the stable stack first.

**Impact:** PR #93; David visually verifies homepage, /book calendar flow, both villa pages, admin dashboard + Bookings tab, booking view, and events inquiry on the Vercel Preview before merging. Tests 264/264, tsc/build/lint clean (37 pre-existing `no-img-element` warnings only).

**Reversible?:** yes (single branch), but staying on next@14 re-accepts 5 known high advisories.

## 2026-07-24 - Plan 3 Phase 4: /api/health config check + email-config observability (KNOWN_BUGS #2)

**Decision:** an unauthenticated `GET /api/health` (pure decision in `lib/health.ts`, route force-dynamic) returns 200 `{ok:true}` when the required production keys are present and 503 with the missing key NAMES (never values, nothing sensitive) otherwise — required set: `RESEND_API_KEY`, `ADMIN_SECRET`, `ADMIN_RECOVERY_EMAIL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The seven email senders that silently `console.warn`-skipped on a missing `RESEND_API_KEY` now report through `lib/email-config.ts` `reportMissingResendKey()`: in production a structured `console.error` with the stable grep-able tag `[email-config-missing]`, warn elsewhere (dev legitimately runs without Resend). Senders that already THROW on a missing key (`send-admin-recovery-email`, `send-feedback-request-email`) are unchanged — they were never silent.

**Reason:** KNOWN_BUGS #2 — a rotated/deleted `RESEND_API_KEY` meant bookings landed with zero confirmation emails and no alarm anywhere.

**Impact:** new `app/api/health/route.ts`, `lib/health.ts`, `lib/email-config.ts`; one-line change in each of the seven warn-site senders. Optional human action: point an uptime monitor at `/api/health`. Tests 264 → 270 on this branch (Plan 3 phases are independent PRs; with Phase 3's +9 the combined suite is 279).

**Reversible?:** yes.

## 2026-07-24 - Plan 3 Phase 3: durable payment-attempt idempotency for Unified Checkout completion (KNOWN_BUGS #14)

**Decision:** the Unified Checkout completion route now runs on a durable payment-attempt ledger. A `payment_attempts` row (`sql/plan3-payment-attempts.sql`, human-run BEFORE deploy) is inserted BEFORE the provider call, and a partial unique index (`unique (booking_id) where status in ('claimed','authorized','ambiguous')`) makes that claim atomic: a concurrent second completion gets a unique violation → 409 without touching CyberSource. A deterministic merchant reference derived from the attempt id (`oraya-att-<uuid>`, `lib/payments/unified-checkout-completion.ts`) is sent as `clientReferenceInformation.code` and stored as the attempt's `idempotency_key`; provider transaction ids are persisted onto the attempt immediately after the call. Every conditional booking update is `.select("id")` row-count verified — completion (approved charge, zero rows → attempt `ambiguous`, `RECONCILIATION REQUIRED` log, explicit non-success response) and session creation (zero rows → orphaned provider session logged + 409, never a capture context for a dead link). Terminal states: `recorded` (success), `failed` (decline — releases the claim so the guest can retry with a NEW attempt), `ambiguous` (timeout/unknown/zero-row — blocks all new attempts for the booking until a human reconciles against CyberSource; runbook in the SQL file, never auto-released). Pre-migration the route fails CLOSED (503) — there is no fallback to the unguarded path.

**Reason:** KNOWN_BUGS #14 — the production-payments blocker: two concurrent completions could both charge, the losing conditional update silently matched zero rows yet returned `ok: true`, and no durable record tied a retry to a provider operation.

**Impact:** new `sql/plan3-payment-attempts.sql` (human-run), new pure `lib/payments/unified-checkout-completion.ts` + Supabase store `lib/payments/payment-attempts-store.ts`, rewired `/api/payments/unified-checkout-complete`, row-count check in `/api/payments/unified-checkout-session`, additive `merchant_reference` input on `authorizeCreditLibanaisTransientToken`. Tests 264 → 273. **Production checkout remains DISABLED** — enabling it stays a separate explicit decision after KNOWN_BUGS #15 (provider-side refunds) is assessed.

**Reversible?:** yes (route rewiring is one commit), but reverting reopens a double-charge window — hard NO once production checkout is enabled.

---

## 2026-07-23 - Remediation Phase 1 (security critical) from the 2026-07-23 health check

**Decision:** the seven Phase 1 items of `REMEDIATION_PLAN.md` shipped on one branch: (1.1) the hardcoded `"Oraya2026"` admin-password fallback is deleted — `settings.admin_password` now stores a **scrypt hash** (`lib/admin-password.ts`, default option (b); `scripts/hash-admin-password.mjs` generates it) and login fails CLOSED (503 `admin_auth_unavailable`) whenever a trustworthy hash is absent, including a legacy plaintext row; (1.2) admin login is rate-limited via the human-run `admin_login_attempts` table (`sql/remediation-admin-login-attempts.sql`) — 5 failures/15 min per IP, 20 global, constant 500 ms failure delay, fail-closed when the table is unreachable; (1.3) route-boundary stay rules — max 60 nights, no past check-ins (UTC today allowed) — on `/api/bookings` POST and the member PATCH (`lib/booking-date-rules.ts`); (1.4) a Postgres `EXCLUDE USING gist` constraint on confirmed bookings (`sql/remediation-booking-overlap-constraint.sql`, preflight included) backstops the double-booking race, confirm writes are row-count-checked (`/api/booking-action` no longer burns tokens or emails on 0 matched rows) and 23P01 maps to the existing "dates unavailable" responses; (1.5) the guest availability calendars fail CLOSED with a retry UI instead of showing all dates free on fetch failure; (1.6) webhook `set_paid` is durably idempotent (`lib/payments/webhook-set-paid.ts` + NULL-safe conditional write); (1.7) CyberSource authorization responses must echo the requested amount AND currency (`lib/payments/authorized-amount.ts`, fail-closed) before any payment is recorded.

**Reason:** 2026-07-23 health-check report items 1–6 and 12 — publicly known admin password, brute-forceable login, unbounded stays, double-booking and double-count races, fail-open availability, and unverified gateway amounts are all production risks.

**Impact:** two new human-run SQL files in `sql/` (**run `remediation-admin-login-attempts.sql` BEFORE deploying** — admin login fails closed without it), the admin password must be rotated and stored as a hash, and locked booking/payment surfaces changed only in the narrow ways the plan mandates. Baseline 168 tests grew to 201, all passing; tsc + build clean.

**Reversible?:** yes per item (each is one commit), though reverting 1.1 would re-expose a public credential.

---

## 2026-07-23 - Remediation Phase 2 (hardening & correctness) from the 2026-07-23 health check

**Decision:** Phase 2 of `REMEDIATION_PLAN.md` shipped: (2.1) the member booking-modification PATCH uses `findAvailabilityConflict` (calendar blocks + event expansion), reprices date changes through the same audit/snapshot path as the booking POST (new pure `lib/pricing/reprice.ts` — Question 4 default "reprice" adopted), and requires integer guest counts; (2.2) outbound fetches are bounded — calendar feed sync is https-only with a 10 s timeout and 5 MB cap, Stripe/CyberSource calls carry 10–15 s timeouts; (2.3) the six public routes that echoed raw DB `error.message` now log server-side and return generic messages; (2.4) quick-win sweep — admin media PATCH validates rows and surfaces per-row failures, admin media POST validates the villa slug, `/api/profile` PATCH sanitizes and caps its four fields, the admin raw-payload log is dev-only, `/profile` loads in parallel with per-query error checks and an error state, the feedback-email action catches network failures, `/api/settings` GET distinguishes DB failure from "absent", the two route-local `makeAdminClient()`s were replaced by the shared `supabaseAdmin`, and `approve-addon` guards its snapshot write with jsonb optimistic concurrency (409 on conflict). **Reconciliation note:** the nine per-file `checkOutExpiryUnix` copies collapsed into `lib/checkout-expiry.ts` — the strict payments/checkout variant won, additionally hardened to reject Date.UTC rollover dates (`2026-99-99`); for every valid date the produced timestamp is byte-identical to the legacy formula. `getChargeAmount` and the member→recipient resolution are now shared helpers (`lib/payments/charge-amount.ts`, `lib/booking-recipient.ts`).

**Reason:** health-check items 8, 9, 10, 18 — correctness gaps and copy-paste drift on money- and availability-relevant paths.

**Impact:** behavior-preserving except where the plan explicitly demands otherwise (repricing on member date changes, strict invalid-date failure, generic public errors, 409 on concurrent add-on edits). Tests 201 → 208, tsc + build clean.

**Reversible?:** yes.

---

## 2026-07-23 - Remediation Phase 3 (CI & test coverage) from the 2026-07-23 health check

**Decision:** (3.1) `.github/workflows/ci.yml` now gates every PR and master push with `npm ci` (PUPPETEER_SKIP_DOWNLOAD), `tsc --noEmit`, `next lint`, `npm test`, and `next build` (Google-Fonts network note + restricted-runner fallback documented in the workflow); `package.json` gains a `test` script (`node --test "scripts/*.test.mjs" "lib/**/*.test.mts"`) so CI and humans run the identical command. (3.2) Money/token-critical libraries got focused edge-case suites: action/view tokens and butler prefill tokens (expiry, tamper, wrong-purpose, secret rotation), checkout deposit math, the pure overlap/event-expansion core under `findAvailabilityConflict`, the pricing engine (boundary dates, Beirut weekends, seasonal overrides, minimum stay), and `lib/money`. To make these modules loadable under node's test runner, several lib modules' `@/lib/...` imports were converted to relative `.ts` imports (behavior-identical; verified by tsc + build + full suite).

**Reason:** health-check items 7 and 11 — no CI gate and no coverage on the code paths that move money or gate booking state.

**Impact:** tests 208 → 239 across 19 suites; every future PR is gated. No runtime behavior change.

**Reversible?:** yes.

---

## 2026-07-23 - Remediation Phase 4 (dependencies) from the 2026-07-23 health check

**Decision:** `npm audit fix` plus minor bumps shipped: `ws` 8.21.1 (resolves the two high-severity ws advisories), `resend` 6.18.0, `@supabase/supabase-js` 2.110.8, `autoprefixer` ^10.5.4, `postcss` ^8.5.22. The five remaining audit findings all live inside `next@14.2.35`; their only fix is Next 16 — the **Next 15+/React 19 major upgrade stays a separate scoped task** (plan Question 3 default), listed under Human actions. README now documents `PUPPETEER_SKIP_DOWNLOAD=true npm install` for restricted networks.

**Reason:** health-check §4 — known-vulnerable transitive deps; major-version upgrade has real migration surface (async request APIs, caching defaults) and doesn't belong in a remediation sweep.

**Impact:** package.json/package-lock only; full gate (tsc, build, 239 tests) clean after the bumps.

**Reversible?:** yes.

---

## 2026-07-23 - Remediation 2 Phase B: the three Preview-gated refactors deferred from PR #85

**Decision:** (B.1) BookingsTable's six render sections are extracted: `PaymentSection`, `ProposalSection`, `AddonRows`, `CompactRow` as `React.memo` children keyed on the booking + their own draft/panel slice, fed per-card derived scalars and ONE permanently-stable actions object (useEvent-style ref-delegating wrappers), so a draft keystroke re-renders only the edited card and only the edited section within it; `ExpandedBookingDetails` moves verbatim to its own file but stays unmemoized ON PURPOSE (it renders only for the open card and its inputs are cross-booking with per-render identities — documented in the file header); the feedback modal already used the shared ConfirmDialog. BookingsTable shrinks 5,631 → 1,935 lines. (B.2) `/` is a server component with SEO metadata and server-fetched covers + approved testimonials (fail-safe to branded gradients); all interactivity lives in the `components/HomeClient.tsx` island; the CLAUDE.md/AGENTS.md "page.tsx must stay use client" rule is superseded by the new structure note; `/` now renders per request (supabaseAdmin is no-store by design). (B.3) homepage + villa-page covers render via `next/image` `fill` with `images.remotePatterns` derived from `NEXT_PUBLIC_SUPABASE_URL` (`/storage/v1/object/public/**`); a missing env at build falls back to `unoptimized` rather than hard-failing; SVG print plates stay `<img>`.

**Reason:** REMEDIATION_PLAN_2.md Phase B — these were explicitly deferred from PR #85 because they change rendering and require human eyes on a Vercel Preview.

**Impact:** rendering-path changes on `/`, `/villas/*`, and the admin bookings console. **Merge gate: visual Preview check (page list in the PR body).** tsc/lint/build/252 tests clean throughout.

**Reversible?:** yes (three isolated commits).
## 2026-07-23 - Remediation 2 Phase A: admin password change hardening + email recovery

**Decision:** (A.1) the admin password can only change through the new `POST /api/admin/change-password`: admin session AND the current password (verified against the stored scrypt hash), new password entered twice with a 12-character minimum, wrong-current attempts recorded in `admin_login_attempts` (shared 5/15-min throttle + 500 ms delay, helpers extracted to `lib/admin-login-attempts.ts`), audit log lines that never contain password values; the generic settings upsert refuses the `admin_password` key. (A.2) account recovery: a "Forgot password?" action on the login gate calls an always-generic send endpoint whose destination is exclusively the server-side `ADMIN_RECOVERY_EMAIL` env var (silent no-op when unset; global cap 3 sends/hour), delivering a one-time HMAC-signed 30-minute token (`lib/admin-recovery.ts`, parallel helper — locked token helpers untouched) whose jti is stored server-side and atomically claimed on spend (single-use; newer tokens supersede). The reset page lives at `/admin-reset-password` — deliberately OUTSIDE `/admin/*` because that layout's auth gate would block a locked-out admin — and stores a min-12 scrypt hash. The recovery-jti settings row is shielded from the generic settings GET/POST like `admin_password`.

**Reason:** REMEDIATION_PLAN_2.md Phase A — the plan-1 work left password changes cookie-gated only and no recovery path if the password is lost.

**Impact:** new routes `api/admin/change-password`, `api/admin/recovery/{request,reset}`, page `/admin-reset-password`; Settings UI gains current/new/confirm fields. Tests 252 → 264. HUMAN: set `ADMIN_RECOVERY_EMAIL=admin@stayoraya.com` in Vercel Production env; without it the recovery flow silently does nothing (by design).

**Reversible?:** yes.

---

## 2026-07-23 - Remediation Phases 5-6 (refactors, accessibility, cleanup) from the 2026-07-23 health check

**Decision:** behavior-preserving refactors shipped: (5.1) BookingsTable's 71 module-level pure helpers extracted verbatim to `components/admin/bookings/helpers.tsx` and shared with DashboardOperationsView (6 identical local copies deleted; its deliberately-different `getAddonStatusTone` kept local); the duplicated approve-addon fetch unified. (5.2, partial) the admin 45 s poll pauses while a payment edit is in flight and deep-equal poll payloads no longer re-render; the memoized render-section extraction is BLOCKED pending Preview-verified work (no admin credentials in the remediation environment to smoke-test the mandated manual pass). (5.3) /book's calendar validity rules, Butler-prefill hydration decisions, add-on availability rule, and add-on catalog load moved to pure `lib/booking/*` modules with tests — all three `react-hooks/exhaustive-deps` suppressions across /book and /events/inquiry are gone. (5.4) `lib/guest-format.ts`, `lib/guest-validation.ts`, and shared `components/theme.ts` replace 77 byte-identical local constant/helper copies; `friendlyError` deliberately stays per-page (different guest copy). (5.5, partial) the two villa pages merged into one config-driven `components/VillaPage.tsx`; villa routes are thin server wrappers exporting SEO metadata. Homepage server-component conversion is BLOCKED by CLAUDE.md's "page.tsx must stay use client" rule; next/image hero conversion deferred to a Preview-verified PR (remote Supabase `images.remotePatterns` cannot be validated here). (5.6) all 30 guest-form label/control pairs associated via htmlFor/id; shared accessible `components/admin/ConfirmDialog.tsx` (Escape, initial focus, focus trap, focus restore) replaces the feedback-email modal. (6.1) 55 stale remote branches audited: 26 provably merged (exact delete command in REMEDIATION_PLAN.md Human actions), 29 unmerged listed for David's review; nothing deleted.

**Reason:** health-check items 13-17 — duplication, oversized components, suppressed lint rules, missing a11y associations, and branch clutter.

**Impact:** tests 239 → 252; tsc/lint/build clean throughout; no schema or locked-surface behavior changes. Open follow-ups live in REMEDIATION_PLAN.md's Human actions.

**Reversible?:** yes.

---

## 2026-07-17 - Booking approval and payment are independent guest truths; one projection owns payment presentation

**Decision:** `bookings.status` continues to represent Oraya's operational approval, while `payment_status` and the payment-link fields represent money state. A valid guest state is therefore `status = pending` plus `payment_status = paid_in_full`; payment must not auto-confirm a booking. On `/booking/view/[token]`, booking-status messaging must be payment-neutral and the pure [lib/payments/guest-presentation.ts](../../lib/payments/guest-presentation.ts) projection is the sole owner of guest payment vocabulary, method labels, and return-message interpretation. Recorded payment states take precedence over stale payment-link state. Browser return parameters remain informational and cannot create a success state. Public checkout errors are fixed guest-safe messages; provider/configuration detail stays in server logs or authenticated admin readiness surfaces.

**Reason:** David's post-PR #81 Preview test produced an internally valid pending+paid booking, but two presentation systems contradicted each other: the booking-status card said "No payment required yet" while the authoritative payment panel said "Payment received successfully" and "Paid in full". The defect was state ownership and copy coupling, not provider-authority or booking-confirmation logic. A single pure projection makes the combined state matrix testable and prevents the same drift from returning.

**Impact:** guest-facing presentation and safe public error handling only: [app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx), [app/book/page.tsx](../../app/book/page.tsx), the hosted-checkout page and public payment routes, shared booking trust copy, the Credit Libanais decline fallback, focused tests, and source-of-truth docs. No schema, booking creation, booking-action, admin, calendar, cron, auth/token helper, email sender, webhook, refund operation, production credential, or production activation change. Duplicate-charge/idempotency, webhook/MLE, official declined-vector, settlement/reconciliation, provider-refund, and payment-email gaps remain production blockers.

**Reversible?:** yes for copy/projection implementation; hard to reverse safely as a domain invariant because coupling booking approval to payment would reintroduce false guest claims or unauthorized auto-confirmation.

**Supersedes:** refines the 2026-07-17 "Guest-facing payment polish before production activation" decision; it does not change that decision's checkout-unavailable fallback or the merged PR #64 provider architecture.

---

## 2026-07-17 - Phase 16C: automatic WhatsApp Arrival Guide dispatch — Architecture A (WhatChimp Webhook Workflow), fail-closed, at-most-once, no Meta credentials in repo

**Decision:** when a STAY booking becomes confirmed through one of the two authoritative confirmation writers ([app/api/booking-action/route.ts](../../app/api/booking-action/route.ts), [app/api/admin/bookings/[id]/route.ts](../../app/api/admin/bookings/%5Bid%5D/route.ts)), Oraya POSTs **one** safe JSON payload to a configured **WhatChimp Webhook Workflow URL** (Architecture A) so WhatChimp — which owns the WhatsApp template and delivery — sends the approved Utility Template **`oraya_booking_confirmed_arrival_guide_v1`** (variables: villa, check-in, check-out, booking reference, complete `arrival_guide_url`). The repo never calls Meta/WABA directly and stores no Meta credentials. Payload allow-list: `event`, `template`, `guest_name` (when safely available: `bookings.guest_name` else `members.full_name`), `phone` (digits-normalized `bookings.guest_phone` else `members.phone`), `villa`, `check_in`, `check_out`, `booking_reference` (existing public helper), `arrival_guide_url` (existing [lib/arrival-guide-link.ts](../../lib/arrival-guide-link.ts) builder — `/arrival/<signed-view-token>`, checkout-day expiry). **Never:** booking UUID as a field, internal IDs, PINs/gate/door/access codes, payment links, admin notes, secrets — access delivery remains Phase 16D.

**Fail-closed gates (all before any outbound call):** `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL` unset → skip (presence is the activation switch); non-production without `WHATSAPP_CONFIRMATION_ALLOW_NONPROD === "true"` → skip; event inquiries → skip (they use their own email path); missing phone → skip; `check_out` already past (UTC date-string comparison, no `new Date()` on stay dates) → skip (never send an instantly-expired link); reference/URL mint failure → skip. Every skip is a safe log line (reference + reason only — never the URL, token, secret, or full phone) and never blocks confirmation or the confirmed email.

**Idempotency (at-most-once):** immediately before the single POST, the dispatcher atomically claims the new nullable `bookings.whatsapp_confirmation_sent_at` (additive human-run migration [sql/phase-16c-whatsapp-confirmation-tracking.sql](../../sql/phase-16c-whatsapp-confirmation-tracking.sql); `update … where status = 'confirmed' and whatsapp_confirmation_sent_at is null returning id` — the `booking_action_tokens.used_at` pattern). Zero rows → already sent → silent skip, so the admin route's re-confirm (which re-sends email today) cannot double-message a guest. **No automatic retry in v1:** a POST failure after claiming is logged (`post_failed`, HTTP status; 3xx counts as failure — redirects are never followed) and the Stage 4A admin "Copy Arrival Guide link" is the manual fallback. A duplicate WhatsApp message is worse than a missed one.

**Reason:** the operator needs confirmed guests to receive their Arrival Guide on WhatsApp without manual copying, and WhatChimp must stay the single owner of WhatsApp templates/delivery (Phase 16A doctrine). Meta approval of the template is an operational activation gate, not a coding gate — the code ships dark and activates when the Production URL is set.

**Impact:** new [lib/whatsapp/confirmed-stay-notification.ts](../../lib/whatsapp/confirmed-stay-notification.ts) + focused `node:test` suite (22/22); one dispatcher call added after the email block in each authoritative writer (explicitly authorized locked-file edits; email behavior unchanged); additive migration; env vars documented in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) (`WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL`, optional `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_SECRET` sent as `X-Oraya-Webhook-Secret`, `WHATSAPP_CONFIRMATION_ALLOW_NONPROD`); operator activation steps in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md). Payment browser returns / unified-checkout completion cannot trigger (they never set `status`), booking creation cannot trigger, and `/api/butler/confirmed-guest-info` stays lookup-only.

**Reversible?:** yes — unset the env var to deactivate instantly; single-PR revert removes the dispatcher and call sites; the column is inert if unused.

**Supersedes:** none. Extends the 2026-07-15 Stage 4A/4B entries (manual copy + Butler field contract remain unchanged).

**Follow-up (2026-08-01):** the template was renamed to `oraya_arrival_guide_confirmed` — see the 2026-08-01 entry above; `oraya_booking_confirmed_arrival_guide_v1` here is the historical planning name and was never activated.
## 2026-07-17 - Guest-facing payment polish before production activation; checkout-unavailable handoff stays pending

**Decision:** Oraya may present a finished guest-facing payment journey before NetCommerce production credentials are available, but live charging stays blocked until the separate production-activation gate. `/book` keeps the primary **Continue to secure payment** CTA and secondary **Reserve now, pay later** CTA. When hosted checkout is not truly ready, the primary CTA creates the booking request through the existing booking pipeline and routes to `/booking/view/[token]?payment=pending`; it does not expose provider readiness, environment, setup-failure details, or technical gateway configuration to the guest. `/booking/view/[token]` shows one clear payment state (`Payment pending`, `Deposit paid`, `Paid in full`, `Payment link expired`, or `Payment could not be completed`) and removes duplicate/noisy payment-status presentation. Admin-only readiness surfaces may continue showing technical truth.

**Reason:** NetCommerce sandbox validation and saved-card omission are complete, but production credentials, webhook/MLE reconciliation, decline-vector validation, idempotency/reconciliation, and explicit human rollout approval are still pending. The public site should feel intentional and payment-ready without suggesting a fake charge, leaking implementation readiness, or conflating booking request status with payment receipt.

**Impact:** guest presentation only: `/book` fallback behavior, `/booking/view/[token]` payment status presentation, focused presentation tests, and docs. The CyberSource foundation is preserved: capture contexts still come from `/uc/v1/sessions`, payment completion remains server-authoritative through `/pts/v2/payments`, browser returns remain informational, saved-card/tokenization remains disabled, and `bookings.status` is not auto-confirmed by payment UI. No schema, `/api/bookings`, booking-action, admin, calendar, cron, auth, token-helper, webhook, refund, or production-env change.

**Reversible?:** yes - the presentation fallback can be adjusted in a later PR without changing provider state or schema.

**Supersedes:** PR #57 and older MPGS/placeholder payment branches are obsolete for Phase 16B execution and must not be merged or revived; the merged PR #64 / PR #65 CyberSource foundation remains the active architecture.

---

## 2026-07-15 - Follow-up: member-profile booking-view mint uses default temporary TTL (not checkout-day expiry)

**Decision:** correct the PR #77 member-profile mint so `POST /api/profile/booking-view` calls `createActionToken(bookingId, "view")` with the locked helper's **default temporary TTL (72h)** and does **not** set `expiresAt` from `check_out`. Authenticated owners retain profile access for as long as they own the booking row (including after checkout); each generated URL is temporary, and the member remints another fresh URL by clicking **View booking** again. Remove `check_out` from the profile booking-view select / `MemberBookingViewRow` / mint helpers, and remove all `new Date()` parsing of stay dates from this surface (AGENT_RULES §10). **Email checkout-day expiry is unchanged** — transactional senders remain a separate minting site.

**Reason:** tying profile remints to checkout left historical bookings with already-expired tokens and violated date-only discipline. Profile ownership is continuous; the signed URL is a short-lived credential that can be reissued on demand (same model as Butler's default-TTL booking-view links).

**Impact:** `lib/profile/member-booking-view.ts`, `app/api/profile/booking-view/route.ts`, focused tests, docs. No email, token-helper, booking-view page, Arrival Guide, or locked-pipeline changes.

**Reversible?:** yes — but reverting would reintroduce the historical-booking expiry defect.

**Supersedes:** none (follow-up correction to the 2026-07-15 "Member profile opens the canonical signed booking-view page" entry; that entry is not rewritten).

---

## 2026-07-15 - Phase 16C Stage 4B: Butler confirmed-guest boundary returns `arrival_guide_url` — the permanent WhatChimp field contract; still no outbound WhatsApp sender, no access/PIN delivery

**Decision:** `POST /api/butler/confirmed-guest-info` now returns one additional allow-listed field, **`arrival_guide_url`** — the permanent WhatChimp response-field contract for Arrival Guide delivery. Exact contract: field name is `arrival_guide_url` (never `arrival_url`, `guide_url`, `oraya_arrival_guide`, or `arrivalGuideUrl`); URL is `https://stayoraya.com/arrival/<signed-view-token>` (same guest-facing origin convention as other guest links); token is the existing signed booking-view `view` token minted with checkout-day expiry (`checkOutExpiryUnix(check_out)`, 23:59:59 UTC on checkout day) by the new shared builder [lib/arrival-guide-link.ts](../../lib/arrival-guide-link.ts) (locked token helper imported only). The field is populated **only** when the endpoint's existing gates have already passed — identity established via `orchestrateButlerIdentity` AND `bookings.status === "confirmed"` — plus two mint gates: a usable `YYYY-MM-DD` `check_out` and a villa that resolves through `resolveButlerVilla`. Every refusal branch (unverified, pending, cancelled, unknown-status) and any mint failure carries `arrival_guide_url: null`, consistent with the endpoint's existing null-on-refusal shape. On eligible responses the `safe_message` gains one appended sentence: "Your Arrival Guide is ready here: <arrival_guide_url>". **No outbound WhatsApp sender is implemented, no WhatChimp artifact is edited, and no access/PIN data is added** — future WhatChimp wiring must map exactly `arrival_guide_url` and reuse the `/arrival/<signed-view-token>` route; it must not invent a different field name, route, or token type.

**Reason:** Stage 4A gave the operator a manual copy workflow; the Butler boundary is the correct single place for WhatChimp to receive the same link automatically once the operator wires the confirmed-guest flow, because it already enforces identity + confirmed-status before disclosing anything sensitive. Reusing the same token/expiry keeps email, admin copy, and Butler delivery on one credential contract.

**Impact:** [app/api/butler/confirmed-guest-info/route.ts](../../app/api/butler/confirmed-guest-info/route.ts) (additive field + safe-message clause), new [lib/arrival-guide-link.ts](../../lib/arrival-guide-link.ts) + focused `node:test` suite `lib/arrival-guide-link.test.mts` (9/9). No token helper, email, admin, schema, env, or WhatChimp-artifact change. Operator-side WhatChimp mapping of `arrival_guide_url` is future work (BUTLER_PLAYBOOK operator note); Phase 16D access delivery remains unimplemented.

**Reversible?:** yes — single-PR revert of the field, helper, and docs; the WhatChimp contract only becomes hard once the operator maps it on the production tenant.

**Supersedes:** none. Extends the 2026-07-15 Stage 4A entry.

---

## 2026-07-15 - Phase 16C Stage 4A: WhatsApp delivery of the Arrival Guide stays MANUAL — admin copies `/arrival/<signed-view-token>`; no outbound WhatsApp sender, no WhatChimp field

**Decision:** Stage 4A ships a **manual** WhatsApp workflow only: a new admin-auth route `GET /api/admin/bookings/[id]/arrival-link` mints the personalized Arrival Guide URL for a **confirmed** booking (existing signed `view` token, `expiresAt: checkOutExpiryUnix(check_out)` — identical token type and expiry to the confirmed booking email), and a "Copy Arrival Guide link" action in the admin bookings console ([components/admin/BookingsTable.tsx](../../components/admin/BookingsTable.tsx), confirmed bookings only) copies that URL to the clipboard for the operator to paste to the guest on WhatsApp. The route refuses pending/cancelled bookings (403, no link minted) and missing/invalid `check_out` (400, no link minted), and returns nothing but the URL — no PINs, access codes, admin notes, payment links, or extra booking fields. **No outbound WhatsApp sending is implemented, no WhatChimp field is created, and no automation is claimed.** Future WhatChimp/automated delivery must reuse the exact same URL contract — `https://stayoraya.com/arrival/<signed-view-token>`, villa resolved from the booking row, never a villa-in-path route — and must not invent a different route or token type.

**Reason:** the operator needs a safe way to hand a confirmed guest their Arrival Guide on WhatsApp today, without waiting for (or risking) WhatsApp automation. Minting on demand with the same checkout-day expiry keeps every delivery surface (email, admin copy) on one credential contract, and admin-auth + confirmed-only gating keeps unconfirmed bookings from ever receiving a live link.

**Impact:** new `app/api/admin/bookings/[id]/arrival-link/route.ts` (admin-auth, read-only on `bookings`, mints via the locked helper imported only); small confirmed-only UI action + fetch handler in `BookingsTable.tsx`. No token helper change, no email change, no Butler/WhatChimp change, no schema/env change. Stage 4B+ (any automated WhatsApp delivery) and Phase 16D (access codes) remain unimplemented.

**Reversible?:** yes — single-PR revert of the route + UI action; nothing else depends on it.

**Supersedes:** none. Extends the 2026-07-15 Stage 3 entry.

---

## 2026-07-15 - Member profile opens the canonical signed booking-view page (no duplicate details UI)

**Decision:** the member `/profile` "My Bookings" surface does **not** grow a second booking-details page. Each booking card exposes a **View booking** action that obtains a fresh signed `/booking/view/[token]` path through `POST /api/profile/booking-view` (Bearer member auth). The server verifies `bookings.member_id` equals the authenticated user before minting; missing auth returns `401`, and a foreign or unavailable booking returns a non-disclosing `404`. Token creation uses the locked `createActionToken(..., "view")` helper (**import only** — `/lib/booking-action-token.ts` is not modified) and returns a **relative** path so Vercel Preview navigation stays on the same deployment. The Arrival Guide remains available only through the existing confirmed-booking gate on `/booking/view/[token]` → `/arrival/[token]`; pending / cancelled / invalid / expired states do not bypass that gate. Modify, Cancel, and WhatsApp remain sibling controls (no nested interactive elements). Client components import only the path-safety helper in `lib/profile/booking-view-path.ts` — never the signing module or `BOOKING_ACTION_SECRET`.

**Reason:** `/booking/view/[token]` is already the single canonical guest booking-details page (villa, dates, 8-character reference, status, payment context, Arrival Guide entry). Duplicating that UI on `/profile` would drift and risk leaking confirmed-only surfaces. Server-side ownership checks plus relative signed paths keep Preview parity and prevent cross-member token minting.

**Impact:** `app/profile/page.tsx` (View booking action), `app/api/profile/booking-view/route.ts`, `lib/profile/member-booking-view.ts` + `lib/profile/booking-view-path.ts`, focused `node:test` coverage, docs updates. No schema, locked booking/payment/email/auth/token, or Arrival Guide content changes.

**Reversible?:** yes — remove the profile action + `/api/profile/booking-view` route; existing email/Butler view links are unaffected.

**Supersedes:** none.

---

## 2026-07-15 - Phase 16C Stage 3: confirmed booking email delivers the Arrival Guide link; same token, checkout-day expiry, confirmed email only

**Decision:** the confirmed booking email ([lib/send-booking-email.ts](../../lib/send-booking-email.ts) — locked file, explicitly authorized for this additive edit) now includes exactly one "Open your Arrival Guide" CTA pointing at `${base}/arrival/${encodeURIComponent(token)}` — the **same signed `view` token the email already mints** with `expiresAt: checkOutExpiryUnix(check_out)` (23:59:59 UTC on checkout day), so the Arrival Guide link and the booking-view link live and die together and no second token is minted. The block renders only on the `confirmed` branch (`arrivalUrl` stays `null` for cancelled emails — byte-identical cancelled output); pending, payment, event, admin-notification, and feedback emails are untouched. Email copy makes no payment claims and no access claims beyond the approved line: "Access details are shared by Oraya before arrival" — no gate PIN, no front-door PIN, no access codes.

**Reason:** Stage 2 shipped the private `/arrival/[token]` route gated on `status === "confirmed"`; the confirmed email is the natural first delivery surface and already holds a correctly-scoped checkout-day token, making this a zero-new-credential change. The permanent personalized URL contract for ALL future delivery channels (including WhatsApp/WhatChimp in Stage 4) is `https://stayoraya.com/arrival/<signed-view-token>` — future work must not invent a different route, and **no WhatChimp field name exists yet** (deliberately not invented here).

**Impact:** one additive block in `sendBookingEmail` (HTML card + CTA and plain-text lines, both inside `arrivalUrl`-null-guarded conditionals). No token helper change, no other email sender change, no API/schema/env change. Stage 4 (WhatsApp/admin delivery) and Phase 16D (access codes) remain unimplemented.

**Reversible?:** yes — single-PR revert of the email block; nothing else depends on it.

**Supersedes:** none. Extends the 2026-07-15 Stage 2 entry.

---

## 2026-07-15 - Phase 16C Stage 2: Arrival Guide v1 reuses the signed booking-view token; confirmed-only render; NO access/PIN values

**Decision:** the private mobile Arrival Guide ships at `/arrival/[token]` and **reuses the existing signed booking-view token unchanged** (`verifyViewToken` from [lib/booking-action-token.ts](../../lib/booking-action-token.ts), imported only — the locked helper is not modified and no new token type is introduced). The route renders guest data (guest name, stay dates via manual `YYYY-MM-DD` formatting with no `new Date()` parsing, the 8-character public reference via `formatBookingReference`) **only when `bookings.status` is `confirmed`**; a pending booking shows a neutral "unlocks once your stay is confirmed" state, and cancelled / invalid / expired / not-found all collapse to safe neutral states that carry no booking data. The guide **intentionally renders no gate PIN, front-door PIN, or any access code** — the design's `{{gatePin}}` / `{{frontDoorPin}}` merge fields are replaced with the safe "Access — provided by Oraya before arrival" state because Phase 16D (secure access-code delivery) is not implemented and Phase 16A policy explicitly forbids surfacing access credentials today. The page is `noindex`/`nofollow`, is not in any sitemap, and is linked only from the confirmed-booking state of `/booking/view/[token]` (additive block reusing the same token) — never from public navigation.

**Reason:** the booking-view token is already the established guest-credential pattern (HMAC-signed, 72h TTL, re-readable, minted by the confirmation email flow), so reusing it gives the Arrival Guide the same delivery surface with zero token-system change and zero new secret. Confirmed-only gating matches the "automated arrival instructions are used only after confirmation and operational review" trust promise on the homepage, and keeps pending/cancelled bookings from leaking stay data through a forwarded link.

**Impact:** new `app/arrival/[token]/page.tsx` + `components/arrival/**` (scoped CSS under `.oraya-ag`, tokens not on `:root`; content converted from the PR #73 mobile guide designs); additive confirmed-only link block on `/booking/view/[token]`. Stage 3 (email link), Stage 4 (WhatsApp/admin delivery), and Phase 16D (access codes) are explicitly not part of this change. **Token expiry (accurate behavior):** `/arrival/[token]` reuses the existing signed booking-view `view` token, and expiry depends on the minting site — every transactional mint passes `expiresAt: checkOutExpiryUnix(check_out)` (23:59:59 UTC on the checkout date; `app/api/bookings` POST, [lib/send-booking-email.ts](../../lib/send-booking-email.ts) confirmed email, the pending/payment/event senders, `/api/payments/checkout`), while the Butler identity-flow link ([lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts)) uses the helper's default 72h TTL. The Arrival Guide route adds no extra expiry of its own: it verifies the token's embedded `exp` and additionally gates rendering on `bookings.status === "confirmed"` per request. Future Stage 3 email delivery can therefore safely emit `/arrival/<signed-view-token>` with checkout-day expiry — including by reusing the very token `sendBookingEmail` already mints. No WhatChimp field for the Arrival Guide exists yet.

**Reversible?:** yes — single-PR revert removes the route, components, and the booking-view block; no schema, token, email, or API change to unwind.

**Supersedes:** none.

---

## 2026-07-15 - Phase 16C Stage 1: public Explore routes are a permanent QR contract; House Book + Explore pages ship as repo-native React

**Decision:** the public Explore / Living List routes are fixed at **`/explore/mechmech`** and **`/explore/byblos`** on the canonical origin (`https://stayoraya.com/explore/mechmech`, `https://stayoraya.com/explore/byblos`). Printed Villa House Books carry QR codes that encode these exact URLs (machine-decode verified in PR #73), so these routes are a **permanent contract: do not rename, move, or repurpose them casually** — a rename invalidates already-printed physical books. The villa spelling is exactly `mechmech` (the earlier `mishmash` spelling was corrected before print in PR #73). Alongside this contract, Phase 16C Stage 1 ships the four public guest-guide routes as repo-native React: `/house-book/mechmech` + `/house-book/byblos` (the 9-page A4 House Book, browser-printable, converted one-to-one from the PR #73 design package — not rendered from archived HTML, no `dangerouslySetInnerHTML`) and the two Explore pages (villa area guides seeded from the approved design content).

**Reason:** the printed House Book QRs already point at the Explore URLs, and the House Book itself needed a public online home that shares one source with the printable document. Converting to React components (shared primitives + per-villa compositions, route-scoped CSS under `.oraya-hb`, tokens NOT on `:root`) keeps the approved light print palette independent of app dark mode and avoids design drift between web and print.

**Impact:** new `app/house-book/*`, `app/explore/*`, `components/house-book/*`, `components/explore/*`, static SVG assets under `public/house-book/**` + `public/explore/**` (copied from the archived design package, which remains the archival source of truth at `docs/design/phase-16c/welcome-guide/claude-design-drafts/**`). Minimal links added on the homepage and both villa pages. Public pages contain no guest name, stay dates, booking reference, PINs, merge fields, or bracketed venue placeholders — the printed design's `[Restaurant name]` sample rows are replaced with placeholder-free Living List copy until David approves real venue names. Private Arrival Guide routes, email/WhatsApp delivery, admin actions, and access/PIN automation are explicitly NOT part of Stage 1.

**Reversible?:** the React pages are reversible (single-PR revert); the Explore route *contract* is effectively **hard** once physical House Books are printed — treat `/explore/mechmech` and `/explore/byblos` as permanent.

**Supersedes:** none.

---

## 2026-07-09 — Phase 16A WhatChimp production wiring locked (closeout)

**Decision:** Phase 16A WhatChimp production wiring is **complete** for the approved production scope. David manually finished the final production wiring on 2026-07-09. The durable knowledge is preserved as documentation (the "Phase 16A WhatChimp production builder (LOCKED 2026-07-09)" section in [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), the internal readiness checklist + smoke tests in [PHASE_16A_PRODUCTION_READINESS.md](PHASE_16A_PRODUCTION_READINESS.md), and the guest-facing guide in [WHATSAPP_GUEST_USAGE_GUIDE.md](WHATSAPP_GUEST_USAGE_GUIDE.md)) — **not** as committed WhatChimp flow exports. Production flow JSON is downloaded from WhatChimp on demand; the repo keeps the builder method, API contract, trigger strategy, limitations, readiness checks, and guest guidance instead.

Final approved production behavior:

- **Book a Stay** — natural stay intake (`/api/butler/normalize-stay-intent`) → structured confirmation → `/api/butler/lead` → secure website prefill handoff (`prefill_url` → `/book?h=...`). This is the LOCKED v6 natural intake.
- **Plan an Event** — a **direct event-inquiry handoff**. It routes the guest straight to `https://stayoraya.com/events/inquiry` with **no duplicate WhatsApp event intake** — no event-type, villa, attendee, date, setup, or services questions in WhatsApp. The event trigger bot may use marketing-friendly text and a "Start Event Request" button/link, but the destination is the website inquiry flow, where the site collects event type, villa, dates, setup, services, and details.
- **Guest Identification v2** — the final approved booking-support flow (there is no v3). It is **identify-first**: the old menu-first opening is removed; booking-support triggers call **Oraya Identify - Production** (`POST /api/butler/identify`) immediately. Known subscriber → reply directly with the safe status (`#oraya_identity_safe_message#`); unknown subscriber → ask for the 8-character reference (saved to `oraya_booking_reference`) → identify again; proof needed → ask email/full name (saved to `oraya_identity_proof`) → identify again. Every booking-sensitive reply echoes `#oraya_identity_safe_message#`.
- **Duplicate mini-flows removed** — the standalone "website booking" / "Check my booking" / "Help with my booking" mini-flows were deleted and their triggers consolidated into Guest Identification v2 to prevent trigger-matching conflicts (a duplicate trigger bot can steal a message from the correct flow).

Durable sub-decisions:

1. **Phase 16A WhatChimp production wiring is locked** (approved scope: natural stay intake, secure website handoff, event redirect, Guest Identification v2, manual WhatChimp closeout).
2. **Phase 16A production readiness + guest usage guide added** — [PHASE_16A_PRODUCTION_READINESS.md](PHASE_16A_PRODUCTION_READINESS.md) (internal smoke tests + go-live checks) and [WHATSAPP_GUEST_USAGE_GUIDE.md](WHATSAPP_GUEST_USAGE_GUIDE.md) (guest/marketing/support-facing, no internal names/secrets).
3. **Production WhatChimp exports are not committed** to the repo; they remain on the WhatChimp platform and are re-downloaded when needed. Only non-secret documentation/evidence is stored here.
4. **Future WhatsApp changes must preserve the safe boundaries** — booking-sensitive replies come only from `/api/butler/identify` `safe_message`; no bot-owned booking status/availability/pricing/payment/access truth; no payment promises; no location/PIN/access disclosure; the booking reference stays a public support code (not identity proof, not an access credential). Such changes are **new scoped work**, not remaining Phase 16A closeout, unless they are documentation corrections or bug fixes.

**Reason:** the manual WhatChimp closeout had to be captured somewhere durable and platform-independent. Committing production exports is explicitly avoided (they drift from the live tenant and invite stale-copy edits); the builder-method documentation is the source future agents/operators/marketing/support should rebuild, audit, or reuse against.

**Impact:** documentation only — [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) (production-builder section), [PHASE_16A_PRODUCTION_READINESS.md](PHASE_16A_PRODUCTION_READINESS.md) + [WHATSAPP_GUEST_USAGE_GUIDE.md](WHATSAPP_GUEST_USAGE_GUIDE.md) (new), [CURRENT_PHASE.md](CURRENT_PHASE.md) + [PROJECT_STATE.md](PROJECT_STATE.md) (Phase 16A complete for approved scope; 16B/16C remain separate), [KNOWN_BUGS.md](KNOWN_BUGS.md) #6 (duplicate mini-flows deleted). No code, schema, env, or production-behavior change. Phase 16B and Phase 16C are **not** closed by this decision.

**Scope going forward:** future WhatsApp enhancements are new scoped work, not remaining Phase 16A closeout. Preserved exclusions still hold: no WhatsApp-side confirmed booking submission unless separately reapproved; no payment promises or payment-state ownership; no location/PIN/access automation; the booking reference remains a public support code, not identity proof and not an access credential.

**Reversible?:** yes (docs only).

**Domain verification note:** a live WhatChimp API test observed an HTTP **308 redirect from the non-`www` origin to `www`** for `/api/butler/identify`. This does **not** change the canonical guest-facing origin (`https://stayoraya.com`, non-`www`); it applies only to WhatChimp's server-to-server API host, which must be the direct `www` host so response mappings are populated. Consistent with the 2026-07-03 server-to-server exception and [KNOWN_BUGS.md](KNOWN_BUGS.md) #11 — recorded here as an operational verification note, not a canonical-origin change.

---

## 2026-07-09 - Phase 16A v6 structured-date intake LOCKED (operator-approved after live production verification)

**Decision:** Phase 16A v6 (natural-language stay intake + structured Normalize Dates ladder + bedroom-skip + backend extractor lead-in fix) is **LOCKED and operator-approved for production**. PR #69 is merged and production-deployed; David completed the mandatory WhatChimp response mappings and passed live production WhatsApp verification against the normal API links (no preview URLs, no API-link changes, no new integrations, no artifact regeneration).

- **Locked version / merge commit:** `92c144197d72ef5bcc3bb76f9615c3ea4481339c` (PR #69 → `master`). Canonical artifact `Oraya_natural_intake_v6.txt` SHA-256 `4383A12F4EEE2E1E721F94BB03DA584B0383D3F47A69BC77C48F659C2E841659` (unchanged; **not** regenerated for the lock). Backend fix `0ad7dbf` live on production.
- **Production endpoints verified (direct `www` host, unchanged):** `https://www.stayoraya.com/api/butler/normalize-stay-intent` and `…/normalize-dates`. Production deployment for `92c1441` recorded `success` (2026-07-08T18:46:43Z).
- **Operator mappings completed on Stay Intent (`7466`) + Refine (`8101`)** — each date on TWO rows: `extracted_text.check_in` → `oraya_check_in` **and** `oraya_check_in_text`; `extracted_text.check_out` → `oraya_check_out` **and** `oraya_check_out_text`; plus `extracted_text.nights`→`oraya_nights`, `extracted_text.guest_count`→`oraya_guest_count`, `extracted_text.bedroom_count`→`oraya_bedroom_count`, `extracted_text.villa`→`oraya_villa`, `status`→`oraya_date_status`, `safe_message`→`safe_message`. **Normalize Dates (`7458`)** unchanged: `check_in`→`oraya_check_in`, `check_out`→`oraya_check_out`, `nights`→`oraya_nights`, `status`→`oraya_date_status`, `safe_message`→`oraya_date_confirmation_message`.
- **Live production verification (all passed):**
  1. Full one-message intake `mechmech july 10 to july 15 for 4 people 2 bedrooms` → dated summary, ZERO questions: check-in `2026-07-10`, check-out `2026-07-15`, Villa Mechmech, 4 guests, 2 bedrooms, secure `/book?h=…` link. (This is the full-sentence case the extractor fix targeted.)
  2. Missing-checkout / stale-clear `mechmech from july 10 for 4 people 2 bedrooms` → bot asked for check-out, did NOT reuse the prior July 15 value; after "July 12" confirmed `2026-07-10 → 2026-07-12`; summary preserved villa/guests/bedrooms/secure link.
  3. Repeated missing-checkout `mechmech july 10 for 4 people 2 bedrooms` → asked check-out; after "July 12" confirmed and summarized correctly.
- **Operator export (post-mapping, production-verified) — NOT committed to the repo (by design):** the operator's approved production bot export is preserved on the **WhatChimp platform** and can be re-downloaded from there when needed. Per David's preservation rule, production/operator WhatChimp exports are not stored in this repo; only the non-secret evidence below is kept as text. For provenance, the reviewed export was 192 nodes (observed SHA-256 `C80F325D…76E9` at review time; scanned clean — the flow export carries integration IDs only, no `X-Butler-Secret`/URLs/bodies, secrets live outside the export). **Known tenant-side deviation (documented, NOT a defect):** in David's live bot 11 of the 12 Lead Submit nodes are bound to `7459` and 1 to `6961` (the repo canonical `Oraya_natural_intake_v6.txt` keeps all 12 on `6961`). Both are the "Oraya Lead Submit" class POSTing to the same `/api/butler/lead` endpoint, and live verification confirmed the lead saved and the secure link minted — so the deviation is operational.

**Reason:** the fix + mappings had to prove out against the real production backend and the operator's real bot, which David has now done end-to-end on the normal API links. Locking records the exact approved state so future work has an unambiguous baseline.

**Impact:** docs only — `docs/system/CURRENT_PHASE.md` (status → LOCKED), `docs/system/KNOWN_BUGS.md` #10 (marked RESOLVED), and this entry. **No production/operator WhatChimp export is committed** (it stays on the WhatChimp platform). **No code, no artifact regeneration, no flow-layout change, no API-URL change, no secret/`.env` change, no production WhatChimp change.**

**Remaining optional polish (non-blocking, deferred):** if a guest gives a check-out that precedes the check-in (e.g. check-in July 10, check-out June 15), the bot falls back with "couldn't read that." Acceptable for lock; a future UX nicety would be a clearer "Check-out must be after check-in." message. Not required to move on from Phase 16A v6.

**Reversible?:** yes (docs only). Phase 16A v6 date-intake is **approved to move on from**.

---

## 2026-07-08 - Structured date fallback: the Normalize Dates ladder replaces the "send both dates together" retry; single-date questions feed the existing integration 7458; "Continue" resume pairs rejoin the intake

**Decision:** the v5.5/v6 date recovery retried by asking the guest to "send your check-in and check-out dates together" and re-ran the refine extractor over the whole follow-up text. Per David's hybrid-ladder clarification, that whole retry layer is replaced (branch `claude/v6-structured-date-fallback`, from master `72f045a` with PRs #67+#68 merged) by a structured ladder built on the **existing tenant integration 7458 "Oraya Normalize Dates"** (operator-created 2026-05-17, 55/55 calls on record; its FIXED request body reads exactly `oraya_check_in_text` 58017 / `oraya_check_out_text` 58018 — both tenant-existing v4.3.3 fields):

1. **One combined follow-up → refine (unchanged), then the ladder.** The natural-phrase path keeps its single combined follow-up → refine (`8101`, now the only refine call — the other three refine calls are deleted with the retry layer). Whatever is still missing goes to single-date questions that save the guest's RAW words into 58017/58018 and call Normalize Dates (`7458`): when the check-in is held, one check-out-only question → ND; when nothing is held, TWO CHAINED single-date questions (58017 →`userInputFlowSingleOutput`→ 58018, the operator's v4.3.3 chained-question schema) → ND; when only the check-out was missing from the start, the inherited follow-up question `#426` is REBOUND to 58018 and feeds ND FIRST (the v5.5 refine-first wiring re-extracted over the whole followup and CLOBBERED a good check-in on a bare "11 july" reply — David's actual live gap), with ONE structured re-ask on failure.
2. **"Continue" resume pairs + convergence hubs.** Control → Text is the only import-surviving convergence class (round trip #4), so each ladder outcome ends on a one-button "Continue" Interactive (field `oraya_dates_confirmed_text` 58532; nothing downstream reads the value) whose press rejoins the intake through the dates-recovered hub `#1150` (4-way) or dates-pending hub `#1200` (3-way). Each hub continues into its own guest-known/supported-count clone chain (round trip #3: one inbound per Condition). H_R is reachable only with both dates proven present and no date-writing API after it → its subtree emits the dated summary; H_P → the undated summary; the pending side never re-asks dates (no name question, no date-escalation tail).
3. **Presence contract intact + null-mapping is safe either way.** The ladder saves raw words ONLY into 58017/58018, never into the final ISO fields — a raw "10-july" can't satisfy `contains "-"` as a phantom date. The ND response's `check_in`/`check_out` are JSON `null` (not `"null"`) when unclear; WhatChimp's null-mapping semantics (skip vs. write `""`) are UNDEFINED and BOTH are safe (the presence gates read both as MISSING) — proven in the simulator with omitted-key AND `""`-value fixtures.
4. **Zero WhatChimp integration edits for the flow; two ADDITIVE mapping rows only.** The flow references only existing ids. The 7466/8101 response mappings gain two additive rows — `extracted_text.check_in` → `oraya_check_in_text`, `extracted_text.check_out` → `oraya_check_out_text` (same additive class as the shipped bedroom_count row) — so an already-extracted ISO date reaches the ND body as an identity re-parse. These are operator checklist items, not code.
5. **New canonical `Oraya_natural_intake_v6.txt`:** **192 nodes, 247 output connections, 22 Interactive, 62 controls, 15 terminals** (2 dated + 2 undated shared summaries, large-group tail, 4 extracted-overflow tails, 6 bedroom-skip branch summaries), **ZERO redraws**, SHA-256 `3DC80B3DB20FD6D8B89FBD97BA528FF9D653898B347BED26945355D56D163600`; hubs `{860:24, 865:4, 930:15, 938:12, 1150:4, 1200:3}`. The v5.5 retry layer (432/433/434/435/436/438/427/501/503/504/505/506/507/508) is deleted; the bedroom-skip stages drop from 8 to 5 (the retry-layer skip branches are gone). Validator strict **0/0** (new `normalize-dates-placement` check); simulator **53/53** (N01 target-UX one-by-one; N02 check-out-only; R04 the split-turn live gap first-try; R05–R07 ND recovery; D01–D06 pending via both null semantics; F01/F02 HTTP-failure walks; K-matrix rebuilt to 5 branches); tooling **42/42** (structured-date-ladder wiring test; round-trip-6 258-node import-survival fixture pinned; dates-pending topology rewritten to the hubs); new `lib/butler/normalize-dates.test.mts` (9/9) pins the ND behaviors the flow relies on — backend code UNTOUCHED; extractor **42/42**.

**Reason:** the split-turn check-out reply is a real live gap — refine-first clobbered a good check-in, and one integration body can't both salvage a combined reply and pass ISO fields through. ND-first on `#426` fixes it on the first try; the one-by-one ladder handles the "nothing parses" case deterministically without inventing a second integration.

**Impact:** generator (ladder section, `resumePair` helper, removal list +8 retry nodes, `APPROVED_POSTBACK_MERGES` + 1150/1200, `APPROVED_CONTROL_LABELS` + Continue, guest/bedroom/overflow tables rebuilt), profile (`apis.normalizeDates`, 58017/58018 fields, `oraya_dates_confirmed_text` control, `apiFieldWrites` arrays + `7458`, `approvedPostbackMerges`, `checkInTextField`/`checkOutTextField`), simulator (array-valued `apiFieldWrites`; N/R/D/B/F/K rewrites), validator (`normalize-dates-placement` check; `knownApiIds` + `7458`; check 26 covers ND), tooling tests (counts, round-trip-6, ladder test, dates-pending hub topology, layout id-range 1000–1299), new `lib/butler/normalize-dates.test.mts`, docs (`V6_DEPENDENCIES.md` API/mapping/field tables + date-behavior; `V6_ROUNDTRIP_CHECKLIST.md` A0/A1/A2/C/D), regenerated `V6_REDRAW_CHECKLIST.md`; KNOWN_BUGS #10 follow-up. **No backend route changes, no schema, no dependency, no production WhatChimp edits for the flow itself.**

**Reversible?:** yes — deterministic generator, pinned fixtures. Gate: the interactive acceptance procedure on a fresh disposable TEST bot, incl. confirming integration 7458 still exists tenant-side (older flows referenced a superseded `7102`), the two additive 7466/8101 mapping rows, the split-turn "11 july" first-try recovery, the one-by-one ladder, and the dates-pending undated summary. **Operator follow-ups for the report:** (1) confirm 7458 exists; (2) add the two additive 7466/8101 rows on the TEST clones (and production at cutover); (3) an OPTIONAL 2nd "salvage" ND integration would remove the one repeated check-in ask on the worst-case path (a WhatChimp integration has one fixed body, so the exact target transcript needs an operator-created id — deferred to a follow-up PR); (4) the TEST bot's 18 Lead Submit nodes are rebound to 7459 (same `/api/butler/lead` endpoint) — verify intent, canonical stays 6961; (5) the operator's local `Oraya Normalize Dates.txt` export contains a live `X-Butler-Secret` — it must not be shared or committed.

**Supersedes:** the "send both dates together" retry layer and the 258-node totals/SHA `8A356B6F…B1A6D` in the 2026-07-08 "Bedroom-skip routing" entry below (body preserved verbatim per the append-only rule; the bedroom-skip gate design remains in force, now on 5 stages).

> **Follow-up (2026-07-08, layout-only revision):** the operator imported PR #69 into a TEST bot and the new date-ladder nodes read as scattered — they had been emitted at cramped computed positions in a positive-y block overlapping the guest/bedroom acknowledgement region. The generator's ladder positions were revised to reuse the coordinate footprint vacated by the removed v5.5 retry layer (which the operator had hand-tuned in `scripts/whatchimp/v6-layout.json`): path A in the old "send both dates" retry row (x≈2500–4130, y≈-1300), path B just right of #426, the recovered/pending guest stages stacked in the vacated #900/#903–909 guest column, the recovered/pending bedroom stages in the vacated #885/#887–888 bedroom column. **Positions only — node count, edges, bindings, and topology are byte-identical; all 104 surviving <1000 nodes stay exactly on the operator baseline (0 moved), verified against master `72f045a`.** New canonical SHA-256 `4383A12F4EEE2E1E721F94BB03DA584B0383D3F47A69BC77C48F659C2E841659` supersedes `3DC80B3D…3600` above. Validator strict 0/0, simulator 53/53, tooling 42/42 unchanged (position-independent). This body is preserved verbatim per the append-only rule.

> **Follow-up (2026-07-08, backend extractor fix — PR #69 is no longer "zero backend code changes"):** the operator tested the full sentence **"i want to book mechmech from july 10 to july 15 for 4 people 2 bedrooms"** against the Stay Intent API and the backend returned `check_in=null`/`check_out=null` (`status: unclear`) while villa/guests/bedrooms extracted fine — so the flow's presence gates passed the STALE dates from a prior attempt into the dated summary. **Root cause (backend, not the flow):** "want" is a filler word but the trailing "to" in "want **to**" is a range connective, not filler, so it survived filler-stripping as a stranded leading token; `splitStayResidue` then split on the WRONG "to" (`"to july 10 to july 15"` → check-in fragment `"to july 10"`), which fails to parse and returns `unclear` with both dates null. The same class stranded "can" in "can i book …". **Fix (commit `0ad7dbf`):** `cleanResidue` in `lib/butler/extract-stay-intent.ts` now drops leading lead-in tokens up to the first date-anchoring token (`DATE_ANCHOR_RE` — month/day-number/weekday/relative/spelled-number); villa and guest-count are already extracted upstream, so a residue's meaningful content always begins at its first date anchor, and interior tokens (the real "to" separator) are untouched. This **DID change backend code** (previously claimed untouched) — extractor tests go **42→48** (6 new regression tests: `i want to book …`, `i'd like to book …`, `i want to stay at …`, `can i book …`, dates-only, and a spelled-number-duration guard). `tsc --noEmit` exit 0, `npm run build` exit 0; flow artifact, generator, profile, validator, simulator, and tooling are **unchanged** (no regenerate — this is backend-only). **Consequence for verification:** WhatChimp TEST cannot reproduce the fix while it points at production (`https://www.stayoraya.com/...`), which does not yet carry commit `0ad7dbf`. Point the TEST Stay Intent + Refine integrations at the PR's Vercel Preview (deployment for `0ad7dbf`: `https://oraya-bdmj34w73-staleen-2375s-projects.vercel.app`; branch alias `https://oraya-web-git-claude-v6-structure-fcfea9-staleen-2375s-projects.vercel.app`) — both `/api/butler/normalize-stay-intent` and `/api/butler/normalize-dates` verified reachable there (app-level `401` without the secret, i.e. no Vercel SSO wall; the Preview env has `BUTLER_WEBHOOK_SECRET` set) — or merge PR #69 to production first, then verify against `www`. Do **not** keep re-tuning the mapping for this full-message case until the endpoint under test contains the fix. The two-target date mapping (`extracted_text.check_out` → BOTH `oraya_check_out` and `oraya_check_out_text`) remains mandatory regardless — see `V6_DEPENDENCIES.md`.

---

## 2026-07-08 - Bedroom-skip routing: an extracted bedroom label skips the bedroom question; per-branch skip tails; villa clones rejoin the shared villa-ack (hotfix on merged PR #67)

**Decision:** PR #67 merged and deployed (merge `7ee01a4e`, 2026-07-07); the live test confirmed dates/villa/guests/lead/prefill all work, with one remaining UX gap — the bedroom question was still asked even when the guest volunteered the count in free text (the 2026-07-04 entry deliberately kept "bedrooms always asked"). This hotfix (branch `claude/v6-bedroom-skip`) supersedes that with skip-when-known:

1. **Bedroom-known gate per stage:** each of the 8 bedroom-stage entries now feeds a Condition testing `oraya_bedroom_count` **equality any-match against the three approved labels exactly** (`1 bedroom` / `2 bedrooms` / `3 bedrooms`). Stricter than presence by design: `""`, `"null"`, whitespace, and any invalid value fail → the bedroom Interactive is asked exactly as before. The stale-bedroom reset (`extracted_text.bedroom_count` → `"null"` on every normalization/refine call) is what makes the gate current-attempt-accurate.
2. **Per-branch skip tails (import contracts upheld):** Conditions accept ONE inbound and only postback (control → Text) convergence survives import, so the skip side of every gate carries its own villa-gate clone of #470 (`contains "Villa"`) and — villa known — its own Lead Submit (`6961`) + summary. Branches reachable only with both dates proven present (602/751/753/755/757 chains) hard-wire the dated summary; the dates-pending branches (759/761) the undated one; only the clicked-guest branch (860, reachable both ways) keeps a date-branch Condition. Villa missing → a branch-local villa Interactive whose 2 canonical buttons rejoin the shared villa-ack `#938` (postback convergence, 2-way → **18-way**; same proven class, larger fan-in — human-gated). Id scheme per branch: skipBase+0 gate, +1 villa gate, +2 villa Interactive, +3/+4 buttons, +5 lead, +6 date branch (mixed only), +7/+8 dated/undated summary; skipBases 1000–1070.
3. **Backend: no code change needed.** The extractor already normalizes singular "2 bedroom" to the approved plural label (new regression test pins it — acceptance #3).
4. **New canonical `Oraya_natural_intake_v6.txt`:** **258 nodes, 344 output connections, 24 Interactive, 91 controls, 21 terminals** (12 existing + 9 bedroom-skip branch summaries), **ZERO redraws**, SHA-256 `8A356B6F508AF158274576521958F98FA2992A06560E23A65CB1558FBBB51A6D`; hubs `{860:42, 865:7, 930:24, 938:18}`. The 200 pre-existing nodes keep the operator layout baseline positions; the 1000-range skip nodes carry computed positions (the only nodes outside the baseline). Validator strict **0/0**; simulator **62/62** (L01 rewritten: the exact live message now completes with ZERO questions; B01/B02 skip bedrooms; new K01–K17 skip matrix covering every branch × villa known/missing + T03 stale-bedroom re-ask); tooling tests **40/40** (new bedroom-skip structural test; the "no bedroom Condition" rule is narrowed to "only the 8 gate-shaped bedroom Conditions"); extractor **42/42**.

**Reason:** asking for a value the guest already gave is the kind of friction this intake exists to remove; the gate-equality design keeps the "invalid → ask" guarantee and the stale-field safety intact, and the per-branch tails are the only structure the proven import contracts permit.

**Impact:** generator (bedroom-skip section + `APPROVED_POSTBACK_MERGES` 938: 2→18), profile (`approvedPostbackMerges`), simulator (L01/B01/B02 rewrites, K-matrix, T03), tooling tests (villa buttons 2→18, 21 terminals, dates-pending continuation via the gates, layout test tolerates 1000-range, bedroom-skip structural test), extractor test (singular label), `V6_DEPENDENCIES.md` / `V6_ROUNDTRIP_CHECKLIST.md` (18 Lead Submit nodes, 23 API rebinds, C1 zero-questions acceptance + C1a skip/ask matrix, 21 terminals), regenerated `V6_REDRAW_CHECKLIST.md`; KNOWN_BUGS #10 follow-up. No schema, dependency, endpoint, or production WhatChimp changes; `/api/butler/lead` untouched.

**Reversible?:** yes — deterministic generator, pinned fixtures. Gate: the interactive acceptance procedure on a fresh disposable TEST bot, incl. C1 (zero questions on the exact live message), C1a (singular phrasing skip; villa-missing + bedroom-known; stale-bedroom re-ask), and explicit inspection of the 18-way `#938` fan-in after import.

**Supersedes:** the "bedroom Interactive is still ALWAYS asked" behavior and the 200-node totals/SHA `5D39B658…6B64` in the 2026-07-04 "Live runtime repair" entry below (body preserved verbatim per the append-only rule; everything else in it remains in force).

> **Follow-up (2026-07-08):** the "Structured date fallback" entry above replaced the v5.5 "send both dates together" retry layer with the Normalize Dates ladder. That deleted the retry-layer date-recovery branches, so the bedroom-skip stages drop from **8 to 5** and this entry's totals/SHA (`8A356B6F…B1A6D`, 258 nodes / hubs `{860:42,865:7,930:24,938:18}`) are superseded by `3DC80B3D…3600` (192 nodes / hubs `{860:24,865:4,930:15,938:12,1150:4,1200:3}`). The bedroom-known gate design, the per-branch skip tails, and the villa-clone → shared-villa-ack rejoin all remain in force, now on 5 stages (villa-ack `#938` fan-in 18→12). The 258-node artifact this entry shipped is pinned byte-exact as the round-trip-6 import-survival fixture. This body is preserved verbatim per the append-only rule.

---

## 2026-07-04 - Live runtime repair: presence-based date/villa routing, bedroom-phrase extraction, operator layout baseline (data-contract fixes; graph design and import/export repair unchanged)

**Decision:** the first live conversation on the fresh imported bot failed on a runtime data contract while the structural round trip passed (200 nodes / 270 connections survived). Live transcript: "mechmech july 10 to july 11 for 4 people 2 bedrooms" → dated summary with a BLANK check-out line and a BLANK secure-link line. Three repairs are recorded:

1. **Backend extractor (bug, reproduced + fixed):** a trailing bedroom phrase corrupted date parsing — the live message extracted check-in only; "mechmech july 10 for 4 people 2 bedrooms" extracted NO dates. `extractStayIntent` now strips the bedroom phrase BEFORE date parsing and extracts it: new `extracted.bedroom_count` (1–3 or null) and `extracted_text.bedroom_count` (the exact approved control label `1 bedroom`/`2 bedrooms`/`3 bedrooms`, or the literal `"null"` as a stale-bedroom reset; out-of-range counts are stripped but emit `"null"`). The bedroom Interactive is still ALWAYS asked — no graph redesign; the tapped button overwrites the prefilled value. New mapping row: `extracted_text.bedroom_count` → `oraya_bedroom_count` on 7466/8101 (profile `apiFieldWrites` + dependency manifest). Regression tests: the three acceptance strings + label mapping + out-of-range stripping (`extract-stay-intent.test.mts`, 41/41).
2. **Presence-based routing (graph data change, not a redesign):** the tenant's response mapping was bound to `extracted.*`, whose JSON `null` WhatChimp wrote as `""` — and `""` passed every `= "null"` missing-check as a phantom date. Every date condition (410, 411, 430, 436, 501, 505 and the summary branches 943/944) now tests **presence** — `contains "-"` (an ISO date always contains "-"; `""`, `"null"`, whitespace never do) — with outputs swapped in place so every edge target keeps its meaning; the villa gate 470 likewise uses `contains "Villa"`. **A dated summary is now structurally possible only when BOTH dates are real**; a missing/blank check-out routes to the check-out follow-up or the undated summary. Guest-count gates intentionally keep exact-value equality (a blank guest count routes to the safe large-group review tail — documented residual). Encoded: validator `date-presence` check (any equality/`"null"` date or villa condition is an error); simulator scenarios L01 (exact live message end-to-end), B01 (`""` check-out → follow-up ask → dated recovery), B02 (`""` persists → UNDATED summary; the captured half-date never renders), B03 (whitespace dates → ask both), F01 rewritten (total API failure now ASKS dates instead of silently pretending they exist). `extracted_text.*` remains the binding contract — the conditions are now merely tolerant of the `extracted.*` mistake.
3. **Blank secure link:** the backend is proven to mint `prefill_url` from the lead id alone for dated and undated leads (`leads-absent-dates.test.mts`); the blank line was tenant-side (missing `prefill_url` → `oraya_prefill_url` response mapping, a `3xx` host, or missing `BUTLER_PREFILL_SECRET`). The checklist now carries an explicit blank-link troubleshooting order (A1) and C1 requires a non-empty link on the exact live message.
4. **Operator layout baseline:** the operator's hand-tuned export is pinned byte-exact ([artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-5.layout-baseline.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-5.layout-baseline.txt), 180,790 bytes, SHA-256 `7DDF81E4C2DA5EF9DA475D64E62B7989B0FEF1AEB154465D8050EACC2ADD3156`) and its 200 node positions are adopted via the committed `scripts/whatchimp/v6-layout.json` (applied deterministically at generation). **Adopted: positions only.** That export also carried tenant-side drift — Lead Submit nodes rebound to `7459`/`7460` ("Oraya Event Lead Submit") and a stray trailing space — which is NOT adopted; a regression test blocks any non-`6961` lead binding from reaching the canonical artifact.
5. **New canonical `Oraya_natural_intake_v6.txt`:** totals unchanged (**200 nodes, 270 output connections, 16 Interactive, 75 controls, 12 terminals, ZERO redraws**), SHA-256 `5D39B6580A9AB784C31811D1255F4AD6509581F88635006FB6AECE7272A56B64`. The `Rows → #865 → #466` overflow repair, dates-pending continuation, hubs `{860:42, 865:7, 930:24, 938:2}`, and all historical fixtures are byte-untouched. Validator strict **0/0**; simulator **44/44**; tooling tests **39/39**; extractor **41/41**; absent-dates suite **4/4**.

**Reason:** the live failure was three independent data-contract holes lining up — an extraction blind spot, a routing contract that trusted the literal `"null"`, and a tenant mapping gap. Presence routing makes the graph correct under BOTH binding styles and under blank/whitespace values, which is the strongest repair available without new tenant fields.

**Impact:** `lib/butler/extract-stay-intent.ts` (+tests), generator (presence rows + output swaps + layout application), `scripts/whatchimp/v6-layout.json` (new), profile (`apiFieldWrites.bedroom_count`), validator (`date-presence`), simulator (L01/B01–B03, F01 rewrite, `norm()` bedroom key), tooling tests (layout-baseline + presence assertions + villa-sabotage inversion), `V6_DEPENDENCIES.md` / `V6_ROUNDTRIP_CHECKLIST.md` (binding warning, blank-link troubleshooting, C1/C4 acceptance rewrites); KNOWN_BUGS #10 follow-up; artifact + click matrix recopied to the operator folder. No schema, dependency, production WhatChimp, or locked-booking changes. PR #67 stays open and unmerged.

**Reversible?:** yes — deterministic generator, pinned fixtures. Gate: re-run the interactive acceptance procedure incl. the rewritten C1 (exact live message → both dates + non-empty link) and C4 (half-date ask; dates-pending).

**Supersedes:** the `= "null"` condition style for date/villa fields carried since the 2026-07-02 v6 entry (guest-count conditions keep it), and the 4D032FEC…E46B artifact SHA in the "Dates-pending continuation" entry below (body preserved verbatim per the append-only rule; everything else in it remains in force).

> **Follow-up (2026-07-08):** PR #67 merged and deployed; the live test passed except that the bedroom question was still asked when the guest had volunteered it. The "Bedroom-skip routing" entry above superseded this entry's "bedroom Interactive is still ALWAYS asked" behavior and its artifact SHA (`5D39B658…6B64` → `8A356B6F…B1A6D`). Everything else here remains in force. This body is preserved verbatim per the append-only rule.

---

## 2026-07-04 - Dates-pending continuation: a failed final date retry continues the interactive intake and the secure website handoff; date-escalation tails deleted; date-aware summaries (dated / undated variants)

**Decision:** the operator directed that date failure must not end in a team escalation; the following behavior and structure are recorded:

1. **Date behavior:** the natural-language message is the initial extraction attempt. If dates are missing, the flow asks the appropriate follow-up (both dates, or check-out only when check-in exists) → refine API → exactly ONE final retry → refine API. **A failed final retry stops asking about dates and continues into the correct guest-count missing/extracted branch** (transitional message: "You can pick your exact dates on our secure booking page in a moment"), then collects missing bedrooms/villa with the existing Interactive controls, submits the lead through the existing Lead Submit contract (date fields carry the literal `"null"`), and mints the secure prefill URL with dates absent — the guest chooses dates on `/book`. **No name question; the date-escalation tails (640–643 / 700–703) are deleted from the canonical graph.** Large-group escalation behavior (clicked "More than 6" → exact-count → review tail; extracted 7+ → per-branch review tail, incl. on the dates-pending branches) is unchanged.
2. **Summary behavior:** each completion Lead Submit (#939/#941) feeds a single-inbound date-branch Condition (#943/#944, `check_in = "null" OR check_out = "null"`, anyMatch) selecting the **dated** summary (#940/#942 — both dates displayed) or the **undated** summary (#945/#946 — "📅 Dates: Please choose them using the secure link below." plus villa/guests/bedrooms; the literal `null`, blank hashtags, and half-captured dates never render). Both variants keep the team-review wording, the not-confirmed status, the secure `#oraya_prefill_url#` slot, and the canonical `/book` fallback.
3. **Structure:** each failed-retry exit (#438 both-dates / #504 check-out, texts rewritten in place) hands off into its own guest-known/supported-count Condition-clone chain (758/759, 760/761 — `maxInboundPerCondition: 1` upheld), its own guest list stage (900, 910) and bedroom stage (920, 925) reusing the shared postback spine, and its own extracted-overflow preface + tail (968→990–993, 969→994–997). New canonical `Oraya_natural_intake_v6.txt`: **200 nodes, 270 output connections, 16 Interactive (7 guest + 8 bedroom + 1 villa), 75 controls (49 Rows + 26 buttons), 12 terminals, ZERO operator redraws**, SHA-256 `4D032FEC5209EF6685BD84BDA0980EBAAD7AB8BF8031AD9B8DD96BCB9BE1E46B`; postback hubs `{860:42, 865:7, 930:24, 938:2}` (all Texts; 42-way guest-ack fan-in exceeds the 30-way scale round trip #4 proved — same class, human-gated). The repaired `Rows → #865 → #466` overflow path, all custom-field bindings, extraction-skip behavior, stale-field clearing, and all historical fixtures are untouched.
4. **Backend contract (proven, no code change):** `normalizeLeadInput` stores NO date for the literal `"null"` strings (never the string), keeps guest/bedroom/villa intact, and the prefill token is minted from the lead id alone — new focused suite `lib/butler/leads-absent-dates.test.mts` (4/4).
5. **Rules encoded:** validator check 25 rewritten (dated summaries display all 5 tokens; undated summaries display the choose-dates wording + 3 tokens, never a date hashtag or the literal `null`; both variants must exist; summaries fed by Lead Submit directly or via the date-branch Condition); check 26 rewritten (every refine API must reach a bedroom control AND a summary terminal — a date path may no longer dead-end into escalation); profile gains `undatedSummarySnippet` / `undatedSummaryMustInclude` + updated `approvedPostbackMerges`; simulator gains the D01–D07 dates-pending matrix + `terminalExcludes` (proving no `null`, no captured half-date, no name ask) — **40/40**; tooling tests gain the dates-pending continuation test (escalation nodes absent, transitional handoffs, mainline never reaches a name question, undated summaries reachable, date-branch contract) — **38/38**.

**Reason:** a guest whose dates the bot cannot read is a qualified lead, not an escalation case — the website's date picker is the reliable instrument; sending the guest there through the existing secure handoff preserves the lead and removes two dead-end conversations and a needless name question.

**Impact:** generator (transitional handoffs, dates-pending clone chains + stages, date-branch summaries, tails removed), profile, validator, simulator, tests, new `lib/butler/leads-absent-dates.test.mts`; `V6_DEPENDENCIES.md` / `V6_ROUNDTRIP_CHECKLIST.md` (C4 rewritten to the dates-pending scenario; twelve terminals) / regenerated `V6_REDRAW_CHECKLIST.md`; KNOWN_BUGS #10 follow-up; artifact + click matrix recopied to the operator folder. No schema, dependency, production WhatChimp, or locked-booking changes. PR #67 stays open and unmerged.

**Reversible?:** yes — deterministic generator, pinned fixtures. The gate remains the interactive acceptance procedure (now incl. the dates-pending scenario C4) on a fresh disposable bot.

**Supersedes:** the date-escalation outcome ("unreadable dates twice → name → lead → passed to the team") carried since the 2026-07-02 v6 entry, and the 162-node totals/SHA + `{865:5}` hub counts in the "Round trip #4" entry below (body preserved verbatim per the append-only rule; its platform findings and the shared-ack-Text repair remain in force).

> **Follow-up (2026-07-04):** the first live conversation exposed a runtime data-contract failure (blank check-out in a dated summary + blank secure link); the same-day "Live runtime repair" entry above superseded this entry's artifact SHA (`4D032FEC…E46B` → `5D39B658…6B64`) and replaced the `= "null"` date/villa condition style with presence routing. Everything else here remains in force. This body is preserved verbatim per the append-only rule.

---

## 2026-07-04 - Round trip #4: the import DROPS direct Rows → User Input Flow connections and PRESERVES control → Text convergence at full fan-in; the five "More than 6" routes repaired via one shared acknowledgement Text (#865); gate remains the interactive acceptance procedure

**Decision:** the operator's authenticated round trip on the 161-node interactive candidate failed narrowly; the finding and the smallest repair are recorded here:

1. **Platform finding (operator-proven, pinned byte-exact):** the saved re-export ([artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-4.saved-reexport.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-4.saved-reexport.txt), 140,217 bytes, SHA-256 `9C9EAD4C6D72B1B13193026ACF85182794ABFE3571FA17CB6E0ECEE788CFC031`) carries all 161 nodes but only 206 of the 211 connections. **The five dropped edges are exactly the five "More than 6" `rowOutput → #466 userInputFlowInput` connections** — one per guest list stage (`#809/#819/#829/#839/#849`), re-exported with empty outputs and stranding `#466/#467/#468/#712–#715`. **All three control → Text postback hubs survived at full fan-in (30-way `#860`, 18-way `#930`, 2-way `#938`), and no edge was added.** The evidence therefore isolates direct `Rows → User Input Flow` as an import-dropped class and simultaneously PROVES import survival of serialized control → Text convergence — it is NOT a ban on postback merges.
2. **Repair (smallest structural change, business behavior unchanged):** all five "More than 6" rows converge on ONE new shared acknowledgement Text `#865` ("Got it 😊" — the flow's existing acknowledgement device), which carries the single serialized connection into the existing large-group wrapper `#466`. The exact-count question, team-review message, lead submission, and final messaging are byte-preserved; no subtree duplication (the shared Text is generated and validated safely, so the duplication fallback was not needed).
3. **New canonical `Oraya_natural_intake_v6.txt`:** **162 nodes, 212 output connections, 12 Interactive, 55 controls, 10 terminals, ZERO operator redraws**, SHA-256 `F846CBFA51FBA0452DB17376123C205FC6D73DFC1F553EA3CC40CC5B2974CB47`. Approved postback merges are now `{860:30, 865:5, 930:18, 938:2}` — every hub a Text.
4. **Rules encoded:** the generator's `assertGraphContracts` and the validator's `interactive-contract` check reject ANY control forward edge targeting a User Input Flow (profile `importGraphContract.importDroppedControlTargets`); the validator additionally errors when a declared postback hub is missing from a graph (the re-export's exact signature); regression tests pin the fixture bytes/SHA, the 5-edge loss signature, the surviving 30/18/2 hubs, the unreachable set, the repaired routing (five rows → `#865`, `#865` → `#466` exactly once, every "More than 6" reaching terminal `#715`), unchanged 1–6/bedroom/villa control classes, zero unreachable nodes, and the ten intended terminals. Tooling: validator strict **0 errors / 0 warnings**, simulator **34/34**, tests **37/37**.
5. **Human gate (unchanged in shape):** the interactive acceptance procedure in [V6_ROUNDTRIP_CHECKLIST.md](../../artifacts/whatchimp/V6_ROUNDTRIP_CHECKLIST.md) on a fresh disposable bot, now with an explicit inspection of the five repaired "More than 6" connectors, ending in a NEW export that passes the comparator (PRESERVED, exit 0) and the strict validator (exit 0). Round-trip compatibility may not be claimed until that new export passes.

**Reason:** round trip #4 was the acceptance gate on the interactive candidate; it failed on a single, precisely-isolated connection class. Routing the overflow rows through a Text moves them into the import-surviving class proven by the same round trip, with no change to guest-visible behavior beyond one acknowledgement line.

**Impact:** generator (overflow-ack Text + control→UIF gate + checklist banner), profile (`approvedPostbackMerges`, `importDroppedControlTargets`), validator (control→UIF error + missing-declared-hub error), tests (37/37 incl. the two new round-trip-4 tests), `V6_DEPENDENCIES.md` / `V6_ROUNDTRIP_CHECKLIST.md` / regenerated `V6_REDRAW_CHECKLIST.md` updated; KNOWN_BUGS #10 follow-up appended; artifact + click matrix recopied to the operator folder. No application code, schema, or locked-system changes. PR #67 stays open and unmerged; production WhatChimp untouched.

**Reversible?:** yes — deterministic generator, pinned fixtures. Compatibility is claimable only after the repeated acceptance procedure passes on a fresh import, recorded in a superseding entry.

**Supersedes:** the 161-node totals/SHA and the `{466:5}` hub declaration in the "Interactive-controls rebuild" entry below (body preserved verbatim per the append-only rule); its architecture, removed-steps decisions, and Start-a-Flow ban all remain in force.

> **Follow-up (2026-07-04):** the dates-pending continuation rebuild superseded this entry's 162-node totals/SHA and `{865:5}` hub count the same day (the overflow-ack Text now receives 7 rows; date-escalation tails deleted; date-aware summaries added). The platform findings and the shared-ack-Text repair recorded here remain in force. See the "Dates-pending continuation" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-04 - Interactive-controls rebuild: buttons/rows save custom fields directly per operator evidence; ZERO operator redraws; confirmation/Edit/handoff/happy-path-name-ask removed; gate is the interactive acceptance procedure

**Decision:** the operator supplied authenticated evidence that WhatChimp Interactive controls bind directly to custom fields, and directed the rebuild of the natural-stay intake onto them; the following are recorded:

1. **Evidence (pinned byte-exact):** the operator's saved/reopened re-export [artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.button-evidence.saved-reexport.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.button-evidence.saved-reexport.txt) (148,882 bytes, SHA-256 `1D4A5E3DFC096F540037296D4E34551248D50F1F12BE64546B3F7E3B8A2C11EB`) shows Inline Buttons carrying `customFieldId` (`custom_57693`/`oraya_guest_count`) with `new_post_back`, both converging forward into the same User Input Flow node — **normal forward button/row convergence is editor-save-proven**. The same file demonstrates the hazard: button `#776` combines Start-a-Flow metadata (`value` = flow id, `postback_text` = flow title) WITH a direct connector — a self-restart/double-execution construction, now **banned** by generator gate, validator `interactive-contract` check, and simulator (`#783` is the clean schema). The list-message schema (Interactive → Keyboard `quickReplyInput/Output` → Sections `sectionInput/OutputRows` → Rows `rowInput/rowOutput` with `postbackId`/`title`/`rowType: static`/`customFieldId`/`customFieldSelectedOptionText`) is authenticated from a genuine tenant export whose row `#47` writes `custom_57698`/`oraya_villa`.
2. **Approved business behavior:** guest count = one-click 7-row LIST ("Choose guests" / "Overnight guests" / rows `1`–`6` + `More than 6`, `custom_57693`); bedrooms = Inline Buttons `1 bedroom`/`2 bedrooms`/`3 bedrooms` (`custom_69114`, 6 stages × 3 = 18 buttons); villa = Inline Buttons `Villa Mechmech`/`Villa Byblos` (`custom_57698`). Extracted values skip their question. A **clicked** "More than 6" routes to the existing exact-count ask → review tail (`oraya_guest_followup` preserved); an **extracted** 7+/unsupported count routes to a per-branch preface interpolating the known count → its own escalation tail (no re-ask of a number already given). **Removed on operator authority: the confirmation step, the Edit loop, the handoff choice, and the happy-path name ask** (escalation tails keep their existing name question); completion = Lead Submit `6961` directly → summary terminal carrying the 5 detail hashtags, "team will review availability and follow up", not-confirmed wording, the secure prefill link, and the `/book` fallback. **No WhatsApp-side capacity validation** — guests-vs-bedrooms fit is the `/book` website's authority. Website-handoff integration `7459` is no longer referenced by this flow.
3. **Stored value == visible label:** the export schema has no separate value field on buttons/rows, so labels ARE the downstream values (guest counts as bare numerals, bedroom labels matching the prefill regex, exact canonical villa names). Flagged as human-gated; the click-through inspection is the definitive check.
4. **New canonical `Oraya_natural_intake_v6.txt`:** **161 nodes, 211 output connections, 12 Interactive stages (5 guest list + 6 bedroom + 1 villa), 55 controls (35 Rows + 20 Inline Buttons), 10 terminals (2 summaries + 8 escalation tails), ZERO operator redraws**, SHA-256 `F28106948012125CFB3324CEEDCDB414C8B2C0B33BF4B1179D827634550669E7`. The only multi-parent nodes are the four approved postback-convergence hubs `{466:5, 860:30, 930:18, 938:2}` (all fed exclusively by button/row postbacks) — `V6_REDRAW_CHECKLIST.md` is now a post-import CLICK-VERIFICATION matrix stating "ZERO connections to draw".
5. **Rules encoded:** profile `interactiveControls` (approved labels per field), `approvedPostbackMerges` + `postbackSourceNames` (replacing `approvedHubMerges`), `leadSubmit.ids: ["6961"]`, `supportedGuestValues` 1–6 + `guestOverflowChoice`; validator gains the `interactive-contract` check (default Interactive output EMPTY, buttons XOR list, Start-a-Flow ban, exactly one forward edge per control, no control→Condition, manifest-matched field ids and labels) and postback-hub convergence logic; the generator's `assertGraphContracts` enforces all of it at emit time; `maxInboundPerCondition: 1` remains absolute. Verification: validator strict **0 errors / 0 warnings**; simulator **34/34** (clicks write `customFieldSelectedOptionText`, full label coverage of every control, 4 recovery branches, fault injections); tooling tests **35/35** (byte reproducibility, evidence-fixture pin, click coverage, RT1/2/3 fixtures unchanged).
6. **Human gate (nothing else claims compatibility):** the interactive acceptance procedure in [V6_ROUNDTRIP_CHECKLIST.md](../../artifacts/whatchimp/V6_ROUNDTRIP_CHECKLIST.md) — fresh disposable bot; import with NO warning and NO loose connectors; click EVERY control and inspect all three fields (stored value == label, exactly one advance); save/close/reopen retest; export → comparator PRESERVED + strict validator exit 0; full conversation → lead in `/admin/leads` + `raw_payload`. Open platform unknowns it must answer: import survival of *serialized* postback convergence, `rowOutput` forward routing (no corpus sample), stored-value==label, 30-way row fan-in, live list rendering, and the free-text-at-Interactive UX gap.

**Reason:** the operator's evidence replaced the assumption that convergence requires operator redraws — the previous 186-node candidate needed 39 hand-drawn edges (round trip #4 never ran); interactive controls collapse that to zero while also removing four conversation steps the operator judged unnecessary friction (confirmation, Edit, handoff choice, name ask).

**Impact:** `scripts/generate-whatchimp-v6.mjs` rewritten (interactive-controls architecture); `scripts/whatchimp/natural-intake-profile.json` rewritten; `scripts/validate-whatchimp-flow.mjs` + `scripts/simulate-whatchimp-flow.mjs` + `scripts/whatchimp-flow-tools.test.mjs` updated; `V6_DEPENDENCIES.md` / `V6_ROUNDTRIP_CHECKLIST.md` / `V6_REDRAW_CHECKLIST.md` rewritten; KNOWN_BUGS #10 follow-up appended; evidence fixture added; artifact + click matrix recopied to the operator folder. The 186-node full-cascade candidate remains history (its fixture set untouched). No application code, schema, or locked-system changes. PR #67 stays open and unmerged; production WhatChimp untouched.

**Reversible?:** yes — deterministic generator, pinned fixtures. Compatibility is claimable only after the interactive acceptance procedure passes on a fresh disposable bot, recorded in a superseding entry.

**Supersedes:** the redraw-based repair mechanism (39 operator draws), the 186-node canonical totals/SHA, and the round-trip-#4 gate in the "Round trip #3" entry below (body preserved verbatim per the append-only rule; its Condition-inbound rule `maxInboundPerCondition: 1` remains binding and encoded). Also supersedes the confirmation/Edit/handoff/name-ask conversation design carried since the 2026-07-02 v6 entry.

> **Follow-up (2026-07-04):** the acceptance import (round trip #4) dropped exactly the five "More than 6" `Rows → #466 User Input Flow` edges while preserving every control → Text merge; the repair (shared acknowledgement Text `#865`) superseded this entry's 161-node totals/SHA and its `{466:5}` hub declaration. See the "Round trip #4" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - Round trip #3: a Condition accepts at most ONE inbound connection TOTAL (any source type); full Condition-clone cascade shipped (186 nodes, 39 proven-operation redraws, zero Condition-targeting draws); gate is round trip #4

**Decision:** the operator's round trip #3 (fresh disposable bot, 181-node candidate, 34-item redraw plan) produced a second rule correction and a rebuild; both are recorded here:

1. **Corrected platform rule (supersedes the "one Condition-source parent" rule in the entry below):** **each Condition node accepts at most ONE inbound connection TOTAL, regardless of the source node's type** (`importGraphContract.maxInboundPerCondition: 1`). Live evidence: the import/open itself raised the *"infinite loop"* warning (Text `#603` was left disconnected from `#602`, which held only the import-kept `#440` FALSE edge); drawing `#603 → #602` (Text→Condition), `#659 → #654` (HTTP API→Condition), and `#664 → #663` (Text→Condition) — checklist items #5/#22/#24, all legal under the previous rule — were each rejected with the same warning. **Probe-methodology rule (standing policy): a probe against an unused Condition input proves nothing about an already-connected destination; future probes must reproduce the exact occupancy state of the planned draw.** The proven-drawable pair list shrinks to the three operations actually executed in redraw plans: Condition→User Input Flow, Text→User Input Flow, Condition→Text; `editorRejectedDrawPairs` stays `[]` (no pair is categorically rejected — the restriction is the destination Condition's inbound count).
2. **Architecture: the FULL Condition-clone cascade** (the operator-directed cascade generalized to the corrected rule): every Condition with more than one inbound edge — any source type — is split into guest-invisible per-parent clones, so every Condition has exactly one inbound connection and **no redraw ever targets a Condition**. New clones beyond the previous 16: `#766` (`#602` clone for Text `#603`), `#767/768/769` (the `#654→#660→#663` chain for HTTP API `#659`), `#770` (`#663` clone for Text `#664`) — **21 clones total, ids 750–770**. The 181-node candidate's merge-absorption optimization (`#602`+Text, `#654`+API, `#663`+Text) is invalidated; the full cascade is the only behavior-preserving layout.
3. **New canonical `Oraya_natural_intake_v6.txt`:** **186 nodes, 224 output connections, 14 terminals, 13 declared merge points — all User Input Flow wrappers or Texts, none a Condition** (`466:6, 480:4, 490:5, 600:5, 610:6, 616:2, 655:2, 661:3, 670:4, 676:2, 691:4, 694:5, 736:4`), **exactly 39 operator-drawn connections** (34 Condition→User Input Flow, 2 Text→User Input Flow `#604→#490` / `#693→#694`, 3 Condition→Text `#614`F→`#616` / `#767`T→`#655` / `#674`F→`#676`), SHA-256 `1C7335ED49C7F9F7738B58CCDA4BA340543A9354002FAC2F9FBEC672784EDD48`. Un-repaired-import safety preserved (first-listed edges = complete happy path; opening-question `/book` link; no confirmation claims). Guest behavior byte-identical — every message, question, choice list, API id, field binding (incl. `69114`/`custom_69114`), and terminal unchanged.
4. **Rules encoded (generation + validation):** profile `maxInboundPerCondition: 1` (replaces `maxConditionSourceParents`), `editorProvenDrawPairs` = the 3 pairs, recomputed `approvedHubMerges`; validator check renamed `condition-parent-limit` → **`condition-inbound-limit`** (errors per inbound edge beyond 1 TOTAL on any Condition) and `redraw-drawability` now errors if a declared hub IS a Condition; the generator's `assertEditorContracts` refuses any redraw targeting a Condition, any unproven pair, and any Condition with >1 inbound.
5. **Evidence preserved:** the failed 181-node candidate is pinned byte-exact at [artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-3.failed-candidate.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-3.failed-candidate.txt) (141,728 bytes, SHA-256 `AB456A89…AB0C`, secret/guest-data scan clean) with a regression test proving it fails current validation with exactly the **3** beyond-limit Condition inbound edges (`#602`/`#654`/`#663`) that halted the round trip; the round-trip-#2 fixture's expected error count rises 11 → **14** under the stricter rule; round-trip-#1 fixtures untouched. Full findings: [artifacts/whatchimp/roundtrips/ROUNDTRIP_3_FINDINGS.md](../../artifacts/whatchimp/roundtrips/ROUNDTRIP_3_FINDINGS.md).

**Reason:** round trip #3 was the human gate on the 34-redraw candidate; it failed on exactly the three Condition-destination draws, proving the round-trip-#2 rule too narrow and its probe evidence methodologically insufficient (unused-input probes). The full cascade removes Condition destinations from the redraw plan entirely, so no future draw can hit this restriction.

**Impact:** generator rewritten to the full cascade (3 Condition-targeting hub edges removed, 5 clones added, proven-pair constants, Condition-redraw ban); profile, validator, simulator visit anchors (5 scenarios re-pinned to the clone routing), and tests updated (33/33 incl. the new round-trip-#3 fixture test; simulator 50/50; validator 0 errors / 0 warnings strict); `V6_DEPENDENCIES.md` status → full-cascade candidate / round trip #4; `V6_ROUNDTRIP_CHECKLIST.md` → round trip #4 procedure (39 draws, stop-and-report retained); `ROUNDTRIP_2_FINDINGS.md` Addendum marked superseded; `ROUNDTRIP_3_FINDINGS.md` added; KNOWN_BUGS #10 follow-up appended; regenerated `V6_REDRAW_CHECKLIST.md` + artifact recopied to the operator folder. No application code, schema, or locked-system changes. PR #67 stays open and unmerged; production WhatChimp untouched.

**Reversible?:** yes — deterministic generator, pinned fixtures. Import-safety is claimable only after round trip #4 (import → 39 redraws → save → close → reopen → export → comparator PRESERVED exit 0 + strict validator exit 0) passes on a fresh disposable bot, recorded in a superseding entry.

**Supersedes:** the "at most one Condition-source parent" binding rule, the six-operation proven list, and the merge-absorption layout (`#602`/`#654`/`#663` as hubs) in the "Corrected editor rule" entry below (body preserved verbatim per the append-only rule; its halt event and cascade direction remain accurate history).

> **Follow-up (2026-07-04):** round trip #4 never ran — the operator's authenticated button evidence enabled the **interactive-controls rebuild** (161 nodes, ZERO operator redraws, buttons/rows saving custom fields directly), superseding this entry's 39-redraw plan, 186-node totals, and round-trip-#4 gate. This entry's `maxInboundPerCondition: 1` rule remains binding and encoded. See the 2026-07-04 "Interactive-controls rebuild" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - Corrected editor rule (at most one Condition-source parent per Condition) proven by live probes; Condition-clone-cascade candidate shipped (181 nodes, 34 proven-operation redraws); gate is round trip #3

**Decision:** the operator ran the round-trip-#2 probe matrix on the authenticated editor (screenshots on record) and directed the rebuild; both are recorded here:

1. **Corrected platform rule (supersedes the pair-level conclusion in the entry below):** a direct Condition → Condition connection **is accepted** when it is the destination's first/only Condition-source parent; the editor's *"This will make an infinite loop…"* warning fires only on a **second** Condition-source parent. Binding rule: *each destination Condition input may carry at most ONE inbound edge whose source node type is Condition.* Live-proven drawable operations: Condition→Condition (first Condition-source parent only), Condition→User Input Flow, Text→User Input Flow, Condition→Text, Text→Condition, HTTP API→Condition. Probe edges were evidence only, not design.
2. **Architecture (operator-directed, no further human decision pending): the behavior-preserving Condition-clone cascade.** Every Condition that would receive an extra Condition-source parent gets a semantically identical, guest-invisible clone whose single serialized connection the import keeps automatically: `#440`→clones `750/752/754/756` (one per date-recovery branch) each chained to a paired `#602` clone `751/753/755/757`; `#470`→`758/759/760`; `#660`→`761` chained to `#663` clone `762`; `#690`→`763/764/765` — **16 clones**. Conditions that legally absorb their non-Condition parents stay merges (`#602`+Text ack, `#654`+second refine API, `#663`+Text ack), which is why the plan beats the provisional full-cascade estimate (39 draws / 186 nodes → **34 / 181**).
3. **New canonical `Oraya_natural_intake_v6.txt`:** **181 nodes, 214 output connections, 14 terminals, 15 declared merge points** (`466:5, 480:4, 490:5, 600:5, 602:2, 610:5, 616:2, 654:2, 661:2, 663:2, 670:2, 676:2, 691:4, 694:5, 736:2`), **exactly 34 operator-drawn connections** (27 Condition→User Input Flow, 2 Text→User Input Flow, 2 Text→Condition, 2 Condition→Text, 1 HTTP API→Condition, **zero drawn Condition→Condition**), SHA-256 `AB456A895221A46DE289EDA054DB9142B4D3F7D0A1892A3FFBEAFF999346AB0C`. Un-repaired-import safety preserved (first-listed edges = complete happy path; opening-question `/book` link; no confirmation claims). Guest behavior byte-identical — every message, question, choice list, API call, field binding (incl. `69114`/`custom_69114`), and terminal is unchanged.
4. **Rules encoded (generation + validation):** profile `importGraphContract.editorProvenDrawPairs` (the six ops), `editorRejectedDrawPairs: []` (the refusal is conditional), `maxConditionSourceParents: 1`, and the recomputed `approvedHubMerges`; validator `condition-parent-limit` (graph-wide, per-excess-edge errors) + `redraw-drawability` (unproven-pair warnings); the generator's `assertEditorContracts` refuses to emit an artifact whose redraw plan uses an unproven operation, contains a drawn Condition→Condition, or leaves any Condition with two Condition-source parents.
5. **Evidence preserved:** the halted 18-redraw candidate is pinned byte-exact at [artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-2.halted-candidate.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-2.halted-candidate.txt) (121,537 bytes, SHA-256 `0066192D…3A39`, secret/guest-data scan clean) with a regression test proving it fails current validation with exactly the **11** beyond-limit Condition-source parents that made its plan unexecutable; round-trip-#1 fixtures untouched.

**Reason:** the probes replaced an inferred blanket ban with the authenticated conditional rule, which restored a behavior-preserving repair path; the cascade is the operator-selected Option A direction with the merge-repair mechanism made executable under the corrected rule.

**Impact:** generator rewritten (fragmentation section, proven-operation gates, corrected checklist rendering); profile, validator, simulator visit anchors (3 scenarios now pin the clone routing), and tests updated (32/32; simulator 50/50; validator 0 errors / 0 warnings strict); `V6_DEPENDENCIES.md` status → corrected-rule hybrid candidate; `V6_ROUNDTRIP_CHECKLIST.md` → round trip #3 procedure (34 draws); `ROUNDTRIP_2_FINDINGS.md` gains the Addendum; KNOWN_BUGS #10 follow-up appended; regenerated `V6_REDRAW_CHECKLIST.md` + artifact recopied to the operator folder. No application code, schema, or locked-system changes. PR #67 stays open and unmerged; production WhatChimp untouched.

**Reversible?:** yes — deterministic generator, pinned fixtures. Import-safety is claimable only after round trip #3 (import → 34 redraws → save → close → reopen → export → comparator PRESERVED exit 0 + strict validator exit 0) passes on a fresh disposable bot, recorded in a superseding entry.

**Supersedes:** the pair-level "editor refuses Condition → Condition" conclusion, the probe-gate next step, and the "human architecture decision pending" status in the round-trip-#2 entry below (body preserved verbatim per the append-only rule; the halt event itself remains accurate history).

> **Follow-up (2026-07-03):** round trip #3 **corrected this entry's rule again** — the editor refuses ANY second inbound connection on a Condition, regardless of source type (`maxInboundPerCondition: 1`), and this entry's probe evidence was drawn against unused Condition inputs, which does not prove drawability against already-connected destinations. The 181-node candidate's redraw plan halted on its 3 Condition-destination items, and the full-cascade rebuild (186 nodes, 39 redraws, zero Condition-targeting draws) shipped the same day. See the "Round trip #3" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - Round trip #2: the WhatChimp editor refuses Condition → Condition connections; the Option A hybrid redraw plan is not operator-executable; candidate halted pending a drawability probe gate and a human architecture decision

**Decision:** four findings/decisions from the operator's round trip #2 attempt (fresh disposable bot, redraw item #1 attempted exactly as documented):

1. **Platform contract (operator-proven live):** the current WhatChimp editor **refuses to draw a Condition → Condition connection**, rejecting it with *"This will make an infinite loop. Place a button/list/section/interactive between these two nodes."* — even though the graph is a DAG (no real loop). Corollary, now binding on all future work: **a merge existing in a saved export does NOT prove the present editor can draw it.** The operator's own v5.5 `#440` 5-parent merge — cited in the Option A entry below as drawability evidence — is itself Condition → Condition ×5 (type audit of the v5.5 bytes); whatever created those edges, the present UI refuses to create them.
2. **Consequence for the shipped candidate:** the machine type-audit of the 18-edge redraw plan shows **11 edges are Condition → Condition** (items #1–4, #6–8, #12, #14–16; hubs `440`/`470`/`660`/`690` cannot receive their drawn edges at all) and the remaining 7 type pairs (Text→Condition ×2, Condition→Text ×2, Text→User Input Flow ×2, HTTP API→Condition ×1) are unproven. **The Option A hybrid as shipped is not operator-repairable; `Oraya_natural_intake_v6.txt` (SHA `0066192D…3A39`) and `V6_REDRAW_CHECKLIST.md` are HALTED — not approved for human testing.** No interactive node may be inserted to bypass the editor warning without explicit operator UX approval (it would add a guest-visible step at every merge).
3. **Rules encoded before any regeneration (per the operator's directive):** the profile gains `importGraphContract.editorRejectedDrawPairs` (`[["Condition","Condition"]]`) and `editorProvenDrawPairs` (empty — round trip #2 produced one proven rejection and zero proven acceptances); the validator gains a `redraw-drawability` check (error on any operator-drawn hub edge using a rejected pair, warning on any unproven pair) — the shipped candidate now fails validation **by design** with exactly 11 errors + 7 warnings; the generator emits a ⛔ halt banner and per-item NOT-OPERATOR-DRAWABLE markers into the regenerated checklist (artifact bytes unchanged) and no longer states the disproven drawability claim.
4. **Next steps are gated, in order:** (a) operator runs the 5-probe editor drawability matrix ([artifacts/whatchimp/roundtrips/ROUNDTRIP_2_FINDINGS.md](../../artifacts/whatchimp/roundtrips/ROUNDTRIP_2_FINDINGS.md) §6: Condition→User Input Flow, Text→User Input Flow, Condition→Text, Text→Condition, HTTP API→Condition), results recorded in the profile; (b) **human decision** picks the rebuild architecture. The behavior-preserving direction is quantified exactly in the findings: the **Condition-clone cascade** (Condition nodes are guest-invisible; splitting the 7 convergent condition hubs per-parent adds **21 nodes** (165→186) and relocates every merge onto interactive/Text nodes at the cost of **39 operator draws**, guest behavior byte-identical) — viable only if probe (a) passes for `Condition → User Input Flow`; otherwise the alternatives are an approved guest-visible UX change or a quantified behavior reduction (up to ~14 self-service re-entry paths degraded to escalation endings). A full pure-tree unroll stays infeasible (492,864 nodes, round trip #1).

**Reason:** round trip #2 was the human gate on the Option A hybrid; it failed at the first drawn edge with a hard editor rejection, invalidating the plan's central assumption and the evidentiary use of saved-export merges for drawability.

**Impact:** validator + profile + generator + tests updated as in point 3 (tooling tests 31/31; candidate pinned at 11 by-design errors); `ROUNDTRIP_2_FINDINGS.md` added (evidence, audit table, cascade quantification, probe plan); `V6_DEPENDENCIES.md` status → HALTED; `V6_ROUNDTRIP_CHECKLIST.md` top warning + round-trip procedure gated on the probes; KNOWN_BUGS #10 follow-up; regenerated `V6_REDRAW_CHECKLIST.md` (halt banner; artifact bytes unchanged) recopied to the operator folder. No flow-graph changes, no application code, no schema, no dependency. PR #67 stays open and unmerged; production WhatChimp untouched.

**Reversible?:** the halt is reversed only by a future candidate whose entire redraw plan uses operator-**proven** drawable pairs and which passes the full round-trip procedure, recorded in a superseding entry.

**Supersedes:** the "operator draws exactly 18 connections" execution plan and the "editor-drawn merges are export-proven (v5.5 `#440`)" drawability rationale in the Option A entry below (its body preserved verbatim per the append-only rule). The Option A architecture itself (tail clones + declared hubs) remains the operator-chosen direction; its merge-repair mechanism must be redesigned per point 4.

> **Follow-up (2026-07-03):** the operator's probe matrix **corrected the pair-level conclusion recorded here** — the editor rejects only a *second* Condition-source parent, not Condition → Condition as such — and the Condition-clone-cascade candidate shipped the same day. See the "Corrected editor rule" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - Option A hybrid rebuild shipped: branch-local tail clones + 11 declared hub merges + an 18-edge operator redraw checklist

**Decision:** the operator selected **Option A (hybrid)** from the round-trip-#1 entry below, and the v6 generator/artifact are rebuilt to it:

1. **Architecture.** Small linear tails are cloned branch-locally so they are single-parent on import: 10 escalation tails (wrapper → name question → Lead Submit `6961` → final text) for the date-failure (#438, #504), bedroom-retry (initial ×2 via new acknowledgement texts #626/#627, Edit ×2 via #686/#687), large-group (#468 initial, Edit clone), Edit-dates (#655), and second-Edit (#698) routes; a cloned Edit large-group review subgraph (clone of #466–#468); and a complete Edit-handoff clone (clone of the #70/#71/#72/#84/#73/#74/#75/#8/#9/#7 subtree with its own `7459`/`6961` Lead Submit nodes and website/WhatsApp terminals). The bedroom capacity check is restructured from 4 conditions to 3 (C1 `any[b3,g1,g2]`, C2 `[b1]`, C3 `any[g3,g4]`, 2 OK exits per validation) — guest-visible behavior unchanged, proven by the simulator.
2. **Declared hubs.** Exactly **11 irreducible hub merges** remain convergent, pinned in the profile's `importGraphContract.approvedHubMerges` with exact inbound counts: `440:5, 470:4, 490:2, 602:2, 616:2, 654:2, 660:2, 663:2, 676:2, 690:4, 694:2`. Since import keeps one parent per socket, the operator draws the **18** beyond-first edges in the editor after import, following the machine-generated [artifacts/whatchimp/V6_REDRAW_CHECKLIST.md](../../artifacts/whatchimp/V6_REDRAW_CHECKLIST.md) (per edge: sequence, source/dest ids, ports, purpose, canvas location, direction; hub-by-hub maps; verify commands). The generator asserts set-equality between the emitted redraw plan and all beyond-first hub edges, so 18 is a produced number, not an estimate.
3. **Un-repaired import safety.** The first-listed edge on every hub is the happy path (a fresh import runs the complete main scenario with zero redraws), the opening question carries `https://stayoraya.com/book` before any API node, and no terminal claims a confirmed booking — the pre-repair state degrades to missing escalation/Edit/capacity merges, never to fake success.
4. **Artifact.** New canonical `Oraya_natural_intake_v6.txt`: **165 nodes, 182 output connections**, SHA-256 `0066192D4487ED1AC8A95B00E22DEF8B754B1FB458E0025B178E8B125C913A39` (printed by the generator; regeneration is byte-for-byte reproducible and test-pinned). The pre-hybrid round-trip-#1 candidate is preserved byte-exact as a permanent fixture at [artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-1.import-candidate.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-1.import-candidate.txt) (SHA-256 `72578281…08A4`), alongside the round-trip-#1 re-export (`6ED2E190…7C89`).
5. **Validator hub contract.** `single-parent-contract` now accepts declared hubs **only at their exact inbound counts** (drift — e.g. an un-repaired re-export where hubs have one parent — is an error pointing to the redraw checklist); undeclared convergence remains an error.

**Reason:** round trip #1 proved imported convergence is destroyed (one parent per socket) while editor-drawn convergence survives save/export (v5.5 `#440` with 5 parents, v4.3.3 multi-input), and a full single-parent unroll is 492,864 nodes. The hybrid preserves the complete v6 guest behavior (extraction, skip-known-field gating, capacity validation, full Edit path, escalations, both handoffs) at the cost of one bounded, machine-specified manual step.

**Impact:** generator rewritten (`scripts/generate-whatchimp-v6.mjs` — clones, hub ordering, redraw-checklist emission, set-equality assertion); profile gains `approvedHubMerges`; validator hub contract updated; simulator extended to 50 scenarios (Edit endings, Edit escalations, retry escalations — all 14 terminals covered); tooling tests 30/30 (incl. byte-for-byte artifact+checklist reproducibility and mutation tests); artifact validator result exit 0, 0 errors, 0 warnings under `--strict-binding`; `V6_DEPENDENCIES.md` status upgraded to hybrid candidate; `V6_ROUNDTRIP_CHECKLIST.md` round trip #2 now includes the redraw step; KNOWN_BUGS #10 follow-up appended. No application code, schema, or dependency changes.

**Reversible?:** yes — the generator is deterministic and the pre-hybrid candidate is pinned; but import-safety may only be claimed after round trip #2 (import → 18 redraws → save → close → reopen → export → `compare-whatchimp-roundtrip.mjs` PRESERVED exit 0 + validator exit 0) passes on a fresh disposable bot, recorded in a superseding entry.

**Supersedes:** resolves the "structural direction awaits operator decision" item in the round-trip-#1 entry below (its body preserved verbatim per the append-only rule). The "not import-safe" status now applies to the pinned round-trip-#1 fixture; the canonical artifact's status is "hybrid candidate pending round trip #2".

> **Follow-up (2026-07-03):** round trip #2 subsequently proved the 18-edge redraw plan is **not operator-executable** — the editor refuses Condition → Condition connections (11 of the 18), and the v5.5 `#440` drawability evidence cited here is itself Condition → Condition ×5. This candidate is HALTED. See the "Round trip #2" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - Authenticated round trip #1: WhatChimp import keeps one parent per input socket; v6 candidate declared NOT import-safe; convergent import candidates now fail validation; structural direction awaits operator decision

**Decision:** four findings/decisions from the first authenticated WhatChimp round trip (import canonical `Oraya_natural_intake_v6.txt` → save → close → reopen → export; evidence preserved byte-for-byte at [artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt](../../artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt), 91,657 bytes, SHA-256 `6ED2E190E876A9FE00D9F3E68111A86BA60159F4E1B3EBA630574B217C8F7C89`):

1. **Platform contract (proven from the exact graph diff):** WhatChimp's import keeps only the **first serialized connection per input socket** and silently drops every other complete reciprocal edge on save. All 118 nodes survived semantically unchanged; exactly **32 edges were removed and 0 added**; all **16** multi-parent nodes were reduced to exactly one parent, and in 16/16 cases the survivor was the first-listed connection; 16 unintended terminals appeared. Complete machine-derived lost-edge table, business-impact grouping, and tooling evidence (validator on the re-export: 96 errors; simulator: 6/42): [artifacts/whatchimp/roundtrips/ROUNDTRIP_1_FINDINGS.md](../../artifacts/whatchimp/roundtrips/ROUNDTRIP_1_FINDINGS.md). Scope limit, also proven: this is an **import** normalization, not a saved-graph data-model rule — the operator's own v5.5 export carries a 5-parent node (`#440`) and the v4.3.3 production export carries multi-input nodes, so editor-drawn merges do survive save/export.
2. **Status:** the canonical `Oraya_natural_intake_v6.txt` (SHA-256 `72578281…08A4`) is **not import-safe** and must not be promoted toward production import. Its artifact bytes are intentionally left unchanged pending the structural decision below; the validator's new `single-parent-contract` check (profile `importGraphContract`) now fails it with exactly the 16 convergence violations, so no one can re-validate it as import-ready.
3. **Tooling contract:** round-trip verification is now machine-checked by `scripts/compare-whatchimp-roundtrip.mjs` (ignores only approved normalization — positions and regenerated `uniqueId`/`postbackId`/`newPostbackId`/`xitFbpostbackId`; nonzero exit on any node/edge/terminal/semantic loss), and the round-trip #1 outcome is pinned as a permanent regression fixture in `scripts/whatchimp-flow-tools.test.mjs` (0 deleted nodes, 32 lost edges, first-listed-survivor pattern, 16 unintended terminals).
4. **Structural direction is an operator decision, not taken here.** A pure single-parent rebuild preserving the current gating behavior is quantifiably infeasible: the exact full unroll of the candidate DAG is **492,864 nodes** (the "ask only missing fields, then reconverge" contract multiplies date-recovery variants × guest-known/asked × bedroom-capacity exits × villa-known/asked, with the complete Edit subtree hanging off every confirmation clone). The two viable directions are: **(a)** hybrid — clone the small linear tails (escalation/handoff/large-group), keep a bounded set of hub merges, and have the operator re-draw those edges in the editor after import (editor-drawn merges are export-proven; a machine-generated redraw table + comparator verification would gate it), or **(b)** an approved reduction of the gating behavior so the flow fits a pure tree (regresses specific documented behaviors — e.g. skip-known-field gating or full Edit re-validation). Choosing (a) or (b) changes guest-visible behavior or introduces a manual operator step, so it requires explicit human approval before the generator is rebuilt.

**Reason:** the round trip was the long-standing gate on KNOWN_BUGS #10 merge survival; it answered the question definitively and in the negative for imported merges. Re-adding the 32 links would recreate the same import-destroyed topology; rebuilding as a full tree is arithmetically impossible; the remaining options trade behavior or operator effort and belong to the operator.

**Impact:** validator gains `single-parent-contract` (rejects >1 connection per input socket, >`maxInboundPerNode` parents, and a root with inbound edges; profile gains `importGraphContract` + `roundTripIgnoreFields`); new comparator script; tests updated to pin the candidate's exact 16 violations and the round-trip regression fixture (26 tests); KNOWN_BUGS #10 follow-up records the result; `V6_DEPENDENCIES.md` status downgraded from "import-ready candidate" to "not import-safe — rebuild direction pending"; round-trip checklist gains the round-trip #2 acceptance procedure (fresh disposable bot + comparator + zero loss). CURRENT_PHASE updated. No artifact regeneration, no application code, no schema, no dependency.

**Reversible?:** the tooling and evidence are additive. The not-import-safe status can only be reversed by a future candidate passing an authenticated round trip verified with the comparator (zero semantic loss), recorded in a superseding entry.

**Supersedes:** the "import-ready v6 candidate" status statements in the three entries below (2026-07-03 canonical-artifact entry, 2026-07-03 question-transition entry, 2026-07-02 natural-intake entry). Their bodies remain verbatim per the append-only rule.

---

## 2026-07-03 - v6 ships as ONE canonical fully-bound artifact; export-survey evidence made exact; append-only log discipline restored

**Decision:** three related corrections, recorded as a new entry because the first two had earlier been written into older entry bodies in place — violating this file's append-only rule — and those bodies are now restored verbatim to their state at commit `f356b15`:

1. **Single canonical import file.** `Oraya_natural_intake_v6.txt` is the one operator-delivery WhatChimp import file. The generator emits the operator-created bedroom field id `69114` directly (question nodes carry `"customField": "69114"` with selected field name `oraya_bedroom_count`; the 8 bedroom condition rows carry `"custom_69114"`), so the artifact ships fully bound with zero placeholders and **no second binding step**. The separate delivery file `Oraya_natural_intake_v6_bound_69114.txt` described in the entry below was removed (repo + operator folder) after verifying the regenerated canonical file is byte-identical to it (SHA-256 `72578281…08A4`); `scripts/bind-whatchimp-field.mjs` is retained only as a generic placeholder-binding tool outside the delivery path, and `scripts/whatchimp/natural-intake-profile.json` lists no placeholder ids.
2. **Exact transition evidence.** The "operator's v5.5 + 20+ platform exports" survey wording in the entry below is replaced, for all current guidance, by the exact record in [artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md](../../artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md): 22 genuine WhatChimp exports (the in-repo byte-preserved v5.5 + 21 platform-named `whatsapp-bot_<id>_<timestamp>.txt` files, each listed with size and SHA-256 prefix), 167 question nodes, zero final-reply edges to anything other than Text or HTTP API; the agent-built counter-example files are hashed there as exclusions, and the genuineness criterion (platform naming + operator custody, not cryptographic proof) and interpretation limits are stated in that file.
3. **Append-only discipline.** Commits `2778036` and `b95a2ee` had edited the bodies of the 2026-07-02 natural-intake and 2026-07-03 question-transition entries below to reflect points 1–2. Per this file's header rule ("append-only — never edit a past entry except to add a follow-up dated link below it"), those bodies are restored verbatim from `f356b15` and this entry supersedes the affected statements instead.

**Reason:** the operator confirmed field `69114` and required one unmistakable import file; the evidence claim needed exact, auditable backing; and the in-place entry edits broke the log's audit trail.

**Impact:** where this entry conflicts with the two entries below (placeholder shipping, the separate bound delivery file, the "20+ exports" wording), **this entry wins**. Tooling, artifact, and operator docs already reflect it: canonical-file validator exit 0 with 0 errors / 0 warnings under `--strict-binding`, tooling tests 21/21, checklist A2 imports `Oraya_natural_intake_v6.txt` with no binding step.

**Reversible?:** yes — but only via a further appended entry, never by editing this or older entries.

**Supersedes:** the artifact-binding and evidence-wording statements inside the 2026-07-03 question-transition entry and the 2026-07-02 natural-intake entry below (both bodies preserved verbatim as historical record).

> **Follow-up (2026-07-03):** authenticated round trip #1 subsequently proved this canonical artifact is **not import-safe** — WhatChimp's import silently removed its 32 convergence edges. See the "Authenticated round trip #1" entry above. This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - Generated WhatChimp flows may only use export-proven node transitions; v6 question edges rebuilt through acknowledgement Texts and bedroom field 69114 bound

**Decision:** a generated WhatChimp flow artifact may only contain node-to-node transition patterns that appear in genuine WhatChimp exports. For question nodes (`User Input Flow Single`) the proven continuations are exactly: final reply → Text, final reply → HTTP API (and the chained-question port → another question). Direct Question → Condition and Question → User Input Flow edges are prohibited — the validator's `question-transition` check errors on them, and every question must have exactly one outgoing continuation. The v6 artifact's 9 offending edges (guest count, bedrooms, bedroom retry ×2 paths; villa ×2 paths; Edit confirmation) are rebuilt as `Question → acknowledgement Text → next` ("Perfect, thank you 😊" / "Noted 😊" / "Lovely choice 😊" / "Got it."), mirroring the operator's own v5.5 construction (`#491 → #492 "Got it." → #493`). The operator-created bedroom field id `69114` is bound into the delivery artifact `Oraya_natural_intake_v6_bound_69114.txt` (4 questions on `69114`, 8 condition rows on `custom_69114`, zero placeholders); the generator keeps emitting the documented placeholder so regeneration stays id-agnostic.

**Reason:** the operator imported the earlier v6 build (2026-07-03) and observed loose/disconnected links around exactly the business steps whose edges used the unproven transitions — the WhatChimp editor does not render or accept them, even though the JSON parses and passes reachability checks. A survey of every genuine export on record (the operator's v5.5 plus 20+ platform exports) shows question outputs feeding only Text or HTTP API nodes; the only files containing Question → Condition edges were earlier agent-hand-built flows, and the operator's repaired re-export of one of them had eliminated precisely that edge.

**Impact:** `scripts/generate-whatchimp-v6.mjs` inserts the 9 acknowledgement Text nodes (118 nodes / 149 edges); `scripts/validate-whatchimp-flow.mjs` gains the `question-transition` check; `scripts/simulate-whatchimp-flow.mjs` gains node-level `visitsInOrder` path assertions (six required scenarios now prove each expected question and downstream node is entered in order, not merely that a terminal is reached); `scripts/whatchimp/natural-intake-profile.json` records `oraya_bedroom_count: 69114`; new delivery artifact at repo root + operator folder; checklist A2 now verifies no loose question links after save → close → reopen. Save compatibility remains a WhatChimp-side gate (KNOWN_BUGS #10) — repository validation cannot prove it.

**Reversible?:** yes — regenerating without the ack nodes is one generator change, but doing so requires a superseding entry proving WhatChimp accepts the direct transitions.

> **Follow-up (2026-07-03):** the delivery-artifact and evidence-wording statements in this body are superseded by the "v6 ships as ONE canonical fully-bound artifact" entry above — the bound_69114 file no longer exists, the generator emits `69114` directly into the canonical `Oraya_natural_intake_v6.txt`, and the exact export survey lives in [artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md](../../artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md). This body is preserved verbatim per the append-only rule.

---

## 2026-07-03 - WhatChimp server-to-server HTTP APIs call the direct `www.stayoraya.com` API host; guest-facing links stay on the bare canonical origin

**Decision:** production WhatChimp HTTP API integrations (Stay Intent `7466`, Stay Intent Refine `8101`, Lead Submit `6961`/`7459`, and their TEST clones when not pointed at a Vercel Preview URL) must POST to the direct API host `https://www.stayoraya.com/api/butler/...`. Guest-facing URLs are unchanged: `https://stayoraya.com` remains the only canonical Oraya web origin, `https://stayoraya.com/book` remains the booking continuation link, and generated prefill links keep their existing origin. Every HTTP API verification in the round-trip checklist now explicitly rejects any `3xx` response as success.

**Reason:** operator-verified 2026-07-03 during an authenticated WhatChimp test: the bare origin answered a Lead Submit POST on `/api/butler/lead` with an HTTP `308` redirect, and WhatChimp did not safely complete the redirected POST — the flow never received the endpoint response, so `prefill_url` (and the secure website handoff it powers) stayed unavailable. On the direct host the same integration succeeded: Vercel recorded HTTP `200`, the prefill secret was present, no prefill-token-generation failure was logged, and the `lead_id` / `message` / `prefill_url` → `oraya_prefill_url` response mappings were visible. This is a WhatChimp client behavior around redirects, not a domain migration; no Vercel routing, application logic, or guest-facing URL changes.

**Impact:** endpoint instructions corrected in `artifacts/whatchimp/V6_DEPENDENCIES.md` and `artifacts/whatchimp/V6_ROUNDTRIP_CHECKLIST.md` (new A1.8 endpoint-verification rule incl. the expected Lead Submit success shape, D.2 four-integration host audit); BUTLER_PLAYBOOK canonical-origin section gains the server-to-server exception; new [KNOWN_BUGS.md](KNOWN_BUGS.md) #11; new tooling regression test ("operator docs: production WhatChimp API endpoints use direct www host") fails if any current operator doc reintroduces the bare API prefix. Fixing one tenant-level integration does not prove the other three — each is audited at cutover. Real-subscriber persistence and final WhatsApp rendering remain human checklist checks. The generated flow artifact is untouched (endpoint URLs live in tenant-level WhatChimp settings, not in the export).

**Reversible?:** yes — if domain routing later makes the bare API paths answer directly, a superseding entry can relax the requirement; until then the direct host is mandatory for WhatChimp POSTs.

---

## 2026-07-02 - Natural stay intake v6: validated WhatChimp artifact, deterministic flow tooling, `extracted_text` stale-field contract, WhatsApp bedroom capture

**Decision:** the WhatChimp Natural Stay Intake flow is rebuilt as a generated, machine-validated artifact (`Oraya_natural_intake_v6.txt`) produced from the operator's v5.5 export by `scripts/generate-whatchimp-v6.mjs`, and no flow revision may again be reported complete on parse/reachability evidence alone — `scripts/validate-whatchimp-flow.mjs` (semantic validator driven by `scripts/whatchimp/natural-intake-profile.json`) must exit 0 and `scripts/simulate-whatchimp-flow.mjs` (deterministic conversation simulator with stubbed API fixtures; its full scenario suite includes the fault-injection matrix and stands at 42/42 passing at this head) must pass before an artifact is called import-ready. Three durable contracts land with it:

1. **`extracted_text.*` response mirror (additive).** `POST /api/butler/normalize-stay-intent` now returns `extracted_text` alongside `extracted`: every key is a non-null string, with the literal string `"null"` for fields absent from the current message. WhatChimp response mappings should bind `extracted_text.*` → `oraya_check_in` / `oraya_check_out` / `oraya_villa` / `oraya_guest_count` so every normalization call deterministically overwrites the canonical fields. This is the current-attempt mechanism that stops a returning subscriber's stale villa/dates/guest count from leaking into a new attempt (WhatChimp's mapping behavior on JSON `null` is unverifiable from exports). Every missing-field condition in v6 compares against the literal `"null"`.
2. **WhatsApp guest/bedroom contract mirrors the website.** One exact overnight-guest question (choices 1–8 + "More than 8", saved to `oraya_guest_count`; the website's sleeping-guests input is min 1 / max 8), then a mandatory three-button bedroom question ("1 bedroom" / "2 bedrooms" / "3 bedrooms", saved to `oraya_bedroom_count`) validated with the website's `BEDROOM_CAPACITY` (1→2, 2→4, 3→6; 7–8 guests require 3 bedrooms + extra bedding). Insufficient selections get one forward-cloned re-ask, then escalate. Bedroom is always re-asked (never condition-skipped), so it needs no stale-field mechanism. Above-capacity groups capture the exact number in `oraya_guest_followup` and go to human review with a lead submitted — never silently accepted.
3. **Bedroom persistence is raw-payload-additive.** WhatChimp Lead Submit bodies gain `oraya_bedroom_count`, which lands verbatim in `whatsapp_leads.raw_payload` (no schema change). `/api/butler/prefill` surfaces it as `bedroom_count` only when it validates to "1"/"2"/"3", and `/book` hydration prefers this explicit preference over the derived-from-guests default while still preserving any manual selection. No locked system touched; `/api/bookings` unchanged.

The real WhatChimp custom-field id for `oraya_bedroom_count` does not exist yet; the artifact ships with the documented placeholder `__ORAYA_BEDROOM_COUNT_FIELD_ID__` and `scripts/bind-whatchimp-field.mjs <flow> <real-id>` binds it deterministically (a fabricated id is never acceptable). The artifact is an **import-ready v6 candidate** — the authenticated WhatChimp import/save/re-export round trip (validated with `--strict-binding`) and the live scenario checklist (`artifacts/whatchimp/V6_ROUNDTRIP_CHECKLIST.md`) remain the production gate. WhatChimp HTTP API integrations are tenant-global shared objects: production integrations `7466`/`8101`/`6961`/`7459` must not be edited for testing — pre-cutover testing uses cloned TEST integrations pointed at the PR's Vercel Preview deployment (checklist section A0/A1).

**No-dead-end terminal invariant (durable):** the flow must never strand a guest. Every reachable terminal message must deliver an actionable booking continuation — the secure `#oraya_prefill_url#` slot plus the canonical fallback `https://stayoraya.com/book` — and state the accurate not-confirmed status; a lead-submission or team-follow-up acknowledgement alone is an invalid terminal. Additionally, the opening intake question shows the canonical booking URL **before the first HTTP API node is reachable** (validator `pre-api-safety-link` check + simulator ordering invariant), so the guest holds a continuation even if the platform halts on a failed call. Enforced by the validator (`terminal-continuation`, `canonical-domain`, `pre-api-safety-link` checks) and the simulator's global invariants plus a fault-injection matrix (normalize/refine failures, WhatsApp / escalation-node / website-handoff Lead Submit failures, missing/empty/malformed `prefill_url`, retry exhaustion, above-capacity groups, double bedroom mismatch, repeated Edit, free-text choice-point replies, stale-overflow reset). **Stale-overflow reset (durable):** `extracted_text.guest_followup` is always the literal `"null"`; mapping it to `oraya_guest_followup` on 7466 and 8101 deterministically clears any stale exact-overflow count on every new/Edit attempt before any Lead Submit can fire — a supported-count lead can never carry a contradictory leftover. The remaining platform semantic — whether the live WhatChimp runtime continues past a failed HTTP call — is probed by checklist C11 across all four TEST integrations.

**Reason:** the previous agent reported the flow complete on parse/reachability/build evidence, yet the import contained unbound questions, dead-end API nodes, invalid condition rows, guest/villa paths that dead-ended at "Got it.", escalations that never submitted leads, no bedroom step, and an incomplete Edit path — the operator repaired parts by hand (v5.5). The validator reproduces all of those defects on v5.5 (exit 1; 60 errors at this head) before v6 fixes them (exit 0), which is the required proof the tooling detects more than JSON validity.

**Impact:** new `scripts/validate-whatchimp-flow.mjs`, `scripts/simulate-whatchimp-flow.mjs`, `scripts/generate-whatchimp-v6.mjs`, `scripts/bind-whatchimp-field.mjs`, `scripts/whatchimp/natural-intake-profile.json`, `scripts/whatchimp-flow-tools.test.mjs` (18 tests at this head); `Oraya_natural_intake_v6.txt` + byte-preserved v5.5 input + audit/dependency/checklist docs under `artifacts/whatchimp/`; additive changes to [lib/butler/extract-stay-intent.ts](../../lib/butler/extract-stay-intent.ts) (+4 tests, 35 total), [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts), [app/book/page.tsx](../../app/book/page.tsx); ARCHITECTURE.md API-surface rows updated; playbook natural-intake section updated; new [KNOWN_BUGS.md](KNOWN_BUGS.md) #10. No schema change, no new dependency, no env change, no locked-API touch.

**Reversible?:** yes — the tooling and artifact are additive; the backend changes are additive response/payload fields that existing consumers ignore.

**Supersedes:** extends the 2026-06-05 "Natural WhatsApp stay intake" entries; the operator-wiring guidance in BUTLER_PLAYBOOK now points at the v6 artifact instead of hand-built nodes.

> **Follow-up (2026-07-03):** the bedroom-field-placeholder paragraph in this body is superseded by the "v6 ships as ONE canonical fully-bound artifact" entry above — the operator created field `69114` and the generator now emits it directly, so no placeholder or binding step exists in the canonical artifact. This body is preserved verbatim per the append-only rule.

---

## 2026-07-02 - PR #64 merged; temporary QA mode retired and live checkout remains fail-closed

**Decision:** Merge the validated NetCommerce / CyberSource Unified Checkout sandbox foundation from PR #64, then remove its temporary Preview QA review bypass and booking auto-confirm exception from the production-bound codebase. The adapter reports checkout ready only in `sandbox`; selecting the production environment remains fail-closed until webhook/MLE reconciliation and explicit live rollout controls are implemented and approved.
**Reason:** NetCommerce confirmed successful sandbox testing and requested only the saved-card omission, which is complete. The QA exception had served its one-time external testing purpose and must not become dormant production behavior. Production credentials are still pending, and payment operations are not hardened enough for live readiness.
**Impact:** One-time Unified Checkout sandbox payments remain supported. Saved-card/tokenization remains disabled. Successful payment updates payment fields but leaves `bookings.status` unchanged for normal operational confirmation. Production payment remains unavailable even if credentials are added prematurely.
**Reversible?:** yes - live readiness can be implemented later only through an explicit Phase 16B production-activation change with webhook/MLE, idempotency/reconciliation, controlled rollout, and human approval.
**Supersedes:** the temporary runtime behavior in the 2026-06-22 PR #64 QA-mode decision; that historical entry remains below for traceability.

---

## 2026-06-22 - Saved-card/tokenization disabled for NetCommerce launch

**Decision:** PR #64 must omit CyberSource Unified Checkout saved-card consent for the NetCommerce launch. Oraya will support one-time Unified Checkout payments only and will not request TMS token creation, persist reusable customer/payment-instrument tokens, record saved-card consent, add token-management UI, or support credentials-on-file, recurring billing, or merchant-initiated payments in this launch.
**Reason:** NetCommerce confirmed the sandbox testing results were successful and requested that Oraya omit the "Save card for future payment" option before account activation. This keeps the launch scope aligned with one-time guest payment collection and avoids introducing consent, lifecycle, revocation, and security obligations that were not approved for Phase 16B launch.
**Impact:** `lib/payments/credit-libanais.ts` must keep the CyberSource capture-context saved-card consent request disabled. Remaining balances, approved add-ons, and top-ups require a new payment link unless NetCommerce later approves tokenization with explicit consent UX and security review. Refunds do not require saved-card tokenization. Production credentials are still pending and production payment remains disabled.
**Reversible?:** yes - but only after explicit NetCommerce approval, consent design, token lifecycle storage/revocation, and security review.

---

## 2026-06-22 - PR #64 temporary NetCommerce QA mode unlocks sandbox payment review gate

**Decision:** PR #64 may enable a temporary Preview-only NetCommerce QA mode using `NEXT_PUBLIC_NETCOMMERCE_QA_MODE=true` and `NETCOMMERCE_QA_MODE=true`. The public flag lets external NetCommerce testers proceed from `/book` to hosted checkout even when add-ons or special requests would normally show Oraya review-before-payment copy. The server flag lets `POST /api/payments/unified-checkout-complete` mark the sandbox booking `confirmed` only after CyberSource approves the transient-token payment and the same Supabase update persists the payment fields.
**Reason:** NetCommerce external testers were blocked before booking creation by the `/book` review gate ("This stay needs Oraya review before payment can be collected"), so they could not complete the required CyberSource Unified Checkout sandbox review. The testing requirement is explicit: add-ons and special requests must not block the sandbox payment path, and successful authoritative sandbox payment must leave the test booking confirmed for NetCommerce workflow validation.
**Impact:** This is not production activation and does not change production `master`. The flags default false/unset, must be scoped to the PR #64 Vercel Preview QA window only, and must not be copied to Production. Browser success/cancel redirects remain informational; failed, declined, abandoned, incomplete, pay-later, and cancelled bookings are not confirmed by the QA mode.
**Reversible?:** yes - remove/disable the two env flags for immediate rollback; remove the QA helper and guarded call sites when NetCommerce sandbox testing no longer needs this temporary path.

---

## 2026-06-17 - PR #64 Preview sandbox path is ready for NetCommerce-side testing

**Decision:** Draft PR #64 (`agent/phase-16b-cybersource-unified-checkout-test`) is the current Phase 16B NetCommerce / Credit Libanais / CyberSource sandbox implementation branch. It is open, unmerged, and ready for NetCommerce-side testing on Vercel Preview. Production `master` remains unchanged and production payment is not enabled.
**Reason:** The original NetCommerce task was to follow the CyberSource Unified Checkout guideline, use sandbox merchant details, add the NetCommerce payment/security seal, and notify NetCommerce when ready for their testing. The Preview approved-card path now passes: `/book` creates a booking; pay-now redirects to `/payments/checkout/[token]`; CyberSource Unified Checkout loads; the NetCommerce seal is visible; an approved sandbox card completes; `POST /api/payments/unified-checkout-complete` succeeds; payment fields update to authorized/paid; `bookings.status` remains `PENDING` for admin/operations confirmation.
**Impact:** Future agents must treat PR #64 as sandbox/Preview work only until NetCommerce review, declined-card validation, production credentials, production env setup, explicit production enablement, and final merge/release approval are complete. The private Vercel share link was sent outside the repo and must never be committed, quoted, or copied into docs.
**Reversible?:** yes - this is a status/coordination decision, not a production rollout.

---

## 2026-06-17 - Official NetCommerce payment seal is the approved PR #64 seal asset

**Decision:** The PR #64 checkout page uses the official NetCommerce seal asset (`NCseal_M.png`) for the sandbox payment/security display. The latest payment implementation commit includes `d8828c9 Use official NetCommerce payment seal`.
**Reason:** The external NetCommerce task explicitly asked Oraya to add the NetCommerce payment/security seal before handing the Preview over for testing. Using the official asset avoids relying on a placeholder or hand-drawn approximation.
**Impact:** The seal is part of the Preview sandbox readiness evidence for PR #64. Do not swap it for unofficial artwork or remove it without NetCommerce / David approval.
**Reversible?:** yes, but only if NetCommerce requests a different official asset.

---

## 2026-06-17 - Declined-card sandbox validation requires provider-supplied vector

**Decision:** Declined-card handling is not considered fully validated until NetCommerce/CyberSource provides an official declined-card sandbox vector or decline trigger and Oraya re-tests the Preview browser flow.
**Reason:** The attempted decline-style sandbox card authorized successfully during PR #64 validation. Treating that attempt as a declined-card pass would be misleading and could hide a real payment-state risk.
**Impact:** [KNOWN_BUGS.md](KNOWN_BUGS.md) tracks this as a Phase 16B payment QA/open validation item, not a production incident. Production rollout remains blocked until the decline path is validated alongside NetCommerce review/approval and production credential readiness.
**Reversible?:** yes - once the provider vector is received and the decline path passes, close the known-bug item with the validation date.

---

## 2026-06-17 - Dirty Phase 16B branch recovered; generated exports moved outside repo

**Decision:** The old dirty worktree `C:\Users\David\OneDrive - Sela\Desktop\oraya-web` on branch `codex/phase-16b-payment-readiness` has been recovered from accidental mass deletions and generated artifacts. It now has 0 tracked deletions, 0 tracked modifications, and 0 untracked files. Generated Phase 16C export artifacts were moved outside the repo to `C:\Users\David\OneDrive - Sela\Desktop\oraya-local-backups\phase-16c-exports-from-dirty-tree`.
**Reason:** The branch previously showed large accidental deletion/generation dirt and overlapped locked surfaces. It contained no useful tracked payment implementation work to salvage for PR #64.
**Impact:** Future Phase 16B implementation should not be based on that old dirty branch and should not treat it as pending useful payment work. Use updated `master` / a clean branch after the PR #64 decision unless David explicitly instructs otherwise.
**Reversible?:** N/A - cleanup coordination record.

---

## 2026-06-17 - CyberSource Unified Checkout SDK metadata comes from capture context

**Decision:** Credit Libanais / NetCommerce session parsing reads the CyberSource-returned Unified Checkout SDK metadata from the decoded capture context, including nested `ctx[*].data.clientLibrary` and `ctx[*].data.clientLibraryIntegrity`, before using any fallback asset URL.
**Reason:** PR #64 Preview validation showed `POST /api/payments/unified-checkout-session` returning 200, but the browser loaded a generic CyberSource asset and the Unified Checkout UI did not mount. Redacted capture-context inspection showed the real SDK URL and integrity value were present under the Unified Checkout context payload, not top-level `data`.
**Impact:** The checkout page now loads the bank/CyberSource-provided client library for the exact capture context. The session request also includes `PANENTRY` as the allowed payment type for card entry. Oraya still never collects card numbers or CVV; completion remains server-side transient-token authorization.
**Reversible?:** yes.

---

## 2026-06-17 - Preview payment links resolve from request origin

**Decision:** Phase 16B payment execution routes resolve checkout, return, and booking-view URLs from the current Vercel Preview request origin instead of blindly falling back to `SITE_URL` when `NEXT_PUBLIC_SITE_URL` is stale or missing. Production behavior remains canonical: `https://stayoraya.com` is still the fallback outside Preview.
**Reason:** PR #64 Preview validation showed the pay-now path creating a real Preview booking but persisting the hosted payment link as `https://www.stayoraya.com/payments/checkout/...`. That blocked sandbox validation on the branch alias and risked crossing Preview test data into production-domain UX.
**Impact:** Payment-only helper `lib/payments/request-origin.ts` is used by `POST /api/payments/checkout`, `POST /api/payments/unified-checkout-session`, and `POST /api/payments/unified-checkout-complete`. Locked `/api/bookings` remains untouched, so transactional email and booking-creation links still follow their existing `NEXT_PUBLIC_SITE_URL || SITE_URL` behavior.
**Reversible?:** yes.

---

## 2026-06-05 - Phase 16A natural stay intake — Batch 2 operator gate passed

**Decision:** Technical gate passed: WhatChimp confirmed able to call `POST /api/butler/normalize-stay-intent` and map nested `extracted.*` response fields (`extracted.check_in`, `extracted.check_out`, `extracted.villa`, `extracted.guest_count`). Architecture validated, endpoint reachable, nested field mapping verified. Production stay-booking flow migration (custom field, trigger, capture node, HTTP API call, response branches, retirement of old four-step intake) is still pending operator action.
**Reason:** Human-in-the-loop gate was required to confirm HTTP reachability and WhatChimp's ability to dereference nested JSON fields — the platform-side capability question that needed live verification before committing to production flow migration.
**Impact:** Technology validated; production flow migration still pending. `CURRENT_PHASE.md` and `BUTLER_PLAYBOOK.md` updated to reflect this distinction. No code change; docs only.
**Reversible?:** N/A (gate confirmation record).

---

## 2026-06-05 - Natural WhatsApp stay intake — new `POST /api/butler/normalize-stay-intent` endpoint

**Decision:** the rigid four-step WhatsApp intake (check-in → check-out → guests → villa) is replaced by a single natural-language ask backed by a new extraction endpoint. `POST /api/butler/normalize-stay-intent` accepts one free-text `stay_text` field (capped at 512 chars) plus an optional `reference_date` and returns `{ status: "clear" | "partial" | "unclear", extracted: { check_in, check_out, nights, villa, guest_count }, missing_fields, human_readable, safe_message, confirm_prompt }`. The endpoint is pure extraction — no Supabase read/write, no availability check, no email, no token, no lead persist. Date arithmetic is delegated to the existing `normalizeStayDates` helper so `YYYY-MM-DD` discipline (no `new Date(<guest text>)`) stays in one place. Villa detection is a substring scan over the canonical names plus the same aliases the existing `lib/butler/villa.ts` resolver recognizes (`mechmech`, `annaya`, `byblos`, `jbeil`). Guest-count detection is a small regex set (`N people / guests / adults / pax / persons`, `for N people`, `we are N`, `group of N`, `N of us`, number words). Missing-field fallbacks are buttons-only for villa (Mechmech / Byblos, no "Other") and number buttons 1–8 for guest count.

The existing two-field `POST /api/butler/normalize-dates` endpoint is **untouched** and remains available — Option A (extend the existing endpoint) was explicitly rejected because widening it from "date normalization" to "villa + guest-count detection" would silently shift the endpoint's purpose. A new endpoint named for what it actually does is cleaner to document, easier to retire later if the WhatChimp tenant ever gains LLM-grade extraction primitives, and produces a sharper DECISIONS_LOG entry.

**Reason:** live guests do not type information in the rigid order the existing flow asks for. The audit collected concrete examples (`"June 10 to June 15"`, `"June 10 till June 15 for 4 people"`, `"I want Mechmech from June 10 to 15, 3 adults"`, `"10 June for 3 nights"`, `"Book Byblos for 5 people next Saturday to Monday"`) and confirmed all five fail under the current four-field intake without a single-message extractor at the backend. The extractor stays at the backend (not in WhatChimp's AI Training layer) because the [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Knowledge source-of-truth" boundary forbids AI from inventing availability / pricing / policy / structured booking fields — by extension, any free-text-to-structured-fields decision must be made by Oraya's deterministic code, not by an LLM. Pushing extraction into the backend keeps the boundary intact while still letting WhatChimp run a *natural* opening prompt.

**Operator-side WhatChimp wiring is intentionally separate** (the existing pattern from the 2026-05-23 marker / sentence work). This decision lands the backend + tests + docs only; the WhatChimp custom-field + trigger + branches changes are batch 2 of the audit and are documented in the BUTLER_PLAYBOOK natural-intake section.

The audit explicitly considered and rejected:

- **Option A — extending `/api/butler/normalize-dates`.** Rejected because the endpoint's name + DECISIONS_LOG history (2026-05-14 read-only date normalization) advertise it as a *date* helper. Adding villa + guest-count detection would either widen the endpoint silently or require renaming it, both of which are noisier than just adding the new dedicated endpoint.
- **Letting WhatChimp's AI Training layer extract the structured fields.** Rejected — direct violation of the playbook's no-AI-decisions boundary. The backend must remain the only normalization authority.
- **Schema changes (e.g. adding a `stay_text` column to `whatsapp_leads`).** Rejected — the verbatim `stay_text` already flows into `whatsapp_leads.raw_payload` via the existing ingest contract; no column is required.

**Impact:**

- [lib/butler/extract-stay-intent.ts](../../lib/butler/extract-stay-intent.ts) — new pure helper. `extractStayIntent({ stay_text, reference_date })` returns the `StayIntentResult` envelope. Delegates date parsing to `normalizeStayDates`. Adds connective splitting (`to` / `till` / `until` / `through` / `thru` / `->` / `→` / spaced ` - `), bare-day check-out reconstruction (`June 10 to 15` → `June 15`), bare-weekday check-out anchored to the parsed check-in (`Saturday to Monday` → Monday after Saturday), and a `2026-06-10 2026-06-15` ISO-pair injector. ASCII-only character class (English-first per playbook).
- [app/api/butler/normalize-stay-intent/route.ts](../../app/api/butler/normalize-stay-intent/route.ts) — new secret-guarded POST route. Same 503 / 401 / 400 / 200 contract as the rest of `/api/butler/*`. Caps `stay_text` at 512 chars, validates `reference_date` as ISO when present.
- [lib/butler/extract-stay-intent.test.mts](../../lib/butler/extract-stay-intent.test.mts) — 31 unit tests covering the headline combined-message cases, villa + guest-count detectors, hyphen day-range normalization, ISO date pair handling, partial/unclear paths, the safe-message + confirm-prompt copy, and hostile-input safety (oversize text, emojis, non-string input, missing reference date). Runner is Node's built-in `node:test` via the `.mts` ESM TS-strip loader — no new dependency. Run with `node --test lib/butler/extract-stay-intent.test.mts`.
- [tsconfig.json](../../tsconfig.json) — added `"allowImportingTsExtensions": true`. Required for the helper's explicit `.ts` extension on `import "./normalize-dates.ts"`, which in turn is required so the same file resolves both under Next.js (via webpack/SWC) and under Node's TS-strip ESM loader (which does not auto-resolve extensionless imports). `noEmit: true` was already set, which is the TypeScript-required precondition for this flag.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — new API surface row + new entry under "Butler flow (Phase 16A — operational surface) → Read endpoints (shipped)".
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Natural stay intake (Phase 16A)" section documenting the request/response contract, status semantics, fallback prompts, operator wiring, backend invariants, and v1 limitations. New bullet under "Forbidden AI behavior" banning AI pre-processing of `oraya_stay_text`.
- [docs/system/CURRENT_PHASE.md](CURRENT_PHASE.md) — "Just completed" entry added; open-issues bullet for operator-side WhatChimp wiring (batch 2).
- No new env var. No schema change. No dependency added. No locked-API touch. `/api/butler/normalize-dates`, `/api/butler/lead`, `/api/butler/prefill`, `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, payment files, and WhatChimp export files all untouched.
- `npx tsc --noEmit`: exit 0, clean. `npm run build`: exit 0, new `/api/butler/normalize-stay-intent` route registered. `node --test lib/butler/extract-stay-intent.test.mts`: 31 pass / 0 fail.

**Reversible?:** yes — single-PR revert restores the prior state. The two new files can be removed; the four doc edits + the one-line tsconfig edit can be reverted. Operator-side WhatChimp wiring is independent (batch 2) and would simply never call the missing endpoint.

**Supersedes:** none. Extends the 2026-05-14 read-only `normalize-dates` decision by adding a second, more ambitious extraction surface alongside it; the 2026-05-14 endpoint is unchanged.

---

## 2026-06-05 - Butler handoff auto-advance and bedroom derivation shipped in `/book`

**Decision:** two behaviour gaps in the WhatsApp → website handoff are closed in [app/book/page.tsx](../../app/book/page.tsx):

1. **Bedroom derivation from hydrated guest count.** `applyButlerPrefill` now derives `bedroomCount` from `sleeping_guests` using the inverse of `BEDROOM_CAPACITY` (`≤ 2 guests → "1"`, `≤ 4 → "2"`, `≤ 6 → "3"`). The derivation only fires when `bedroomCount` is still the un-touched default `"1"`; any manual selection already made by the guest is preserved.

2. **Butler-handoff auto-advance from Step 1 → Step 2.** A new `useEffect` fires when `butlerPrefillReady` and `availabilityReadyForSelection` are both true, the stay selection passes the same validity checks as the manual "Continue" button (dates present, no conflict), and the session is identified as a butler handoff (`?h=` param present OR stored butler prefill in `sessionStorage`). It sets `reserveAutoNavigatedRef.current = true` to prevent duplicate firing and calls the existing `transitionStep1To("request")` which also handles scroll-to-top. The `reserveAutoAdvanceSuppressedRef` already prevents re-advance after an explicit Back action; the `reserveAutoAdvanceSignature` reset re-enables it only when the villa/date selection changes.

**Reason:** live testing of the Phase 16A WhatsApp → website handoff revealed: (a) opening `/book?h=<token>` with 3 guests hydrated `sleepingGuests = 3` but left `bedroomCount = 1` (capacity 2), showing a capacity warning instead of the correct 2-bedroom default; (b) the page stayed on Step 1 after hydration, forcing the guest to manually click "Continue to stay setup" — defeating the "seamless continuation" intent of the handoff. The "Butler continuation auto-advance readiness gate" in CURRENT_PHASE.md (PR #25 description) documented the design intent; the gating variables (`butlerPrefillReady`, `availabilityReadyForSelection`, `reserveAutoNavigatedRef`, `reserveAutoAdvanceSuppressedRef`) existed but the actual `useEffect` that acted on them was never implemented.

**Impact:**

- [app/book/page.tsx](../../app/book/page.tsx) — two additions:
  1. Bedroom-derivation block inside `applyButlerPrefill` (after the `sleepingGuests` setter).
  2. Auto-advance `useEffect` placed after `transitionStep1To` declaration, before the existing scroll useEffect.
- No schema change. No API change. No auth change. No new dependency.
- `npx tsc --noEmit`: clean. `npm run build`: clean.

**Reversible?:** yes — single-file revert restores prior behaviour (manual "Continue" required; bedroom stays at default 1).

**Supersedes:** closes the implementation gap left by the CURRENT_PHASE.md entry for PR #25 ("Butler continuation auto-advance readiness gate") — that entry described the gating design; this entry records the wiring that makes it functional.

---

## 2026-06-03 - Canonical Oraya web origin is `https://stayoraya.com`; `www.oraya.com.lb` is a wrong-domain response, not a migration

**Decision:** the single canonical Oraya web origin is **`https://stayoraya.com`** and only `https://stayoraya.com`. Any AI Training, WhatChimp Bot Reply, generic AI assistant, or human-facing reply that proposes a different host - in particular `www.oraya.com.lb`, `oraya.com.lb`, or any unprefixed `oraya.com` variant - is a wrong-domain bug and must be treated as one. This is not a domain migration. There is no LB-TLD Oraya web property today. This is documented in [docs/system/PROJECT_STATE.md](PROJECT_STATE.md), [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) (entry #8), and [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) (canonical-domain section).

**Reason:** the canonical origin has been stable since launch: `lib/brand.ts` `SITE_URL` falls back to `https://stayoraya.com` when `NEXT_PUBLIC_SITE_URL` is unset, every transactional email helper builds links off that origin, and every `/legal/*` and `/booking/view/[token]` URL is served from that host. Despite this, generic AI assistants outside Oraya's repo (including external WhatChimp configurations and untrained chat surfaces) have occasionally produced `www.oraya.com.lb` when asked for "the Oraya website." Such responses route guests at a non-existent domain. Documenting the canonical origin as a non-negotiable in the durable decision log prevents future AI-trained surfaces from being miswired or misrepresented as a migration.

**Impact:**

- [docs/system/PROJECT_STATE.md](PROJECT_STATE.md) — canonical-origin line added near the production-status bullets.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #8 documents the AI wrong-domain response risk.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Canonical Oraya web origin" subsection (operational guidance for AI Training / WhatChimp configuration).
- [docs/system/CURRENT_PHASE.md](CURRENT_PHASE.md) — open-issues bullet added.
- No code change. No env change. No schema change.

**Reversible?:** trivial — this is a clarifying decision, not a new constraint. If Oraya ever introduces an `.lb` web property, that becomes a new decision that supersedes this one explicitly.

**Supersedes:** none. Formalizes an invariant that was already shipped in code ([lib/brand.ts](../../lib/brand.ts), every `lib/send-*-email.ts`) but not previously captured as an explicit AI-facing constraint.

---

## 2026-06-03 - Booking flow is consolidated into three explicit steps (Villa & Dates → Stay Setup → Review & Guest Details); Step 3 ships a dual-CTA Reserve action set

**Decision:** the public Reserve booking flow at [app/book/page.tsx](../../app/book/page.tsx) is consolidated to three explicit steps:

1. **Villa & Dates** — villa selection + check-in/check-out picker + eligibility check.
2. **Stay Setup** — bedrooms, guests, add-ons, special requests; live estimated total.
3. **Review & Guest Details** — review summary, guest-details form (Reserve path), payment decision.

The step labels are exact and verified in code (`labels = ["Villa & Dates", "Stay Setup", "Review & Guest Details"]` at app/book/page.tsx:824).

A visible Step 4, a standalone Guest Details step, and a four-step booking journey were explicitly evaluated and **rejected**. Step 3 hosts both the review summary AND the guest-details form; checkout / payment is a final action invoked from Step 3, not a separate visual step.

Step 3 (Reserve path) presents **two clear actions**:

- **Primary:** **"Continue to secure payment"** — solid gold button, full-width within the action row, leads to hosted-checkout execution via `POST /api/payments/checkout`. Blocked in the UI with clear setup messaging when the configured hosted-checkout provider is not truly ready (no fake checkout, no silent fall-through).
- **Secondary:** **"Reserve now, pay later"** — outline / transparent-background button with a thin gold border and gold text, separate row below the primary action so it reads as visibly lower priority. Submits a booking request without collecting payment on the website. Used by guests who prefer to be confirmed before paying, by guests holding add-ons / special requests that need Oraya review first, and by operators wiring manual / bank-transfer rails.

**Reason:** the prior architecture had drifted toward a four-step UX with a separate Guest Details step and a Step 4 review. Operationally this was extra friction, and guests reading the progress indicator perceived the journey as longer than it actually was. Collapsing review and guest details into Step 3 (a) keeps the Reserve path under three visible steps for premium hospitality framing, (b) ensures the guest-details form is shown alongside the final review that locks in their decision, and (c) gives both pay-now and pay-later Reserve paths a single shared review surface. The dual-CTA pattern makes the "secure payment" intent unambiguously primary while still preserving the operator-friendly "Reserve now, pay later" path. The earlier Step 3 secondary path was a plain text link ("Prefer to reserve and pay later? Submit booking request") — the visual ranking is now reinforced by treating the secondary as a real outline button.

**Impact:**

- [app/book/page.tsx](../../app/book/page.tsx) — three-step layout, exact step labels, dual-CTA Step 3 (action rendering + intent dispatch via `submitIntent = "pay_now" | "reserve"`). Shipped via [apps#56](https://github.com/Staleen/oraya-web/pull/56) (three-step consolidation) and [apps#58](https://github.com/Staleen/oraya-web/pull/58) (secondary CTA upgrade).
- [lib/payments/runtime.ts](../../lib/payments/runtime.ts) and the readiness contract control the pay-now path's blocked / available state without leaking secret env values.
- No schema change. No locked API behavior change. No new dependency.

**Reversible?:** yes — single-file revert per change restores prior layout. The booking pipeline never depended on the visual step count.

**Supersedes:** refines the 2026-05-22 "Guest-facing payment behavior is now settings-driven before Credit Libanais execution goes live" decision by locking the visual step shape that drives Step 3.

---

## 2026-06-03 - Stay payment proceeds independently of add-ons and special requests; approval-based items are reviewed and charged separately

**Decision:** the website Reserve "pay now" path collects the stay payment first. Add-ons and special requests do NOT block the stay payment. Approval-based add-ons (those flagged `requires_approval` per the existing addon-operations model) are reviewed by Oraya after the booking is reserved and charged separately if and when they are confirmed. The Step 3 review surface tells the guest explicitly when add-ons or special requests are present: "Add-ons and special requests are confirmed by Oraya first. Reserve the stay now; we will send the correct payment step after approval, usually within 24 hours." (verified in [app/book/page.tsx](../../app/book/page.tsx) at the "Payment after Oraya review" panel).

**Reason:** under the old model, the presence of an approval-required add-on or a non-trivial special request blocked the entire pay-now flow because the total wasn't yet final. That kept Oraya's premium guests waiting on manual Oraya confirmation for the stay portion that was already determinate. Splitting "stay charge now" from "add-ons reviewed and charged later" gives the guest a faster confirmation path on the stay (premium hospitality UX), keeps the operator's add-on review surface unchanged (admin operations confirm add-ons explicitly), and aligns with the booking-first / webhook-first hosted checkout architecture that already separates payment lifecycle from booking lifecycle.

**Impact:**

- [app/book/page.tsx](../../app/book/page.tsx) — Step 3 "Payment after Oraya review" panel renders when `hasAddonsOrSpecialRequestsForReview` is true; the primary CTA remains "Continue to secure payment". No change to the locked `/api/bookings` POST contract, the addon-audit fail-closed rules, or the operational strict-rule enforcement.
- The "Reserve now, pay later" secondary CTA remains the explicit pay-later path for guests / operators who prefer admin confirmation before any charge.
- Approval-based add-ons continue to be tracked on the booking row and the admin review surface. The pay-now hosted-checkout amount is the stay total; add-on charging occurs through the existing admin-driven payment flow once admin approves.

**Reversible?:** yes — single-file revert. The booking pipeline did not change.

**Supersedes:** none. Formalizes the policy that ships with the three-step + dual-CTA Step 3 above.

---

## 2026-06-03 - WhatsApp CTA prefills reverted to plain human sentences ("Check my booking <ref>" / "Help with my booking <ref>"); structured-marker scheme withdrawn

**Decision:** the two website-side WhatsApp CTAs that pre-fill the WhatsApp compose box - booking-view "WhatsApp us" and booking-confirmed "Change/cancel via WhatsApp" - now emit **plain human sentences**, not structured markers. `bookingWhatsAppPrefill(ref)` in [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) returns `"Check my booking <ref>"`; `bookingWhatsAppChangePrefill(ref)` returns `"Help with my booking <ref>"`. The earlier `#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>` marker scheme is **withdrawn**. The no-reference fallback constants (`WHATSAPP_GENERAL_CONTACT_PREFILL`, `WHATSAPP_CANCEL_CHANGE_NO_REF`) remain plain human sentences and continue to enter the welcome flow. Normal greetings ("hi", "hello", free-form questions) continue to enter the existing welcome menu - prefills are emitted only by website CTAs, never typed by the guest.

**Reason:** the 2026-05-23 marker scheme assumed WhatChimp would route on the structured marker prefix and skip the welcome menu. Live operator testing confirmed that WhatChimp does not expose the inbound message text to Condition / HTTP-API-body interpolation on the production tenant (the only system fields available are first name, last name, label, email, phone number, chat ID; no "last user message" variable). The marker's only value over a plain sentence was the visual distinctiveness of the `#`-prefixed tag - but the operator routing has to happen on the SUBSTRING the trigger matches either way, and a plain sentence like `"Check my booking"` is at least as routable as `"#ORAYA_REF:"` while reading naturally to any human who sees the prefill in their compose box. The structured marker also created a small but real UX risk: a curious guest seeing `#ORAYA_REF:A0B8CECB` in their compose box might wonder whether they should type that themselves, or might paste it elsewhere. Plain hospitality language ("Check my booking A0B8CECB") eliminates that ambiguity entirely without sacrificing routing.

The audit explicitly considered and rejected:

- **Keeping the marker scheme behind WhatChimp.** Rejected — the marker introduced a guest-visible artifact (`#ORAYA_REF:`) that has no positive use for the guest and creates a low-grade "what is this?" friction. The plain sentence routes equally well via substring matching and reads better.
- **Reverting only the prefill copy while keeping the marker as a hidden routing tag elsewhere.** Rejected — there is no other surface emitting the marker today; the prefill was the marker's only carrier.
- **Going back to the pre-marker generic prefill (`"Hello Oraya — I have a question about a booking."`).** Rejected — the original problem the marker solved was that the generic prefill landed in the welcome menu when the website CTA wanted to disambiguate "view" vs "change/cancel" intent. Plain sentence prefills that NAME the intent ("Check my booking", "Help with my booking") preserve that disambiguation.

**Impact:**

- [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) — `bookingWhatsAppPrefill` and `bookingWhatsAppChangePrefill` return plain sentences; updated docstrings explain the substring-routing model and the WhatChimp limitation. Shipped via [apps#54](https://github.com/Staleen/oraya-web/pull/54).
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — "Website CTA marker routing" section rewritten as "Website CTA prefill routing"; documents the plain-sentence format, the substring trigger contract, and the operator manual steps. The "Verified WhatChimp platform limitation" subsection (added 2026-05-23) carries forward unchanged because it still describes the underlying constraint.
- [docs/system/PROJECT_STATE.md](PROJECT_STATE.md) — "Main completed systems" "Website CTA prefill routing" entry reflects the plain-sentence format.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — Butler-flow "Website CTA marker prefill" bullet updated to "Website CTA prefill" plain-sentence format.
- [docs/system/CURRENT_PHASE.md](CURRENT_PHASE.md) — Just-completed entry added; out-of-scope item bans re-introducing the marker scheme without a superseding entry.
- The `/api/butler/identify` `message_text` field and the bounded `\b[0-9A-Fa-f]{8}\b` extractor in [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts) remain in the codebase as forward-compatible code for non-WhatChimp channels (Telegram, Messenger, direct WhatsApp Cloud API) that DO expose inbound text. Their presence and behavior do not depend on the prefill format.
- No backend behavior change. No schema, env, auth, token, payment, calendar, or booking-pipeline touch.

**Reversible?:** yes — single-file revert restores the prior marker prefills. The WhatChimp operator side can keep or remove triggers independently.

**Supersedes:** both 2026-05-23 entries below — "Website WhatsApp CTA prefills become structured markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`)" AND its same-day correction "WhatChimp inbound-text limitation verified; marker-routing operator flow corrected to explicit reference-input step." The earlier entries are kept in place per the append-only rule; this entry records the reversal authoritatively.

---

## 2026-05-23 - WhatChimp inbound-text limitation verified; marker-routing operator flow corrected to explicit reference-input step (supersedes auto-extract assumption in the earlier 2026-05-23 marker decision)

**Decision:** the website-side WhatsApp CTA markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`) introduced in PR #51 stay in place. **The operator-side WhatChimp routing**, however, no longer assumes that the booking reference can be auto-extracted from the marker on the backend via `message_text`. Production testing confirmed that the WhatChimp tenant exposes only six system fields (first name, last name, label, email, phone number, chat ID) — no usable "last user message" / inbound-text variable, no Condition field for the message body, no HTTP API body-interpolation token. The marker trigger therefore routes the guest to an **explicit booking-reference input step** that captures the 8-char code via the existing `User Input Flow Single` → `oraya_booking_reference` custom field, then merges into the existing Node 13 (HTTP API 7219 → `POST /api/butler/identify`) identity orchestration unchanged. The marker eliminates the Welcome-menu redundancy; the explicit reference ask remains because WhatChimp cannot do the extraction itself. PR #47's `message_text` field on `/api/butler/identify` and the bounded extractor in `lib/butler/extract-booking-reference.ts` stay in the codebase as forward-compatible code for future non-WhatChimp channels (Telegram, Messenger, direct WhatsApp Cloud API) and for any future WhatChimp version that exposes inbound text.

**Reason:** the earlier 2026-05-23 marker decision documented the operator routing as "skip the Welcome menu and route directly to the Oraya Identify - Production HTTP API," implying that `message_text` would extract the reference server-side. Live verification proved that WhatChimp's variable picker has no inbound-message field. The auto-extract path is therefore unreachable on the production tenant, and the operator must wire a small reference-input step inside the marker-triggered flow. The marker is still load-bearing — it lets WhatChimp route a website-CTA guest into a hospitality-grade booking-reference prompt without first showing the Welcome menu — but the previously-implied "one HTTP API call, zero asks" behaviour is not achievable until WhatChimp ships an inbound-text variable. Acknowledging the limitation in the docs avoids future agents wiring against a capability that doesn't exist on this tenant.

The audit explicitly considered and rejected:

- **Reverting the marker prefills back to human sentences.** Rejected — the marker still pays for itself: it lets the bot skip the Welcome menu redundancy and disambiguate view vs change/cancel intent at the trigger layer. Without the marker, every website-CTA guest would land back in the Welcome menu first.
- **Removing the `message_text` field on `/api/butler/identify` and deleting `lib/butler/extract-booking-reference.ts`.** Rejected — both are forward-compatible additions with zero cost when no caller sends `message_text` (the orchestrator's empty-`booking_reference` branch is the existing `ask_for_booking_reference` flow). Non-WhatChimp channels and future WhatChimp versions will reactivate the path automatically.
- **Adding a Butler-side endpoint that accepts the entire WhatChimp request payload and parses out the message text from there.** Rejected — WhatChimp's outbound HTTP API request body is configured per node in the WhatChimp UI; if the operator can't add `message_text: <variable>` to the body, the backend can't synthesise inbound text from anywhere else. The platform limitation is at the WhatChimp UI / variable layer, not at the wire layer the backend could intercept.
- **Asking WhatChimp support for a custom variable.** Out of scope of this codebase; flagged as a longer-term operator action. Until that lands (if ever), the documented flow stands.

**Impact:**

- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — "Website CTA marker routing" section corrected. New "Verified WhatChimp platform limitation (2026-05-23)" subsection documents the six available system fields and the absence of an inbound-text variable. The Routing-contract and Operator-manual-steps subsections are rewritten to describe the explicit reference-input step and the agreed hospitality copy. The Backend-invariants subsection is rewritten to clarify that `message_text` is forward-compatible code, not the production path.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #7 documents the WhatChimp inbound-text limitation as an operator-side platform constraint (not a backend bug). Entry #6 stays closed (the `/api/butler/identify` `message_text` field shipped correctly in PR #47 — the bug closure was about the backend, which is correct).
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — the existing "Website CTA marker prefill" Butler-flow bullet (added in PR #51) stays accurate at the architecture-summary level; the playbook is the operational source-of-truth for the corrected routing.
- No code changes. `lib/booking-trust-messaging.ts` prefill builders stay exactly as PR #51 shipped them. `/api/butler/identify` and `lib/butler/extract-booking-reference.ts` stay exactly as PR #47 shipped them. No schema, no env, no auth, no token-continuity, no payment, no booking-pipeline touch.
- `tsc --noEmit` clean; `npm run build` clean (no code changes; runs only confirm the doc-only edits don't break anything).

**Reversible?:** yes — single-file revert per doc restores the prior wording. No data migrated, no operator-side state created by this change.

**Supersedes:** refines the earlier 2026-05-23 "Website WhatsApp CTA prefills become structured markers" entry by correcting the operator-routing claim it made. The marker prefill code and the rationale for choosing structured markers both carry forward unchanged; only the post-trigger WhatChimp flow description is corrected.

---

## 2026-05-23 - Website WhatsApp CTA prefills become structured markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`)

**Decision:** the two website-side WhatsApp CTAs that pre-fill the WhatsApp compose box (booking-view "WhatsApp us" and booking-confirmed "Change/cancel via WhatsApp") now emit a structured marker instead of a human sentence. `bookingWhatsAppPrefill(ref)` in [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) returns `#ORAYA_REF:<ref>`; `bookingWhatsAppChangePrefill(ref)` returns `#ORAYA_CHANGE:<ref>`. The no-reference fallback constants (`WHATSAPP_GENERAL_CONTACT_PREFILL`, `WHATSAPP_CANCEL_CHANGE_NO_REF`) remain plain human sentences and continue to enter the welcome flow. The two markers are operator-routing infrastructure that WhatChimp triggers on; the guest never needs to understand them. Normal greetings (`"hi"`, `"hello"`, free-form questions) continue to enter the existing welcome menu — the markers are emitted only by website CTAs, never by user typing.

**Reason:** even after the 2026-05-23 `message_text` field on `/api/butler/identify` shipped, the website prefill `"Hello Oraya — booking reference A0B8CECB"` still required WhatChimp to route on the keyword `"booking reference"`. That keyword could be typed by a user manually, and the trigger had no way to distinguish "guest arrived from the website CTA and the reference is in the message body" from "guest typed the phrase by hand and may or may not have the reference." Routing was correct but the bot could not safely skip the welcome menu without risking false-positive routing on hand-typed messages. A dedicated marker — chosen to be visually distinct (`#`-prefixed), case-insensitive, and impossible to type accidentally — gives WhatChimp an unambiguous routing signal while staying plain text inside the WhatsApp UI. The 8-char reference embedded in the marker is still the public guest-facing support code, so no new disclosure boundary is crossed. The marker is forward-compatible with the existing `message_text` extractor: `\b[0-9A-Fa-f]{8}\b` matches the reference cleanly inside `#ORAYA_REF:A0B8CECB` because `:` and `#` are non-word characters and the word boundary holds.

The audit explicitly considered and rejected:

- **Bare 8-character reference prefill** (`"A0B8CECB"`). Rejected — WhatChimp's exported flow has no regex / pattern primitive available at the trigger or condition layer (only `contains` / `equal`), so a bare hex string cannot be distinguished from any other 8-character text the user might type. A trigger keyword of `""` or a default/catch-all would fire on every unmatched message — bad UX for typos and random replies.
- **Keep the existing human sentence and rely on `message_text` extraction alone.** Rejected — it works, but leaves the welcome-menu redundancy in place for guests who arrived from the website CTA. The marker eliminates that redundancy AND remains compatible with the extractor.
- **Hide the marker via WhatsApp formatting / invisible characters.** Rejected — WhatsApp does not support invisible characters in compose; any escape would be visible to the guest. The marker stays plain text and accepts that the guest sees `#ORAYA_REF:A0B8CECB` in their chat — short, neutral, and self-evidently a routing tag.
- **Use one marker for both CTAs and disambiguate intent server-side.** Rejected — the change/cancel intent is operator routing, not a server decision. WhatChimp branches to a different downstream path for `#ORAYA_CHANGE:`; folding both into one marker would force the bot to ask the guest "are you changing or viewing?", which defeats the point of having two CTAs.
- **Drop the change/cancel intent context entirely.** Rejected — the prior `bookingWhatsAppChangePrefill` carried the cancel/change intent in prose; losing it would force the bot to ask. Encoding the intent in the marker prefix preserves the routing signal without prose.

**Impact:**

- [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) — `bookingWhatsAppPrefill` returns `#ORAYA_REF:<ref>`; `bookingWhatsAppChangePrefill` returns `#ORAYA_CHANGE:<ref>`. Both helpers are pure string builders; their call sites in `app/booking/view/[token]/page.tsx` (2 sites) and `app/booking-confirmed/page.tsx` (2 sites) need no changes — they pass the same `refDisplay` argument and consume the returned string identically (`encodeURIComponent` → `wa.me/?text=`). Inline doc comments updated.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Website CTA marker routing" section documenting the marker format, the routing contract, the operator manual steps (add two new WhatChimp triggers; keep the welcome trigger intact; do not expose marker syntax in guest-facing copy), and the backend-invariants this change preserves.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — Butler-flow section gains a one-line "Website CTA marker prefill" bullet pointing to the BUTLER_PLAYBOOK section.
- No backend changes. The `/api/butler/identify` contract is unchanged; the existing `message_text` extractor (PR #47) lifts the reference out of the marker via the same `\b[0-9A-Fa-f]{8}\b` regex.
- No schema changes. No new env vars. No new dependencies. No locked-API touches. No payment-file touches. No booking-pipeline, pricing, overlap, auth, token-continuity, secure-handoff, or unrelated-flow changes.
- `tsc --noEmit` clean; `npm run build` clean.

**Reversible?:** yes — single-file revert restores the prior human-sentence prefills. The WhatChimp operator side can keep or remove the new triggers independently; without the marker prefill, the new triggers simply never fire and the existing welcome trigger continues to handle every conversation.

**Supersedes:** none. This decision extends the 2026-05-23 `message_text` entry by making the website-CTA prefill machine-routable, eliminating the welcome-menu redundancy on the website-CTA path. The `message_text` extractor and the orchestrator contract from that entry both carry forward unchanged.

---

## 2026-05-23 - `/api/butler/identify` accepts optional `message_text` with safe word-boundary-anchored booking-reference extraction

**Decision:** `POST /api/butler/identify` accepts an optional `message_text` body field carrying the verbatim inbound WhatsApp turn that triggered the Butler flow. When `booking_reference` is absent from the request body and `message_text` is present, the route extracts the first word-boundary-anchored 8-character hex token via the new pure helper [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts) (`/\b[0-9A-Fa-f]{8}\b/`) and forwards it as `booking_reference` to the orchestrator. Explicit `booking_reference` always wins; `message_text` never overrides it. When `message_text` contains no clean token, behavior is identical to the prior contract — the orchestrator's existing chain still asks the guest for the reference. The orchestrator itself is **unchanged**. The seven refusal/ask `safe_message` strings on the orchestrator's non-success branches receive string-only hospitality copy upgrades; behavior, action enums, sensitive-disclosure rules, and the active-identity composer are all unchanged.

**Reason:** the live website-CTA WhatsApp path opens conversations with text like `"Hello Oraya — booking reference A0B8CECB"`. WhatChimp's Condition / save-to-custom-field primitives can route on substring matches but cannot run a regex capture to lift the 8-character token out of the trigger message into a custom field. The Butler flow therefore reached `/api/butler/identify` with `booking_reference` empty, and the orchestrator correctly fell through to `ask_for_booking_reference` — making the bot redundantly ask the guest for a value they had already provided. A bot-prompt-level workaround was rejected: dropping the entire trigger message into the existing `booking_reference` field and relying on `normalizeBookingReference` would have silently mis-extracted `"Hello Oraya — booking reference A0B8CECB"` as `"EAABEFEE"` because the surrounding English words contain valid hex letters (`e`, `aa`, `b`, `efeece`). The minimal-honest fix is a single additive backend field plus a single bounded-regex helper.

The audit explicitly considered and rejected:

- **Flow-only fix via WhatChimp Condition + custom-field capture.** Rejected — the exported flow's Condition nodes only support `contains` / `equal` operators on system / custom fields. No regex, no capture-group, no substring-extract, no transformation node exists in the available vocabulary. Substring detection is possible (`contains "booking reference"`) and is documented as an optional polish, but the actual hex token cannot be extracted by WhatChimp into a custom field.
- **Naive hex stripping in the existing `normalizeBookingReference` path.** Rejected — `replace(/[^0-9a-fA-F]/g, "")` on the trigger message produces `"eaabefeeceA0B8CECB"` (hex letters from "Hello/Oraya/booking/reference" survive), then `.slice(0, 8)` yields `"EAABEFEE"`, a confidently-wrong reference. Worse than asking twice.
- **Adding `message_text` to the orchestrator's `IdentityInput`.** Rejected — the orchestrator's contract is "decide identity given structured signals." Free-text parsing belongs at the route boundary, not inside the orchestrator. Keeping the extraction in the route also means `/api/butler/confirmed-guest-info` and other identity-using surfaces are not implicitly affected; each surface opts in by accepting and forwarding the derived reference itself if it wants this convenience.
- **Adding a separate `/api/butler/identify-from-message` endpoint.** Rejected — it would duplicate the auth / validation / orchestration shell for a single string transformation. An optional additive field on the existing endpoint is one helper file plus ~10 lines of route code.
- **Widening the extractor to be tolerant of non-word boundaries (e.g. `[A-Fa-f0-9]{8}` anywhere).** Rejected — `\b` is the safety boundary that prevents matching a substring of a longer hex run. `"A0B8CECB1234ABCD"` (which could happen if a guest pastes the full UUID instead of the prefix) does not match because the position after the 8th hex char has no word boundary; that case still falls through cleanly to `ask_for_booking_reference`.

**Hospitality copy upgrade scope** — string-only, no behavior change:

- `ask_for_booking_reference` — softened opener; explains where to find the reference.
- `reference_not_found` — gentler "I'm not finding…" framing; preserves the ask.
- `reference_ambiguous` (escalation) — warmer escalation phrasing.
- `verification_failed` (escalation) — explicit "to keep your booking secure" rationale before handing off.
- `request_identity_proof` — warmer opener; same email-or-name semantics.
- `known_sender_cancelled` — gracious acknowledgement; offers next-step framing.
- `reference_cancelled` — same.

The active-identity `composeActiveIdentitySafeMessage` output (the `verified` and `known_sender_resolved` branches) is left untouched — it already reads warm, and changing it would require co-touching the structured-field consumers.

**Impact:**

- New helper: [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts). Pure function `extractBookingReferenceFromText(text)`. Never throws; returns the uppercased 8-char hex token or `null`. Single regex `/\b[0-9A-Fa-f]{8}\b/`. No Supabase, no env, no side effects.
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — accepts optional `message_text` (capped at 2048 chars). Derives `booking_reference` from it via the helper when the body did not carry an explicit reference. Updated docstring. Wire contract unchanged (503 / 401 / 400 / 200). All existing callers' payloads remain valid and produce identical responses.
- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — seven `safe_message` strings receive hospitality copy upgrades on the refusal / ask / cancellation branches. Behavior, action enums, sensitive-disclosure rules unchanged.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #6 documents the bug + the fix (closed).
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — request-body example updated to include `message_text`; new "Inbound-message convenience" subsection documents the safe extraction rule, the no-naive-stripping invariant, the caller-side invariant, and the two manual WhatChimp operator changes required (HTTP API 7219 body addition + optional early-route Condition).
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — `/api/butler/identify` API-surface table row updated.
- No schema changes. No new env vars. No new dependencies. No locked-API touches. No payment-file touches. No booking-creation, pricing, overlap, schema, auth, token-continuity, secure-handoff, or unrelated-flow changes.
- `tsc --noEmit` clean; `npm run build` clean.

**Reversible?:** yes. Revert the new helper file + the route changes + the orchestrator string changes + the four doc edits; the endpoint returns to its prior contract. No data migrated. No tokens minted that need invalidation. Existing WhatChimp wiring (without the `message_text` body addition) continues to work unchanged.

**Supersedes:** none. This decision extends the 2026-05-22 "WhatsApp identity v2" entry by adding a safe inbound-message convenience field; the priority order, request-body shape, identity-proof comparison set, and 503/401/400/200 contract from that entry all carry forward unchanged.

---

## 2026-05-22 - Credit Libanais provider compatibility is widened at the schema boundary while the adapter stays placeholder-only

**Decision:** Oraya now treats `credit_libanais` as a first-class persisted `bookings.payment_link_provider` value, but the Credit Libanais / MPGS adapter remains an explicit placeholder until the bank delivers the real hosted-checkout contract. The additive migration `sql/phase-16b4-credit-libanais-provider-compat.sql` is the human-gated schema-compatibility step that widens the `payment_link_provider` allow-list to `manual | whish | stripe | credit_libanais` and keeps `stripe` only for backward-compatible dev/test rows. Runtime readiness must report four things clearly: whether the selected provider is configured, whether it is actually implemented vs placeholder-only, a guest-safe setup message, and an admin-facing missing-requirements list that never exposes raw secret values. `/admin/settings` is now the operator surface for that non-secret readiness state, while credentials remain env-only.

**Reason:** after the provider refactor, the code correctly selected Credit Libanais as the only approved production provider, but two readiness gaps remained. First, the database constraint still prevented persisting `credit_libanais` in `bookings.payment_link_provider`, which would have forced another refactor the moment the bank contract arrived. Second, the runtime only reported a coarse guest-safe `online_checkout_ready` boolean/message, which was not enough for operators to tell the difference between "envs missing", "placeholder adapter", and "real bank contract still pending". Widening the persisted provider allow-list now and adding explicit non-secret readiness reporting keeps the codebase ready for the bank specs without faking checkout or leaking secrets.

**Impact:**

- New human-gated migration: [sql/phase-16b4-credit-libanais-provider-compat.sql](../../sql/phase-16b4-credit-libanais-provider-compat.sql). Idempotent; safe to re-run; not auto-applied. Recreates the `bookings.payment_link_provider` check constraint to include `credit_libanais` while preserving `manual`, `whish`, and `stripe` for backward compatibility. No other payment fields are changed.
- [lib/payments/provider.ts](../../lib/payments/provider.ts) now treats `credit_libanais` as a valid persisted provider and adds a shared readiness contract for hosted-checkout adapters.
- [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) now models the exact placeholder contract the real implementation must satisfy: merchant id, gateway URL, session-creation endpoint, auth/signing method, callback verification method, provider session id field, currency/settlement behavior, and sandbox/live mode. It still never fakes a successful checkout or webhook.
- [lib/payments/runtime.ts](../../lib/payments/runtime.ts) now separates guest-safe public readiness from admin-safe readiness, and [app/api/payments/readiness/route.ts](../../app/api/payments/readiness/route.ts) exposes the latter only behind admin auth.
- [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx) and [components/admin/PaymentSettingsSection.tsx](../../components/admin/PaymentSettingsSection.tsx) now show the non-secret provider readiness summary and missing-requirements list directly in the payment settings UI. Secrets remain env-only and are never written to Supabase.

**Reversible?:** yes. The migration can be superseded by a later constraint rewrite, and the readiness route/UI can be reverted without touching booking creation, pricing, overlap protection, or Butler surfaces. The one thing that should not be reversed casually is the "no secret values in DB or readiness responses" boundary.

**Supersedes:** refines the 2026-05-22 entry "Hosted payment execution is provider-agnostic; Credit Libanais / MPGS is the production target" by completing the provider-schema compatibility step and locking the non-secret readiness contract needed before the bank specs land.

---

## 2026-05-22 - Guest-facing payment behavior is now settings-driven before Credit Libanais execution goes live

**Decision:** until the real Credit Libanais / MPGS contract is implemented, Oraya's website payment behavior is controlled by guest-safe admin settings rather than hardcoded Step 3 assumptions. `/admin/settings` now owns the public payment mode (`request_only`, `manual_payment`, `online_payment`, `hybrid`), minimum deposit percentage, whether full payment and custom deposit are offered, guest-visible manual payment rails, guest payment instructions, provider display name, and whether online payment is enabled guest-side. `/book` Step 3 must present two Reserve choices: `Pay now and reserve` and `Submit booking request and pay later`. If the configured hosted-checkout provider is not truly ready, the pay-now path is blocked in the UI with clear setup messaging rather than pretending checkout is live or falling into a server error.

**Reason:** the business direction moved from "payments paused" to "payment infrastructure active, real bank execution pending official specs." That created a UX gap: Step 3 needed to stay premium and decision-oriented without implying that Credit Libanais already works. A settings-driven layer lets operations control the guest story safely while preserving the booking-first architecture and keeping gateway secrets out of the database.

**Impact:**

- New helper: [lib/payments/settings.ts](../../lib/payments/settings.ts) - parses, serializes, and normalizes guest-safe payment settings stored in the existing `settings` key/value table.
- [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx) and [components/admin/PaymentSettingsSection.tsx](../../components/admin/PaymentSettingsSection.tsx) now expose payment configuration to admins without storing gateway secrets in Supabase.
- [app/api/settings/route.ts](../../app/api/settings/route.ts) now publishes a guest-safe payment settings payload plus derived runtime readiness fields for `/book`.
- [app/book/page.tsx](../../app/book/page.tsx) Step 3 now renders the two-path Reserve decision screen. The pay-now path reuses the existing hosted-checkout amount validation, but is disabled in the UI when the configured provider is not ready. The pay-later path records payment preference and follow-up rail as booking-request context only; no charge is collected on the website in that path.
- [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) now enforces the admin-configured payment mode, full/deposit availability, and minimum deposit percentage server-side before creating any hosted checkout session.
- Gateway secrets remain env-only. The existing `settings` table stores public instructions and guest-facing behavior only.

**Reversible?:** yes. The settings-driven layer can be revised or narrowed later without touching the locked booking pipeline, as long as payment execution stays booking-first and no secrets move into the database.

**Supersedes:** refines the 2026-05-22 hosted-payment provider refactor by moving guest-facing Step 3 behavior under admin-controlled settings until the real bank contract is implemented.

---

## 2026-05-22 - Butler identity response enriched with booking reference, villa, stay dates, and a signed booking-view URL on identity-established branches

**Decision:** `POST /api/butler/identify` now surfaces a `booking_view_url` field on every response, and the orchestrator's `safe_message` is pre-enriched with the booking reference, villa name, stay dates (`D MMM YYYY → D MMM YYYY`), and the same signed `/booking/view/[token]` URL on the two branches where identity has already been established for an active booking — explicit `verified` (proof match on email or full name) and implicit `known_sender_resolved` (subscriber-id or phone continuity). On every other branch — `request_identity_proof`, `ask_for_booking_reference`, `ask_for_alternative_identifier`, `reference_not_found`, `reference_ambiguous`, `reference_cancelled`, `known_sender_cancelled`, `verification_failed`, and any `escalate_human` outcome — `booking_view_url` is explicitly `null` and the `safe_message` stays at its previous conservative phrasing.

The URL itself is minted by a new helper, [lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts) (`buildButlerBookingViewUrl`), which reuses the existing `createActionToken(bookingId, "view")` and `NEXT_PUBLIC_SITE_URL || SITE_URL` chain already in use by the transactional email senders. It defaults to the 72-hour TTL baked into `createActionToken` (no `expiresAt` override) so past-checkout bookings remain viewable for the duration of the current support exchange, and a fresh URL is minted on every orchestrator call so the link does not need to outlive the conversation. Missing `BOOKING_ACTION_SECRET` is treated as a soft failure: the helper logs once and returns `null`, the orchestrator surfaces `booking_view_url: null`, and the bot must not synthesize a substitute link.

**Reason:** before this change, the Butler's identity surface returned only the structured booking_id / reference / status / villa / dates. WhatChimp had no way to hand the guest a credentialed "view your booking" link inside the same WhatsApp turn — the guest either had to scroll up to the original confirmation email or the operator had to copy the link manually from `/admin/leads`. The signed view URL is exactly the same credential the existing pending / confirmed / payment / event-proposal emails already deliver, so reusing it on the Butler surface introduces no new attack surface, no new schema, no new TTL semantics, and no new secret. The enriched `safe_message` is a UX win on top: a single sentence the bot can echo verbatim already carries the four pieces of context the guest most often asks about ("what booking, where, when, can I see it?"), which trims the typical multi-turn ping-pong on returning conversations.

The audit explicitly considered and rejected:

- **Surfacing the URL on every successful resolution.** Rejected — on `known_sender_cancelled` and `reference_cancelled`, the orchestrator's existing sensitive-disclosure rule already withholds villa / dates because the booking is no longer actionable; a freshly minted view URL would expose those same fields indirectly through the booking-view page. Keeping the URL `null` on every cancelled branch preserves the spirit of "do not surface villa / dates on cancelled."
- **Surfacing the URL on `request_identity_proof`.** Rejected — the guest is holding only the public 8-character reference (32 bits of entropy, printed in confirmation emails and recoverable by anyone with email access). Minting a signed view URL at that stage would let the public reference bypass the identity-proof gate that exists for precisely this case.
- **Binding the URL TTL to `checkOutExpiryUnix(booking.check_out)` like the transactional email senders.** Rejected — past-checkout bookings would receive an already-expired token, so the Butler couldn't help a guest looking up a past stay for receipts / records. The default 72h TTL is the right window for an in-conversation link, and a re-call mints a fresh URL.
- **Pulling `BOOKING_ACTION_SECRET` into the identity-route's auth contract (503 if missing).** Rejected — the identity surface still has useful work to do even when the view link cannot be minted (reference lookup, identity proof gating, escalation routing). Failing closed on a missing secret would degrade the WhatsApp experience for an unrelated reason; the soft-fail to `booking_view_url: null` is the correct posture.
- **Adding the URL to the booking-lookup surface (`/api/butler/booking-lookup`).** Out of scope for this change; that surface is reference-only and intentionally does not return sensitive fields. Future work can mirror the gating model if needed.

**Impact:**

- [lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts) — new helper. `buildButlerBookingViewUrl(bookingId)` returns the signed URL or `null` (never throws). Reuses [lib/booking-action-token.ts](../../lib/booking-action-token.ts) `createActionToken` and [lib/brand.ts](../../lib/brand.ts) `SITE_URL`.
- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — `IdentityResult` gains `booking_view_url: string | null`. Every existing result literal sets the new field (null on every unverified / cancelled / not-found / ambiguous / escalation / proof-request branch). The two `reply_with_status` returns (`verified` and `known_sender_resolved` with active status) call the helper, and the new `composeActiveIdentitySafeMessage` helper composes the enriched safe_message with graceful degradation when any field is missing. Date formatting is done by a local `formatStayDateLabel` that mirrors the booking-view page's `fmtDate` (no JS Date parsing, no Date object — per the standing time/date discipline rule).
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — header docstring updated to enumerate the response shape including `booking_view_url`, clarify the sensitive-disclosure rule now covers the URL, and note the "no synthesized substitute link when null" requirement. Wire contract (503 / 401 / 400 / 200) and request body shape are unchanged.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — bot-facing action table extended with the URL usage on `reply_with_status` and the explicit no-URL-on-cancelled rule. New "Enriched safe_message behavior" subsection documents the composer's fields and degradation. New "Location and access safety boundary" subsection makes it explicit that the view URL is NOT a smart-lock PIN, exact address, payment link, or admin-data surface. Sensitive-disclosure rule extended to cover `booking_view_url`. "Sensitive fields the orchestrator NEVER returns" paragraph now records the signed view URL as the single intentional exception, gated on the established-identity branches only.
- No schema changes. No new env vars (the helper reuses the existing `BOOKING_ACTION_SECRET` and `NEXT_PUBLIC_SITE_URL`). No new dependencies. No locked-API touches.

**Reversible?:** yes. Revert the three TS files + the two doc files; the prior orchestrator response shape returns. No data migrated, no tokens minted that need invalidation (the issued view tokens are stateless HMAC over `bookingId + "view" + exp + jti` — they age out on their own 72h TTL).

**Supersedes:** none. This decision extends today's earlier "WhatsApp identity v2" entry by adding the booking-view URL surfacing rule; the priority order, request body shape, identity-proof comparison set, and 503/401/400/200 contract from that entry all carry forward unchanged.

---

## 2026-05-22 - WhatsApp identity v2: WhatChimp subscriber_id becomes primary continuity key; identity_proof accepts email OR full name; flow JSON ships placeholder-free

> **Reconciliation note (added 2026-06-03):** the original commit that landed these 2026-05-22 entries left two heading lines stacked above the "Hosted payment execution is provider-agnostic" body, and re-titled what is now the lower 2026-05-22 entry ("Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout") as a duplicate carrier for the "WhatsApp identity v2" body. The bodies are factually correct and in chronological order; only the header/body pairing got shuffled. To preserve append-only history without rewriting the original prose, the headings are left in place and this note documents the mismatch:
>
> - The body immediately under the "Hosted payment execution is provider-agnostic" heading below belongs to **that** decision (provider-agnostic hosted checkout, Credit Libanais production target).
> - The body under the later "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" heading describes **the WhatsApp identity v2** work (subscriber_id primary key, email-or-name identity proof, placeholder-free flow JSON).
> - "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" remains historically accurate as the precursor decision that the same-day "provider-agnostic" entry supersedes - both are kept for traceability.
>
> Subsequent decisions (2026-05-23 onward) reference the v2 identity body by the "WhatsApp identity v2" heading; the supersession-tracking still works because the body content is unambiguous.

## 2026-05-22 - Hosted payment execution is provider-agnostic; Credit Libanais / MPGS is the production target

**Decision:** Oraya's hosted-payment architecture remains booking-first and webhook-first, but production is no longer assumed to be Stripe. `POST /api/payments/checkout` now resolves a provider-agnostic hosted-checkout adapter selected by `PAYMENT_PROVIDER`, and `POST /api/payments/webhook/[provider]` is the generic callback surface. Credit Libanais / MPGS is the production target provider for settlement into a Fresh USD account in Lebanon. In production, provider selection must be explicit and must be `credit_libanais`: if `PAYMENT_PROVIDER` is missing or set to any other value, checkout fails closed with a configuration error. Outside production, the runtime may default to Stripe so local/dev can still exercise the hosted checkout flow intentionally.

**Reason:** the operating setup is Lebanese bank settlement, not Stripe as merchant of record. The website still must never collect card data directly, and the booking pipeline still must stay authoritative for overlap protection, pricing, add-on rules, email triggers, and signed booking-view links. A provider-agnostic adapter boundary lets Oraya preserve the premium hosted checkout UX and lifecycle fields without baking Stripe into the architecture or pretending the bank contract is already known.

**Impact:**

- [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) now resolves the configured hosted-checkout adapter instead of importing Stripe directly. Booking validation, signed booking-token verification, and server-side deposit/full amount validation remain unchanged.
- [lib/payments/provider.ts](../../lib/payments/provider.ts) now distinguishes runtime provider keys from the persisted `payment_link_provider` allow-list, and exports the generic hosted-checkout adapter contract:
  - `createCheckoutSession`
  - `verifyWebhook`
  - `mapProviderEventToBookingUpdate`
- New runtime helpers:
  - [lib/payments/runtime.ts](../../lib/payments/runtime.ts) - provider registry keyed by `PAYMENT_PROVIDER`
  - [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - explicit non-faking placeholder adapter that lists the bank details still required
  - [lib/payments/webhook-handler.ts](../../lib/payments/webhook-handler.ts) - generic callback application logic
- New callback route:
  - [app/api/payments/webhook/[provider]/route.ts](../../app/api/payments/webhook/%5Bprovider%5D/route.ts) - generic hosted-payment callback surface
  - [app/api/payments/webhook/stripe/route.ts](../../app/api/payments/webhook/stripe/route.ts) - compatibility shim for the optional Stripe adapter
- [app/book/page.tsx](../../app/book/page.tsx) no longer hardcodes Stripe in Step 3 copy; guest messaging stays provider-neutral and hosted-checkout-only.
- Environment contract changes:
  - `PAYMENT_PROVIDER=credit_libanais` is the only approved production setting
  - production no longer silently falls back to Stripe when `PAYMENT_PROVIDER` is unset
  - production rejects `PAYMENT_PROVIDER=stripe`
  - `CREDIT_LIBANAIS_MERCHANT_ID`
  - `CREDIT_LIBANAIS_SECRET`
  - `CREDIT_LIBANAIS_GATEWAY_URL`
  - `CREDIT_LIBANAIS_WEBHOOK_SECRET`
  - Stripe envs remain optional for local/dev testing only
- Important schema compatibility note: the current `bookings.payment_link_provider` allow-list is still the older `manual | whish | stripe` floor. The Credit Libanais adapter therefore remains a placeholder and must not write fake provider state until a later explicit schema-compatibility step is approved.

**Reversible?:** yes, but only with a superseding entry that preserves the locked `/api/bookings` authority, server-side amount validation, and verified callback truth.

**Supersedes:** refines the 2026-05-22 "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" entry by removing Stripe as the production assumption while preserving the same hosted-checkout execution model.

---

## 2026-05-22 - Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout

**Decision:** the WhatsApp identity orchestration surface from earlier today is revised to fit WhatChimp's actual variable set and to support bookings with no email on file.

Concrete changes:

- The primary continuity key becomes **WhatChimp `subscriber_id`**, looked up against a new `whatsapp_leads.whatsapp_subscriber_id` column. The earlier phone-keyed lookup remains but is demoted to "future channels only" — WhatChimp does NOT expose the sender phone as a variable, so the original design could never auto-resume a returning WhatChimp conversation on its own.
- A diagnostic-only `whatsapp_chat_id` column is added alongside. The orchestrator never queries it; it is captured purely for ops correlation between WhatChimp logs and `whatsapp_leads` rows. No index.
- The identity-proof field is renamed `identity_proof` (was `identity_proof_email`) and now accepts **the email OR the full name** used on the booking. Comparison is exact-after-normalization (lowercased, trimmed, internal whitespace collapsed to single spaces) against `bookings.guest_email`, `bookings.guest_name`, and (when the booking is linked to a member) the member's `auth.users.email` and `members.full_name`. Substring / fuzzy / startsWith matching is intentionally rejected for v1 to prevent name-prefix leakage (e.g. "John" matching every John).
- The new priority order is **subscriber_id → phone → reference + identity_proof gate → human escalation**.
- The WhatChimp flow JSON ships as [whatsapp-bot_guest-identification_v2.json](../../) **placeholder-free**: all WhatChimp ids (HTTP API id, custom field ids, label ids) are empty strings or empty arrays while the human-readable names live in the parallel `*_SelectedOptionText` / `*TextsArray` fields. Matches the user's own re-export pattern from `whatsapp-bot_1857205_*`. Operator wires the ids via the WhatChimp UI after import.
- The legacy `identity_proof_email` field on `POST /api/butler/identify` is accepted as a transitional alias while the v1 flow is migrated. The route prefers `identity_proof` when both are present.

**Schema impact:** new additive migration [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) (NOT auto-applied; idempotent; reversible) adds the two nullable text columns and indexes `whatsapp_subscriber_id` only. Backend degrades gracefully when the migration is not yet applied: the orchestrator detects PostgREST error `42703` (undefined_column) on the subscriber-id path and falls through silently, the ingest route (`POST /api/butler/lead`) retries inserts without the new fields, and both admin lead routes fall back to a base column list.

**Reason:** the v1 design assumed `{{contact.phone}}` would be available on the WhatChimp channel; verification of WhatChimp's actual variable set proved that wrong (only `#LEAD_USER_*#` hashtag variables, no sender phone). Without a stable continuity key the orchestrator could never auto-resume a returning guest in production — every WhatsApp turn would have fallen straight to the reference + identity-proof gate. The subscriber-id path restores the intended UX. Accepting full name as identity proof closes the second real gap: many bookings do not have an email captured (early phases collected name + phone only), so email-only proof would have left the human-escalation arm as the only resolution path for those guests.

The audit explicitly considered and rejected:

- **Substring or startsWith matching on names.** Rejected — a guest named "John Smith" typing "John" would have verified against every other John in the database. Exact-after-normalization is the right safety/usability trade for v1.
- **Two separate proof fields (`identity_proof_email`, `identity_proof_name`).** Rejected — forces the bot to ask the guest which they want to share before they share it, and forces a second WhatChimp custom field. One free-text field that compares against both stores is simpler and equally safe given the exact-match rule.
- **Indexing `whatsapp_chat_id`.** Rejected — it is not a lookup key. The orchestrator does not query it. Indexing it would be dead weight.
- **Auto-applying the SQL migration.** Rejected per the repo's standing rule that schema changes are operator-applied, never auto-applied, and must be reversible. The graceful degradation in the backend means the migration can be applied at any time without downtime.

**Impact:**

- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — `IdentityInput` gains `subscriber_id`, `chat_id`, `identity_proof`; `phone` retained. `IdentityResult` shape unchanged. New helpers `resolveBookingBySubscriberId`, `verifyIdentityProofMatchesBooking`; the prior `resolveBookingByPhone` / `verifyEmailMatchesBooking` are refactored into a shared lookup. Priority order updated. Safe-message for `request_identity_proof` reworded to "share the email or the full name used on your booking".
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — body now reads `subscriber_id` (cap 128), `chat_id` (cap 128), `phone` (cap 64), `booking_reference` (cap 64), `identity_proof` (cap 320). Legacy `identity_proof_email` accepted as a fallback. Unchanged: auth contract (503/401), 400 on shape errors, 200 on every orchestration outcome.
- [lib/butler/leads.ts](../../lib/butler/leads.ts) — `normalizeLeadInput` picks `subscriber_id` and `chat_id` from a handful of WhatChimp aliases (`oraya_subscriber_id`, `lead_user_subscriber_id`, `subscriber_id`, `whatsapp_subscriber_id`, `whatchimp_subscriber_id`; mirror set for chat). `NormalizedLeadInput` and `WhatsappLeadAdminRow` gain `whatsapp_subscriber_id` / `whatsapp_chat_id` as `string | null`.
- [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) — retries insert without the new columns when Supabase returns `42703`; raw values stay in `raw_payload` regardless.
- [app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts) + [app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts) — `SELECT_COLUMNS_FULL` includes the new fields; both fall back to `SELECT_COLUMNS_BASE` on `42703`.
- [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) — new additive migration. Adds the two columns + the subscriber-id index. Comments document the diagnostic-only intent of `whatsapp_chat_id`.
- [whatsapp-bot_guest-identification_v2.json](../../) (Desktop + `Oraya/`, both `.json` and `.txt`) — replaces the v1 flow. Welcome step unchanged (3 buttons). Identity-proof step rephrased + `emailQuickreply` set to `false` + custom field renamed `oraya_identity_proof_email` → `oraya_identity_proof`. All WhatChimp ids are empty strings; names preserved.
- [ARCHITECTURE.md](ARCHITECTURE.md) WhatsApp identity flow section rewritten for the v2 priority order + schema dependency. [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) identity orchestration section rewritten with the new request body shape, the email-or-name proof rule, the schema dependency, and the booking-request flow gap callout.
- `tsc --noEmit` clean; `npm run build` clean; new `/api/butler/identify` and `/api/butler/booking-lookup` routes confirmed in the build manifest.

**Known gap (intentional, scoped follow-up):** the existing booking-request flow (`whatsapp-bot_1846656_*`) does NOT yet pass `subscriber_id` to `POST /api/butler/lead`. Until that flow is updated separately, new leads created via the booking-request path won't be auto-resumable by subscriber id from WhatChimp — they fall through to the reference + identity-proof gate. The schema and backend already accept the field; only the WhatChimp-side wiring on that other flow is missing. The user's standing instruction is to NOT modify the booking-request flow file in this turn.

**Reversible?:** yes. Backend: revert the three TS files + the two route files + the SQL migration; the prior phone-keyed orchestrator returns. Schema: `drop column if exists whatsapp_subscriber_id`, same for `whatsapp_chat_id`, drop the index. Flow JSON: the v1 file is preserved on Desktop and in the Oraya folder; re-importing it restores the old behavior. No data destroyed (the SQL is additive; the columns are nullable; the rename `identity_proof_email` → `identity_proof` is also accepted as the legacy alias by the route).

**Supersedes:** today's earlier entry "WhatsApp identity orchestration: phone continuity → booking-reference fallback → human escalation, single `/api/butler/identify` endpoint" is updated, not retracted. The endpoint, the orchestrator helper, and the safe-message + sensitive-disclosure contracts all carry forward; only the priority order, the input shape, and the proof comparison set change.

---

## 2026-05-22 - WhatsApp identity orchestration: phone continuity → booking-reference fallback → human escalation, single `/api/butler/identify` endpoint

**Decision:** WhatsApp identity resolution for the Butler is owned server-side by a single stateless orchestrator helper, [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts), and exposed to WhatChimp through one Butler-secret-guarded endpoint, `POST /api/butler/identify`. The bot does not branch on its own; each turn it passes whatever signals it has gathered (`phone`, `booking_reference`, `identity_proof_email`) and receives back a deterministic `recommended_next_action` plus the only `safe_message` the Butler is allowed to echo.

The priority order is locked:

1. **Phone continuity (primary).** Inbound WhatsApp sender phone → `whatsapp_leads.phone` → `linked_booking_id` → `bookings`. When this succeeds, identity is implicit; villa / check_in / check_out / status are returned and the bot composes a status reply (or, for a cancelled booking, an acknowledgement that withholds details).
2. **Booking-reference fallback.** No phone match → bot asks for the 8-character reference. The orchestrator resolves it via [resolveBookingByReference](../../lib/booking-reference.ts). Pending/confirmed matches gate disclosure behind explicit identity verification; cancelled matches return a safe acknowledgement.
3. **Human escalation.** Ambiguous reference, failed identity proof, or any unsafe state hands off to a human; the bot stops auto-replying about the booking and operators pick up from `/admin/leads`.

**Identity verification options recognized today (closed allow-list):**

- Phone continuity (implicit, primary path only).
- Booking email match — case-insensitive comparison against `bookings.guest_email` and (when the booking is linked to a member) the member's `auth.users.email`. Mismatch escalates to human; the bot does not loop on retries.
- Manual escalation — every other case.

**Sensitive-disclosure rule:** `villa`, `check_in`, `check_out` are returned by the orchestrator only when identity is verified. The bot must never echo a cached value for those fields when the current orchestrator response has them null — the orchestrator is the single source of truth per turn.

**Reason:** the Butler must correctly identify a returning guest before disclosing anything stay-specific, but it must also be operationally cheap to use (one call per turn, deterministic output, no client-side policy logic). Centralizing the priority order, the verification gate, and the safe-message strings server-side keeps the WhatChimp configuration trivial and audit-able: the bot reads `recommended_next_action`, calls the next correct primitive, and echoes `safe_message`. It also keeps the security model honest — there is exactly one code path that decides "is this person verified for this booking?" and that code path lives in this repo, not in WhatChimp's AI Training.

The decision explicitly considered and rejected alternatives:

- **Doing the priority logic in WhatChimp AI Training.** Rejected — AI Training is not auditable, drifts silently, and would mean the security model lives in a vendor surface outside the repo. The same argument the 2026-05-12 architecture freeze made about pricing / availability / status applies in full to identity.
- **Storing a per-conversation identity-state column.** Rejected — every signal the orchestrator needs is already on `bookings` or `whatsapp_leads`. Adding a third table would introduce a stateful surface that drifts from the underlying truth (a booking cancelled after a turn was "verified" would silently surface stale state).
- **Multiple specialized endpoints (`/api/butler/lookup-by-phone`, `/api/butler/verify-identity`).** Rejected as scope creep. The single multi-signal endpoint produces the same outcome with less surface, fewer round-trips, and one place to audit the priority order.

**Impact:**

- New file [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts). Single exported async function `orchestrateButlerIdentity(input)` plus the discriminated `IdentityState` / `IdentityAction` types. Always resolves; never throws. Operational errors (Supabase outage, unexpected throw) collapse to the safest "ask for reference" or "escalate human" result, with the error logged server-side.
- New file [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts). Thin HTTP wrapper. Reuses `requireButlerAuth` (503 / 401 contract unchanged). 400 on invalid JSON / body shape / over-length input. 200 on every orchestration outcome, including escalations.
- [ARCHITECTURE.md](ARCHITECTURE.md) API surface table gains `/api/butler/booking-lookup` and `/api/butler/identify`.
- [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) gains a "WhatsApp identity orchestration" section that documents the priority order, the action allow-list, the sensitive-disclosure rule, and the closed identity-verification options list. This is the operational contract WhatChimp configuration must respect.
- **No schema change.** Reuses existing `whatsapp_leads` (phone, linked_booking_id), `bookings` (id, status, villa, check_in, check_out, guest_email, member_id), and `auth.users` (email via service-role).
- **No new env var.** `BUTLER_WEBHOOK_SECRET` already required and already documented in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).
- **No new dependency.** Uses `supabaseAdmin`, `requireButlerAuth`, and the existing `lib/booking-reference.ts`.
- **No locked-surface touch.** `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, the email senders, the auth and token systems, and the existing schema remain untouched.

**Reversible?:** yes — easy. Delete the two new files, revert the ARCHITECTURE.md + BUTLER_PLAYBOOK.md additions, add a superseding entry here. No data persisted; no external consumer locked in (WhatChimp does not call this endpoint until its outbound flow is configured to).

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 Butler architecture freeze (locked namespace + secret), the 2026-05-15 `whatsapp_leads` persistence (provides the phone → booking linkage), the 2026-05-18 lead → booking provenance writer (populates `linked_booking_id`), and the 2026-05-22 booking-reference helper (the fallback identifier this orchestrator resolves).

---

## 2026-05-22 - Guest-facing booking reference formalized as the bookings.id 8-char uppercase prefix; lib/booking-reference.ts owns the contract

**Decision:** the existing 8-character uppercased prefix of `bookings.id` is the single guest-facing booking reference. A new module [lib/booking-reference.ts](../../lib/booking-reference.ts) owns the format / normalize / resolve contract. No parallel identifier system is introduced; no schema change; no migration; no env var.

Public / private boundary is now formal:

- **Public guest-facing identifier** = `formatBookingReference(booking.id)`. Visible in pending / event-inquiry / confirmed / cancelled emails (the `Reference` row in the summary card) and at the top of `/booking/view/[token]`. Safe to quote in support channels. Knowing the reference is **not** proof of identity and never authorizes sensitive disclosure on its own.
- **Private signed credentials** = `createActionToken(...)` in [lib/booking-action-token.ts](../../lib/booking-action-token.ts) and `createPrefillToken(...)` in [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts). These remain the only credentials that authorize sensitive operations. They are never quoted, never asked of the guest in conversation, never interchangeable with the public reference.

Future WhatsApp identity model (planning context — not implemented in this entry):

- **Primary path:** known WhatsApp sender → Butler token continuity / lead-linkage continuity → linked booking → deterministic safe status reply (see [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) §4).
- **Fallback path:** unknown sender / spouse / changed number → ask for the booking reference → `resolveBookingByReference` returns booking_id + non-sensitive context (status, villa, check_in, check_out) → identity verification (phone match, booking email match, manual escalation) MUST run before any sensitive field is exposed.

**Reason:** the 8-char-prefix reference is already shipped and visible in three call sites ([app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx), [lib/send-booking-pending-email.ts](../../lib/send-booking-pending-email.ts), [lib/send-booking-email.ts](../../lib/send-booking-email.ts)) and explicitly named the "public guest-facing support code" in [PROJECT_STATE.md](PROJECT_STATE.md), [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), and [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md). Introducing a second identifier would have meant two reference systems, two migration risks, and a years-long deprecation tail; centralizing the existing one into a named helper achieves every product goal (human-friendly identifier, safe for WhatsApp/support use, future-ready for payment-lookup and arrival-messaging flows) with zero schema or env impact.

The audit explicitly considered and rejected the alternatives:

- A new `bookings.booking_reference` text column. Rejected — duplicates an identifier already derived from the primary key; adds a migration with no observable guest benefit; collision-prevention logic (the only argument for a separate column) is unnecessary at Oraya's booking volume given uuid v4 first-8-hex entropy and is already handled by the `ambiguous` branch of the new resolver.
- A short opaque token (e.g. base32 nanoid) separate from `bookings.id`. Rejected — same migration cost, plus historical bookings would need backfill; the existing reference is already in production emails and the guest already knows it as theirs.

**Impact:**

- New file [lib/booking-reference.ts](../../lib/booking-reference.ts). Three exports: `formatBookingReference(id) -> string | null`, `normalizeBookingReference(value) -> string | null`, `resolveBookingByReference(reference) -> Promise<BookingReferenceResolution>`. Type-and-helper module; no runtime side-effects at import time (the Supabase admin client is already lazy-Proxy-loaded).
- The `resolveBookingByReference` discriminated union returns `not_found` / `ambiguous` / `found`. The `found` variant exposes only `booking_id`, `status`, `villa`, `check_in`, `check_out` — the same fields the guest already sees on `/booking/view/[token]`. Sensitive fields (phone, email, payment ledger, `payment_link_*`, raw payload, admin notes) are never returned by the resolver; identity verification is the caller's job.
- [ARCHITECTURE.md](ARCHITECTURE.md) gains a "Booking identity model" section formalizing the public / private split and documenting the primary / fallback WhatsApp identity flow.
- **No schema, no env, no new dependency, no new route.** The three existing call sites that compute `.slice(0, 8).toUpperCase()` are left untouched (minimal diff; the email senders are listed as locked surfaces in [AGENT_RULES.md](AGENT_RULES.md) §4, so even a no-op refactor was deferred). The helper has no callers in this commit; it is scaffolding for the next WhatsApp / payment-lookup PR.
- `tsc --noEmit` clean. `npm run build` clean.

**Reversible?:** yes — trivially. Delete the new file, revert the ARCHITECTURE.md section, add a superseding entry here. No data persisted; no external consumer locked in.

**Supersedes:** does not supersede a prior decision. Formalizes a convention that has been informally documented across [PROJECT_STATE.md](PROJECT_STATE.md), [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), and [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) since Phase 16A but had no central code module.

---

## 2026-05-18 - Phase 16B.1 architecture freeze: payment link columns + provider abstraction

**Decision:** Phase 16B.1 is closed as the **architecture / scaffold step**. The following choices are locked before any Phase 16B.2+ implementation code lands:

1. **Schema shape.** One live payment link per booking, modeled as **additive nullable columns** on `bookings`, **not** a separate `payment_links` history table. The columns are: `payment_link_url`, `payment_link_provider`, `payment_link_expires_at`, `payment_link_issued_at`, `payment_link_status`, `payment_provider_session_id`. The SQL is recorded in [/sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql) and is **NOT applied in this commit** - it is human-gated and runs in the Supabase SQL editor at the start of Phase 16B.2.
2. **Status allow-list (locked v1):** `null` / `none` / `active` / `paid` / `expired` / `cancelled` / `failed`. Enforced by a `check` constraint that permits `null` so the locked `/api/bookings` POST insert path keeps writing booking rows with no payment-link columns set.
3. **Provider allow-list (locked v1 floor):** `manual` / `whish` / `stripe`. Enforced by a `check` constraint that permits `null`. `manual` and `whish` are the v1 floor (admin-driven, no external API today). `stripe` is reserved for the Phase 16B.5+ programmatic path; reserving the value now avoids a constraint migration when Stripe lands.
4. **Provider interface.** [lib/payments/provider.ts](../../lib/payments/provider.ts) declares the `PaymentProvider` interface plus the `PaymentLinkStatus` / `PaymentLinkProvider` / `PaymentCurrency` / `PaymentLinkPurpose` allow-lists, type guards, and `PaymentProviderEvent` / `PaymentBookingDelta` shapes. The file is **type-only** - no runtime, no Supabase imports, no SDK dependencies - so it can be safely added now without committing to any vendor. Concrete adapters (`manual.ts`, `whish.ts`, `stripe.ts`) land in 16B.3+.
5. **WhatsApp payment-reply branching contract.** [PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) section 4 is the deterministic mapping from `(bookings.status, payment_link_status, payment_status, refund_status)` to a single response string. The Butler is allowed to echo **only** those strings. The implementation lands in 16B.5 (`lib/payments/whatsapp-reply.ts` + `POST /api/butler/payment-status`).
6. **Currency discipline.** Every provider-interface method that touches money requires explicit currency (`USD` or `LBP`). No implicit currency. The Lebanese-market USD/LBP split makes this a correctness requirement, not just a hygiene preference.
7. **Idempotency anchor.** `payment_provider_session_id` is the single key the webhook handler uses to locate the booking and decide whether a delivered event is a duplicate. Every PATCH triggered by a webhook MUST be guarded by `eq("payment_provider_session_id", session_id)` plus an early-return when the resulting delta would be a no-op.
8. **Locked `/api/bookings` POST stays untouched.** Payment columns default to null on insert. There is **no** booking-creation behavior change in Phase 16B. The booking pipeline (overlap, pricing, addon-audit, email triggers, view-token issuance) remains the authoritative source of truth for stay state.

**Reason:** the schema-vs-table choice, the provider list, and the WhatsApp branching contract are the three architecture questions [PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) section 8.16B.1 marked as the approval gate before any payment code lands. Locking them now means 16B.2 (apply the migration + extend admin route allow-lists) and 16B.3 (admin payment UI + manual + Whish adapters) can each be a minimal, mechanical PR with no architectural debate. Picking `manual + whish` as the v1 provider floor (with `stripe` reserved but unimplemented) avoids both extremes: we are not locked into a single vendor, and we are not paying the cost of a full Stripe integration up front for a market that today settles primarily on Whish + cash + bank transfer.

Additive columns over a `payment_links` history table is justified because:

- One live link per booking is sufficient for the Whish "admin pastes a link" workflow and for the Stripe "session per booking" workflow.
- The admin diff helpers ([lib/admin-booking-diff.ts](../../lib/admin-booking-diff.ts)) and the admin data fetch ([app/api/admin/data/route.ts](../../app/api/admin/data/route.ts)) already enumerate `bookings.payment_*` columns one-by-one; continuing the convention keeps those surfaces ergonomic and avoids a per-booking join.
- Historical link-issuance audit (if ever needed) can be reconstructed from the existing webhook event logs or added in 16B.6 as a separate `payment_event_log` table without touching the per-booking shape.

**Impact:**

- New file: [/sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql). Additive `add column if not exists`, idempotent constraint drop-and-recreate, partial index on `(payment_link_expires_at) where payment_link_status = 'active'`, column comments. **NOT applied in this commit.** Phase 16B.2 kickoff applies it.
- New file: [/lib/payments/provider.ts](../../lib/payments/provider.ts). Type-only. No runtime behavior, no imports beyond TypeScript's standard library, no Supabase, no SDK. Exports `PAYMENT_LINK_STATUSES`, `PAYMENT_LINK_PROVIDERS`, `PAYMENT_CURRENCIES`, `PAYMENT_LINK_PURPOSES` const arrays plus matching types + type guards, the `CreatePaymentLinkInput` / `CreatePaymentLinkResult` shapes, the `PaymentProviderEvent` / `PaymentBookingDelta` shapes, and the `PaymentProvider` interface.
- [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) - section 8.16B.1 marked complete; scaffold file paths added.
- **No existing file modified beyond the doc.** No locked route touched. No schema applied. No env var consumed. `npx tsc --noEmit` clean. `npm run build` clean.

**Reversible?:** yes - trivially. To reverse this scaffold: delete both new files, revert the section 8.16B.1 status update in PHASE_16B_PLAN.md, and add a superseding entry here. No data has been migrated; no runtime path imports the provider types yet.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-18 prefill-handoff and provenance-linkage decisions below by adding the payment-state layer Phase 16B needs. Locks the schema-vs-table, provider-list, and WhatsApp-branching choices PHASE_16B_PLAN.md section 8.16B.1 deferred.

---

## 2026-05-18 - Phase 16A Butler ops closeout keeps WhatsApp as lead capture + website continuation, not booking submission

**Decision:** operational documentation for Phase 16A is aligned to the shipped architecture: WhatChimp / WhatsApp captures lead intent, calls `POST /api/butler/lead`, uses the returned `prefill_url` when present, and continues the guest into Oraya's existing `/book` flow. WhatsApp is **not** the authoritative booking submission surface in the current approved model, and Butler messaging must not imply payment collection, refund handling, or access/PIN delivery.

**Reason:** the shipped code now supports secure website continuation, guest/member gate persistence, continuation readiness, and best-effort `whatsapp_leads.linked_booking_id` back-linking after booking creation. Several docs still framed 16A around a planned `/api/butler/flow-submit` adapter or implied broader Butler capabilities than production actually has. That drift creates operational risk: humans may misconfigure WhatChimp, promise payment behavior that belongs to 16B, or rotate Butler secrets without coordinating Vercel and WhatChimp.

**Impact:**

- [CURRENT_PHASE.md](CURRENT_PHASE.md) now reflects the shipped Phase 16A state and frames the remaining work as ops closeout alongside the newer Phase 16B provisioning context.
- [PROJECT_STATE.md](PROJECT_STATE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) now describe the live Butler/WhatChimp continuation flow more explicitly.
- [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) now hardens:
  - human escalation routing
  - WhatChimp prompt guidance for `prefill_url`
  - explicit "no payment promises in 16A" language
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) now includes a Butler secret rotation checklist covering Vercel + WhatChimp coordination and token invalidation expectations.

**Reversible?:** yes. The docs can be revised again when a future approved architecture changes the WhatsApp booking boundary.

**Supersedes:** refines the operational interpretation of the 2026-05-12 Butler architecture freeze and the 2026-05-18 prefill-handoff decision without changing the underlying code contracts.

---

## 2026-05-18 - WhatsApp lead -> booking provenance linkage in `/api/bookings` POST

**Decision:** the locked `/api/bookings` POST handler now accepts an optional `butler_prefill_token` in the request body. After a successful booking insert, the handler best-effort verifies the token with `verifyPrefillToken` from [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) and, on success, updates `whatsapp_leads.linked_booking_id` with the new booking's id. The update uses an `.is("linked_booking_id", null)` race guard so an existing linkage is never overwritten. Every failure mode - missing/empty token, signature mismatch, expired token, missing lead, conflicting prior linkage, Supabase error - logs a server-side warning and returns early; **none of them block booking creation**.

**Reason:** Phase 16A's `/api/butler/lead` and `/api/butler/prefill` close the WhatsApp -> website hand-off direction, but until this decision there was no return path: a guest who clicked the prefill URL, completed the booking form, and submitted produced a booking row that was not linkable to the original lead in `/admin/leads`. Operators triaging from `/admin/leads` therefore could not see which leads converted. The lead -> booking provenance loop is the operational backbone Phase 16B's payment / WhatsApp lookup flow needs (to answer "what booking are we talking about?" deterministically when a guest replies on WhatsApp). The decision keeps the linkage non-authoritative - the booking, not the lead, remains the source of truth for stay state - and treats the link as a best-effort enrichment so the locked booking pipeline is never destabilized by Butler-side configuration drift (e.g. a rotated `BUTLER_PREFILL_SECRET`).

**Impact:**

- [app/api/bookings/route.ts](../../app/api/bookings/route.ts) now reads `butler_prefill_token` from the JSON body and, after the booking insert succeeds, calls a new internal `linkBookingToButlerLead` helper. The helper:
  - Returns silently if the token is missing, not a string, or empty.
  - Returns silently with a `console.warn` if `verifyPrefillToken` fails (invalid or expired).
  - Looks up the lead row by `lead_id`; warns + returns if the lead is missing.
  - No-ops if the lead is already linked to this same booking.
  - Warns + returns (without overwriting) if the lead is linked to a different booking.
  - Otherwise issues an atomic update guarded by `.is("linked_booking_id", null)` so concurrent submissions cannot stomp on each other.
- [app/book/page.tsx](../../app/book/page.tsx) stores the original `?h=...` handoff token in `sessionStorage` only after a successful prefill round-trip, sends the stored token as `butler_prefill_token` in the booking POST body, and clears it from `sessionStorage` after the booking view-token redirect.
- No new env var. `BUTLER_PREFILL_SECRET` (introduced 2026-05-18 in the prefill-handoff decision below) is now also consumed by `/api/bookings` via `verifyPrefillToken`. If the env is unset, verification cleanly returns `{ ok: false, reason: "invalid" }`, the warning is logged, and the booking proceeds - there is **no failure path that blocks booking creation**.
- **No schema changes.** The `whatsapp_leads.linked_booking_id` column already existed from the 2026-05-15 entry below; this decision adds a writer (the booking pipeline) on top of the existing 16A.2.e admin-PATCH writer.
- **No locked booking-creation logic changed.** Pricing, overlap protection, addon audit, email triggers, view-token issuance, and the API response shape are all untouched. The new linkage helper runs after the insert and after the booking response is computed.
- Docs: [CURRENT_PHASE.md](CURRENT_PHASE.md) "Just completed" entry added; [ARCHITECTURE.md](ARCHITECTURE.md) Butler flow section gains a line about the provenance writer; this entry is the durable record.

**Reversible?:** yes - easy. To reverse: drop the `butler_prefill_token` destructure, drop the `linkBookingToButlerLead` call site + helper, drop the `verifyPrefillToken` import, revert the three `app/book/page.tsx` storage helpers + their two call sites, and add a superseding entry here. No data corruption risk on reversal - the only persisted side-effect is the `linked_booking_id` enrichment, which is informational.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-18 prefill-handoff decision below (which introduced the token + lead row plumbing) by adding the lead -> booking return-path writer.

---

## 2026-05-18 - WhatsApp lead capture may mint an additive opaque `/book` prefill handoff

**Decision:** keep `whatsapp_leads` as the source of truth for WhatsApp-originated booking intent and add a short-lived opaque prefill handoff on top of it. `POST /api/butler/lead` may now return an additive `prefill_url` that points at `/book?h=<opaque-token>`, where `h` is signed only with `BUTLER_PREFILL_SECRET`. A new public `GET /api/butler/prefill?h=...` verifies the token, loads the lead row, and returns a strict safe-field allow-list only: `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `full_name`, `source`.

**Reason:** the website handoff must let the guest continue without retyping information, but raw booking intent and PII must not appear in public query params. At the same time, lead capture is business-critical and must not fail solely because token issuance is unavailable. The additive handoff preserves both constraints: `whatsapp_leads` stays authoritative, the URL carries only an opaque token, and missing `BUTLER_PREFILL_SECRET` degrades gracefully by omitting `prefill_url` while still persisting the lead.

**Impact:**

- New helper: [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) - HMAC-SHA256 signed opaque token with `{ lead_id, exp, jti, v:1, purpose:"prefill" }`, 2-hour TTL, timing-safe signature compare.
- New route: [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts) - public GET endpoint, token-auth only, `Cache-Control: no-store`, 400 invalid token, 410 expired/missing lead, 500 safe server error.
- [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) now attempts to issue `prefill_url` after successful insert, but catches token/config errors so lead capture still succeeds with the existing `{ ok, lead_id, message }` contract intact plus additive `prefill_url: null`.
- [app/book/page.tsx](../../app/book/page.tsx) now hydrates safe fields from `/api/butler/prefill?h=...`, uses only normalized date-only strings for date prefill, and strips `h` from the URL after success or failure so the page continues to work normally when prefill is unavailable.
- [lib/butler/leads.ts](../../lib/butler/leads.ts) now accepts WhatChimp-style normalized aliases `oraya_check_in` / `oraya_check_out` in addition to `normalized_check_in` / `normalized_check_out`, and drops reversed normalized ranges instead of persisting them for prefill.
- New env var: `BUTLER_PREFILL_SECRET`. Distinct from `BUTLER_WEBHOOK_SECRET`.
- **No schema changes.** `whatsapp_leads` shape is unchanged. No locked API touched. No raw WhatsApp text is used for `/book` hydration.

**Reversible?:** yes. Remove the new helper + route, remove the additive `prefill_url` behavior from the lead route, remove the `/book?h=...` hydration effect, delete the env-doc references, and add a superseding entry here.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-15 `whatsapp_leads` persistence decision by adding a non-authoritative website handoff layer without changing the table or the booking pipeline.

---

## 2026-05-15 - WhatsApp leads are persisted in `whatsapp_leads` before booking creation

**Decision:** WhatsApp / WhatChimp lead intake is persisted in a new operational Supabase table `whatsapp_leads` and surfaced through a new admin dashboard at `/admin/leads`. A new `POST /api/butler/lead` is the only writer; new `GET /api/admin/leads` and `PATCH /api/admin/leads/[id]` are the only readers/mutators. The lead is **not** a booking, and writing a lead does **not** create a booking row, hold dates, check availability, send email, issue a token, or trigger payment.

The Butler ingest reuses the existing 2026-05-12 Butler auth contract (`requireButlerAuth`, `X-Butler-Secret`, `BUTLER_WEBHOOK_SECRET`). The admin routes reuse the existing `requireAdminAuth` cookie/bearer contract from [lib/admin-auth.ts](../../lib/admin-auth.ts) - neither auth helper is modified.

**Reason:** WhatsApp conversations are not authoritative bookings. WhatChimp's labels and custom fields are vendor-internal, ephemeral, and not auditable from Oraya. Without an Oraya-owned table, the operator has no durable record of who reached out, what they wanted, or whether anyone followed up - and the locked `/api/bookings` POST pipeline cannot be the right home, since most leads will never become bookings (questions, lost opportunities, spam). Persisting leads in a separate table:

- Keeps the booking pipeline locked and authoritative for actual bookings.
- Gives the operator a single dashboard (`/admin/leads`) where every WhatsApp lead lands, with status, contact link, notes, and an optional `linked_booking_id` once a lead converts.
- Establishes the operational backbone that the future `POST /api/butler/flow-submit` (write-capable booking adapter) will hand off to once a lead is ready to become a real booking.

**Impact:**

- New schema (additive, explicitly approved): `public.whatsapp_leads`. RLS **enabled with no policies** - service role bypasses RLS so the Butler ingest + admin routes (both server-only via `SUPABASE_SERVICE_ROLE_KEY`) work, while every other client is denied by default. This is a stricter posture than the repo's existing operational tables (e.g. `booking_action_tokens` runs RLS off); the stricter default is chosen because there is no client-side use case for this table, only server-mediated access.
- New schema helper: [/sql/phase-16a2e-whatsapp-leads.sql](../../sql/phase-16a2e-whatsapp-leads.sql). Idempotent. Must be run once in the Supabase SQL editor before the endpoint can insert. Includes a `BEFORE UPDATE` trigger that keeps `updated_at` honest even on direct dashboard edits.
- New API: [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts), [app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts), [app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts).
- New UI: [app/admin/leads/page.tsx](../../app/admin/leads/page.tsx). A single new "Leads" link added to [components/admin/AdminChrome.tsx](../../components/admin/AdminChrome.tsx) `NAV_ITEMS` - the minimum non-invasive change to make the page discoverable.
- New shared library: [lib/butler/leads.ts](../../lib/butler/leads.ts) - pure helpers for input normalization (Butler ingest), patch validation (admin PATCH), and the canonical `FOLLOW_UP_STATUSES` allow-list (mirrored by the SQL check constraint).
- Docs: [ARCHITECTURE.md](ARCHITECTURE.md) API surface table + Butler flow section + schema list updated. [CURRENT_PHASE.md](CURRENT_PHASE.md) "Just completed" entry added. [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) gets an operator note that human triage lives in `/admin/leads`, not WhatsApp scrollback.
- **No existing schema changes.** `bookings`, `addons`, `settings`, `booking_action_tokens`, `members` are untouched. No existing RLS policy modified. No existing column added, removed, renamed, or retyped.
- **No new env var.** `BUTLER_WEBHOOK_SECRET` and `ADMIN_SECRET` are reused as-is. `ENVIRONMENT_MAP.md` not modified.
- **Boundaries - what this does NOT do:** create bookings, reserve / hold dates, check availability, send emails, issue tokens, expose access details / Wi-Fi / PIN / exact villa location / payment information / IBANs, surface raw Supabase errors, expose other guests' data via this surface. Raw Supabase / driver errors collapse to safe `error: "server_error" }` 500s - logged server-side only.

**Reversible?:** yes. To reverse:
1. `drop table if exists whatsapp_leads cascade;` (loses captured leads - export first if needed).
2. Delete the four new route files, the new admin page, the new lib, and the SQL helper.
3. Revert the single-line `NAV_ITEMS` addition in `components/admin/AdminChrome.tsx`.
4. Revert the docs additions and add a superseding entry here.
No external consumer is locked in - WhatChimp can be unconfigured without affecting any locked surface.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 Butler architecture freeze (read-only `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`) by introducing the **first Butler write** - but only to a brand-new operational table that is explicitly outside the booking pipeline. The 2026-05-12 source-of-truth boundary (Oraya owns pricing/availability/booking/access; the Butler must never invent them) is preserved.

---

## 2026-05-14 - `/api/butler/normalize-dates` added as additional read-only Butler endpoint

**Decision:** ship [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) (backed by [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts)) as a secret-guarded `POST` endpoint that normalizes natural-language date text from WhatChimp (e.g. `"this Saturday"`, `"June 10"`, `"10 June 2026"`, `"two nights"`, ISO) into a structured `{ status, check_in, check_out, nights, human_readable, safe_message }` suggestion. Output is always advisory: even when both dates parse cleanly the endpoint returns `status: "needs_confirmation"` so the Butler must echo the parsed dates back to the guest for confirmation before any availability check.

**Reason:** the WhatsApp Butler / WhatChimp surface receives free-form guest text long before it ever calls the locked `/api/bookings/availability` route. Without a deterministic, server-side normalizer the Butler would have to either (a) push date parsing into AI Training (which the 2026-05-12 architecture freeze and [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) explicitly forbid for any source-of-truth field) or (b) round-trip every phrasing variant through a human. A small, dependency-free, allow-listed parser inside Oraya keeps the Butler vendor-agnostic, leaves availability/pricing/booking ownership untouched, and gives 16A.2's `flow-submit` adapter a canonical pre-step it can rely on.

**Impact:**

- New files: [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts) (pure parser; no dependencies, no `new Date(<text>)` calls - guest text is tokenized explicitly and dates are constructed via `Date.UTC(...)`), [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) (POST handler; same 503/401/200 contract as every other `/api/butler/*` route).
- **Reuses the existing 2026-05-12 Butler auth contract** ([lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth`, `X-Butler-Secret` header validated against `BUTLER_WEBHOOK_SECRET`). No new env var, no new secret, no change to that auth decision.
- [ARCHITECTURE.md](ARCHITECTURE.md) - API surface table gains a new `/api/butler/normalize-dates` row; the Butler flow "Read endpoints" section gains a bullet describing the helper.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - "Just completed" lists this as additional 16A.2 read-only Butler scaffolding. Active sub-phase remains `flow-submit`.
- **No locked-API touches, no schema changes, no new dependencies, no DB reads/writes, no email sends, no token issuance, no availability lookups.** The endpoint is pure text -> structured suggestion.
- The Butler still must call `/api/butler/availability` and ultimately `/api/bookings` for any real-world decision; `normalize-dates` is a pre-step, never an authority on whether a stay can happen.

**Reversible?:** yes - trivially. To reverse: delete the two new files, drop the route row + bullet from `ARCHITECTURE.md`, and add a superseding entry here. No data persisted; no external consumer locked in.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 architecture freeze (read-only `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET` auth contract) and the 2026-05-12 [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) rule that AI Training must never own deterministic fields.

---

## 2026-05-12 - Butler Playbook established as operational source-of-truth

**Decision:** [/docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) is the operational source-of-truth for the WhatsApp AI Butler's identity, conversation behavior, knowledge boundary, and forbidden behaviors. Every WhatChimp configuration, AI prompt, and future agent extending the Butler surface reads it before extending or modifying Butler-facing behavior.

**Reason:** the 2026-05-12 architecture freeze (entry below) locked the **data plane** - namespace, secret, source-of-truth boundary, implementation order. It did **not** lock the **operational plane** - tone, when to escalate, when to upsell, what the AI must never invent. Without a durable, version-controlled rulebook, those rules would live only in chat memory and the WhatChimp admin UI: both ephemeral and untraceable. The playbook closes that gap.

**Impact:**

- Created [/docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) with sections on identity, conversation behavior, availability philosophy, pricing philosophy, VIP handling, add-on philosophy, knowledge source-of-truth, event vs stay separation, deferred future-phase systems, and forbidden AI behavior. Plus a cross-reference index back to the data-plane docs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - "Just completed" updated with the playbook + the minor 16A.1.x villa-slug helper extraction.
- [ARCHITECTURE.md](ARCHITECTURE.md) - Butler flow section cross-references the playbook.
- **No code paths consume the playbook directly.** It is read by humans configuring WhatChimp, by AI prompt authors, and by future repo agents extending the Butler surface. No runtime dependency; no risk to production systems.

**Reversible?:** yes - the playbook is documentation. To reverse: delete the file and add a superseding entry here. Not recommended; operational rules would scatter again.

**Supersedes:** does not supersede a prior decision. Complements the 2026-05-12 architecture freeze (entry directly below) by adding the operational layer the freeze did not cover.

---

## 2026-05-12 - Phase 16A Butler architecture freeze - `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`

**Decision:** the Phase 16A WhatsApp AI Butler integration is locked to the following architecture before any code lands:

1. **Endpoint namespace:** `/api/butler/*`. Not `/api/whatchimp/*`. The name describes what the surface does (AI Butler / concierge intake), not which vendor calls it. WhatChimp is the current caller; future swaps (Meta-direct webhook, alternative routing platforms) reuse the same routes without renaming.
2. **Shared secret:** `BUTLER_WEBHOOK_SECRET`. Server-only. Must never be exposed in a `"use client"` component or any `NEXT_PUBLIC_*` variable. Distinct from `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `ADMIN_SECRET` - do not reuse. Placeholder reserved in [/.env.example](../../.env.example) and [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md); no code path consumes it yet (wired in Phase 16A.1).
3. **Auth model:** for 16A.1 the floor is shared-secret-in-header (`X-Butler-Auth: ${BUTLER_WEBHOOK_SECRET}`). Once WhatChimp confirms it supports outbound request signing, upgrade to HMAC over `timestamp + "\n" + raw_body` with a 5-minute drift window for replay protection. The bare shared secret remains the fallback contract; HMAC is additive.
4. **Source-of-truth boundary:** the Oraya backend (Supabase + the locked `/api/bookings*` surface) is the only authority for pricing, availability, add-ons, booking status, access codes, refund eligibility, and policy text. WhatChimp, WhatsApp Flows, and AI Training **must not** own, paraphrase, or cache any of these. The AI Butler may relay deterministic strings Oraya returns; it must not generate its own quotes or status claims.
5. **Implementation order:** 16A.1 ships read-only Butler endpoints (`/api/butler/health`, `/api/butler/event-types`, `/api/butler/addons`, `/api/butler/availability`). Booking writes, payment, smart-lock, member linking, and AI prompt tuning come later (16A.2+, 16B-16E). The locked API surface is not modified.

**Reason:** the Phase 16A audit (2026-05-11) identified vendor-coupled naming, ad-hoc auth schemes, and source-of-truth duplication as the dominant failure modes for WhatsApp integrations of this shape. Locking the namespace, the secret name, the auth model, and the read/write boundary up front prevents:

- Renaming churn if WhatChimp is later replaced.
- Secret-name collisions or accidental reuse of existing HMAC keys.
- Hallucinated quotes/availability from AI Training, which the audit flagged as the single most expensive trust failure.
- Schema or locked-API drift, because every subsequent 16A step now has an explicit constraint to point at.

**Impact:**

- [CURRENT_PHASE.md](CURRENT_PHASE.md) - rewritten to mark Phase 16A.1 (read-only Butler API foundation) as the next active phase; the 16A audit and the 16A.0 architecture freeze recorded under "Just completed".
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - `BUTLER_WEBHOOK_SECRET` added as a reserved, **not-yet-consumed** server-only secret. Sensitive when wired; explicit guidance against `NEXT_PUBLIC_*` exposure; not yet required in any environment.
- [/.env.example](../../.env.example) - placeholder `BUTLER_WEBHOOK_SECRET=replace_with_butler_webhook_secret` added with a comment pointing at this entry and confirming "not yet consumed".
- **No code, no schema, no API routes touched.** This commit is documentation only. The first code consumer of `BUTLER_WEBHOOK_SECRET` lands in Phase 16A.1.

**Reversible?:** yes - easy. To reverse: drop the `BUTLER_WEBHOOK_SECRET` line from `.env.example` and `ENVIRONMENT_MAP.md`, rewrite `CURRENT_PHASE.md` to a different next-phase, and add a superseding entry here. Do not delete this entry; supersede it.

**Supersedes:** does not supersede a prior decision. Establishes the Phase 16A architecture baseline that Phase 16A.1+ must respect.

---

## 2026-05-09 - `RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded

**Decision:** `RESEND_FROM_EMAIL` is no longer part of the Oraya env contract. It has been removed from [/.env.example](../../.env.example) and removed from the active inventory in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md). The Resend `from:` value remains hardcoded as `Oraya Reservations <bookings@stayoraya.com>` (the `FROM_EMAIL` constant in each `lib/send-*-email.ts`) for the foreseeable future.

**Reason:** the variable was reserved but consumed by zero code paths (KNOWN_BUGS.md #1). Leaving it in `.env.example` and the audit doc created false expectations: an operator setting it in Vercel would see no effect, silently, with no log line to indicate the setting was inert. Removing the variable from the contract makes the current behavior - a hardcoded sender - the documented behavior, and removes a footgun. A configurable sender is fine to add later, but only as an explicit, approved implementation task that wires `process.env.RESEND_FROM_EMAIL` into each `lib/send-*-email.ts` and reintroduces the variable in `.env.example` and the env map at the same time. This commit performs none of that wiring.

**Impact:**

- [/.env.example](../../.env.example) - `RESEND_FROM_EMAIL=...` line plus its two preceding comment lines removed; replaced with a short comment that points readers at this decision entry.
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - row removed from the at-a-glance inventory table; per-variable section replaced with a "removed by decision" notice; Vercel checklist note about non-sensitive variables updated; "expected gap" and "known gap" follow-up bullets removed.
- [KNOWN_BUGS.md](KNOWN_BUGS.md) - entry #1 flipped to `closed (resolved 2026-05-09)` with a pointer to this entry. Numbering preserved so the other open bugs keep their IDs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - open-issues bullet removed, "Just completed" bullet added, "Next recommended steps" item renumbered.
- **No code changed.** No `lib/send-*-email.ts` file was modified in this commit. Email send behavior is identical before and after.
- The historical reference in the 2026-05-09 "Environment audit baseline" entry below ("including `RESEND_FROM_EMAIL` reserved-but-unused") is preserved as-is per the append-only rule of this log - it accurately describes what the audit found at that moment.
- A stale informational mention remains in [/README.md](../../README.md) ("currently hardcoded... unless you later wire `RESEND_FROM_EMAIL`"). It is still factually accurate (current state: hardcoded; future state: would require wiring) and was outside the explicit scope of the cleanup task. It can be tightened in a future README pass.

**Reversible?:** yes - easy. To reintroduce, perform the wiring work in `lib/send-*-email.ts` and re-add the variable to `.env.example` and `ENVIRONMENT_MAP.md` in the same PR. Do not re-add the variable without the wiring; that would re-create the original footgun.

**Supersedes:** does not supersede a prior decision; resolves [KNOWN_BUGS.md](KNOWN_BUGS.md) entry #1.

---

## 2026-05-09 - `/docs/system/` is the AI source of truth

**Decision:** all AI-facing project documentation lives in [`/docs/system/`](.) as version-controlled Markdown. ChatGPT chat memory and side-channel notes are no longer authoritative. New AI sessions read this directory first.

**Reason:** chat threads are ephemeral, drift across providers (ChatGPT / Claude Code / Codex / Cursor), and have no diff history. Repo-tracked docs are durable, reviewable, and reachable from every agent. Long ChatGPT conversations were starting to disagree with the actual repo state.

**Impact:**

- Created `/docs/system/{PROJECT_STATE,CURRENT_PHASE,AGENT_RULES,ARCHITECTURE,DECISIONS_LOG,KNOWN_BUGS,AGENT_HANDOFF_TEMPLATE,CHATGPT_PROJECT_INSTRUCTIONS}.md`. (`ENVIRONMENT_MAP.md` already created in the prior commit.)
- Existing root-level docs ([/PROJECT_STATE.md](../../PROJECT_STATE.md), [/AGENTS.md](../../AGENTS.md), [/CLAUDE.md](../../CLAUDE.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md)) are kept intact and remain valid where they don't conflict with `/docs/system/`. The new `/docs/system/PROJECT_STATE.md` is the authoritative summary; the root `/PROJECT_STATE.md` is the historical detail log.
- Every PR that changes behavior described in a `/docs/system/` file must update that file in the same PR (see [AGENT_RULES.md](AGENT_RULES.md) rule 11).
- ChatGPT Project Instructions field will be populated from [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md) so every new chat starts with the same orientation.

**Reversible?:** yes - but reverting means losing the cross-agent consistency benefit; not recommended.

---

## 2026-05-09 - `.gitignore` explicitly protects all `.env*` variants

**Decision:** `.gitignore` lists every Next.js env-file variant by name (`.env`, `.env.local`, `.env.development`, `.env.development.local`, `.env.production`, `.env.production.local`, `.env.test`, `.env.test.local`) instead of relying solely on `.env*.local` glob.

**Reason:** the previous pattern `.env*.local` matched `.env.production.local` but **not** `.env.production`. Anyone saving a prod env snapshot under that name would have committed it. The hole is closed and made obvious by listing every variant.

**Impact:**

- [/.gitignore](../../.gitignore) updated.
- `.env.example` (placeholders only) remains the single tracked env file.
- Verified with `git check-ignore -v` against all variants.

**Reversible?:** yes, but no reason to.

---

## 2026-05-09 - `.env.example` uses explicit `replace_with_*` placeholders

**Decision:** `.env.example` switched from empty values (`KEY=`) to explicit placeholder values (`KEY=replace_with_<thing>`) plus per-variable "where to get it" comments. Cross-links to [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

**Reason:** empty values are easy to overlook and easy to commit unfilled. A literal `replace_with_*` placeholder both documents intent and fails loudly in tooling that validates env var format. The "where to get it" notes shorten onboarding from minutes-of-grep to one read.

**Impact:** [/.env.example](../../.env.example) updated. Local devs and Vercel admins now see the source for each value inline.

**Reversible?:** yes.

---

## 2026-05-09 - Environment audit baseline

**Decision:** [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) is the single source of truth for every `process.env.*` read in the repo. Re-audited on every release that touches API routes, lib helpers, or `vercel.json`.

**Reason:** secrets sprawl across `.env.example`, README, AGENTS.md, CLAUDE.md, and ad-hoc Vercel notes had drifted. One canonical map removes guesswork around scope, risk, and rotation.

**Impact:**

- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) created (10 variables documented, including `RESEND_FROM_EMAIL` reserved-but-unused and `NODE_ENV` system-managed).
- Three open issues surfaced and now tracked in [KNOWN_BUGS.md](KNOWN_BUGS.md).

**Reversible?:** no - once the audit baseline exists, future agents are expected to keep it current.

---

<!-- New entries go above this line, newest first. Old entries never deleted. -->
