# Phase 16B Full Payment Operations Architecture Audit

**Date:** 2026-06-18
**Scope:** docs-only audit and design roadmap for Oraya payment operations.
**Branch audited:** `agent/phase-16b-cybersource-unified-checkout-test`
**PR audited:** #64 - NetCommerce / CyberSource Unified Checkout sandbox implementation
**Production status:** production payment remains disabled; `master` is unchanged.

This document is an architecture audit. It is not an implementation plan approval, migration, production enablement, or merge decision.

---

## Executive Summary

PR #64 is a credible first hosted-payment foundation: it creates a booking first, creates an Oraya-hosted Credit Libanais / NetCommerce / CyberSource Unified Checkout payment page, obtains a CyberSource capture context server-side, collects card details inside the bank/CyberSource-controlled UI, sends the transient token back to Oraya server-side, and updates booking payment fields only after server-side gateway authorization. Browser return URLs remain informational and `bookings.status` remains `PENDING`.

**2026-06-22 Preview QA addendum:** PR #64 may temporarily enable `NEXT_PUBLIC_NETCOMMERCE_QA_MODE=true` and `NETCOMMERCE_QA_MODE=true` on the approved Vercel Preview so NetCommerce can complete external sandbox workflow testing. In that mode only, add-ons/special requests do not block pay-now and an authoritative approved CyberSource sandbox payment may mark the test booking `confirmed`. This does not supersede the production lifecycle guidance in this audit: production remains disabled, browser redirects remain informational, and production auto-confirmation is still not approved.

The current implementation is not yet a full payment operating system. It lacks verified CyberSource webhooks/MLE processing, provider-side refund/partial-refund/void/capture APIs, settlement/reconciliation ingestion, durable payment-attempt and transaction tables, tokenization/saved-card consent, fraud review handling, role-based money-movement controls, and a provider-grade payment timeline in admin.

The current CyberSource completion request sends `processingInformation.capture: true` in `lib/payments/credit-libanais.ts`. Based on CyberSource's public payment docs, a sale combines authorization and capture in one transaction, while capture is otherwise a follow-on transaction to an authorization. Therefore the PR #64 browser completion should be treated as "authorization plus capture requested / sale-like" until NetCommerce confirms the merchant configuration and response semantics. It is not a clean auth-only/manual-capture flow today.

Admin has useful payment foundations already: `/admin/settings` exposes guest-safe payment settings and provider readiness, and `/admin/bookings` exposes manual request-deposit, record-payment, issue-refund, and reminder controls. These are partial/manual operating controls, not provider-integrated money movement. The next production-grade increment should preserve those foundations while moving provider operations into dedicated, audited admin payment endpoints and tables.

## Audit Inputs

Local source files inspected:

- `lib/payments/provider.ts`
- `lib/payments/runtime.ts`
- `lib/payments/credit-libanais.ts`
- `lib/payments/stripe.ts`
- `lib/payments/webhook-handler.ts`
- `lib/payments/settings.ts`
- `lib/payments/checkout-amount.ts`
- `lib/payments/link-state.ts`
- `lib/payments/domain.ts`
- `lib/payments/request-origin.ts`
- `app/api/payments/checkout/route.ts`
- `app/api/payments/unified-checkout-session/route.ts`
- `app/api/payments/unified-checkout-complete/route.ts`
- `app/api/payments/readiness/route.ts`
- `app/api/payments/webhook/[provider]/route.ts`
- `app/api/payments/webhook/stripe/route.ts`
- `app/payments/checkout/[token]/page.tsx`
- `app/book/page.tsx`
- `app/booking/view/[token]/page.tsx`
- `app/admin/settings/page.tsx`
- `components/admin/PaymentSettingsSection.tsx`
- `components/admin/BookingsTable.tsx`
- `components/admin/types.ts`
- `app/api/admin/settings/route.ts`
- `app/api/settings/route.ts`
- `app/api/admin/bookings/[id]/route.ts`
- `app/api/admin/data/route.ts`
- `lib/payment-foundation.ts`
- `lib/payment-method-labels.ts`
- `lib/admin-booking-diff.ts`
- `sql/phase-15i1-payment-foundation.sql`
- `sql/phase-16b1-payment-link-foundation.sql`
- `sql/phase-16b4-credit-libanais-provider-compat.sql`
- `docs/phases/PHASE_16B_PLAN.md`

Provider references consulted:

- CyberSource Unified Checkout: `https://developer.cybersource.com/docs/cybs/en-us/unified-checkout/developer/all/rest/unified-checkout.html`
- CyberSource transient tokens: `https://developer.cybersource.com/docs/cybs/en-us/unified-checkout/developer/all/rest/unified-checkout/uc-tokens-intro.html`
- CyberSource Payments - basic authorization: `https://developer.cybersource.com/docs/cybs/en-us/payment-features/developer/ctv/rest/payment-features/payfg-payments-services-intro/payments-processing-basic-auth-intro.html`
- CyberSource Payments - sale: `https://developer.cybersource.com/docs/cybs/en-us/payments/developer/ctv/rest/payments/payments-processing-basic-intro/payments-processing-basic-sale-intro.html`
- CyberSource Payments - capture: `https://developer.cybersource.com/docs/cybs/en-us/payments/developer/ctv/rest/payments/payments-intro/payments-services-intro/payments-intro-processing-capture.html`
- CyberSource Payments - authorization reversal: `https://developer.cybersource.com/docs/cybs/en-us/payments/developer/ctv/rest/payments/payments-processing-basic-intro/payments-processing-basic-auth-reversal-intro.html`
- CyberSource Payments - follow-on refund: `https://developer.cybersource.com/docs/cybs/en-us/payments/developer/ctv/rest/payments/payments-processing-basic-intro/payments-processing-basic-refund-intro.html`
- CyberSource Payments - void: `https://developer.cybersource.com/docs/cybs/en-us/payments/developer/ctv/rest/payments/payments-intro/payments-services-intro/payments-intro-processing-void.html`
- CyberSource Webhooks/MLE: `https://developer.cybersource.com/docs/cybs/en-us/webhooks/implementation/all/rest/webhooks.html`
- CyberSource Token Management payment instruments: `https://developer.cybersource.com/docs/cybs/en-us/tms/developer/all/rest/tms/tms-pi-tkn/tms-manage-pi-tkn.html`
- CyberSource Transaction Search: `https://developer.cybersource.com/docs/cybs/en-us/txn-search/developer/all/rest/txn-search.html`
- CyberSource Reporting API: `https://developer.cybersource.com/docs/cybs/en-us/reporting/developer/all/rest/reporting.html`
- CyberSource Pay by Link: `https://developer.cybersource.com/docs/cybs/en-us/paybylink/developer/all/rest/paybylink/paybylink-intro.html`
- CyberSource Invoicing: `https://developer.cybersource.com/docs/cybs/en-us/invoicing/developer/all/rest/invoicing/Introduction.html`
- CyberSource Recurring Billing: `https://developer.cybersource.com/docs/cybs/en-us/recurring-billing/developer/all/rest/recurring-billing-dev/recur-bill-dev-intro.html`
- CyberSource BIN Lookup: `https://developer.cybersource.com/docs/cybs/en-us/bin-lookup/developer/all/rest/bin-lookup.html`
- CyberSource Decision field: `https://developer.cybersource.com/docs/cybs/en-us/api-fields/reference/all/so/api-fields/decision.html`

## Current Implementation Status

### What Exists Today

Payment provider abstraction:

- `lib/payments/provider.ts` defines hosted-checkout provider keys, persisted link providers, payment-link statuses, payment purposes (`deposit`, `balance`, `full`), webhook event shapes, and readiness contracts.
- `lib/payments/runtime.ts` selects the runtime provider from `PAYMENT_PROVIDER`. In production, it rejects anything except `credit_libanais`; outside production it defaults to Stripe when unset.
- `lib/payments/settings.ts` defines safe guest/admin payment settings stored under `settings.key = payment_public_settings`: active mode, deposit minimum percentage, manual rails, provider display name, full/deposit toggles, guest instructions, and online-payment enabled flag.
- `lib/payments/checkout-amount.ts` validates full vs deposit amounts. The default minimum deposit is 40% through `DEFAULT_PAYMENT_PUBLIC_SETTINGS.deposit_minimum_percentage`.
- `lib/payments/link-state.ts` derives active/expired/paid/cancelled/failed state from booking link fields.

Credit Libanais / NetCommerce / CyberSource implementation:

- `lib/payments/credit-libanais.ts` reads only server-side `NETCOMMERCE_CYBERSOURCE_*` env vars.
- It creates CyberSource Unified Checkout capture contexts with `/uc/v1/sessions`.
- It loads CyberSource client-library metadata from the capture context JWT where available.
- It uses `PANENTRY` as the allowed payment type.
- It authorizes the transient token through `/pts/v2/payments`.
- It sends `processingInformation.capture: true`, so current behavior should be treated as capture-requested / sale-like until NetCommerce confirms.
- It marks responses with status `AUTHORIZED` or `CAPTURED` as approved.
- It returns a CyberSource transaction ID as `payment.reference` when present.
- It does not implement CyberSource webhook/MLE verification yet; `verifyWebhook()` currently throws a readiness/configuration error.

Hosted checkout routes:

- `POST /api/payments/checkout` validates the signed booking token, payment settings, booking state, amount, and provider readiness; then writes `payment_link_*`, amount, and payment-request fields on `bookings`.
- `POST /api/payments/unified-checkout-session` validates the signed booking token and active link, creates a fresh capture context, and updates `bookings.payment_provider_session_id` to an Oraya-generated `oraya_*` reference.
- `POST /api/payments/unified-checkout-complete` validates the token, active link, and transient token; calls CyberSource Payments API; and, on approved payment, updates booking payment fields to `deposit_paid` or `paid_in_full` and `payment_link_status = paid`.
- `POST /api/payments/webhook/[provider]` exists as a generic route, but Credit Libanais/CyberSource verification is not implemented.
- `POST /api/payments/webhook/stripe` exists as a dev/test compatibility shim.
- `GET /api/payments/readiness` exposes admin-safe provider status.

Guest and checkout UI:

- `/book` creates the booking first, then calls `POST /api/payments/checkout` only for eligible pay-now flows.
- `/payments/checkout/[token]` loads the bank/CyberSource UI, displays the official NetCommerce seal, receives a transient token, and posts it to Oraya for server-side completion.
- `/booking/view/[token]` displays payment return messages as informational and shows active payment links when present.
- No Oraya component stores PAN, CVV, full card number, raw capture context, or transient token in durable storage.

Admin foundations:

- `/admin/settings` has a Payments section with payment mode, provider display name, minimum deposit percentage, full/custom deposit toggles, online-payment enabled toggle, manual rails, public instructions, bank-transfer public details, and non-secret gateway readiness.
- `/admin/bookings` has manual payment controls for confirmed bookings: request deposit, record payment, issue refund, and send payment reminder.
- `/api/admin/bookings/[id]` allow-lists payment fields and sends payment requested/received/reminder emails on certain updates.

### What Is Missing Today

Provider operations:

- No provider refund API.
- No provider partial-refund API.
- No provider void API.
- No provider capture API for auth-only/manual-capture flows.
- No authorization reversal API.
- No provider transaction-status refresh endpoint.
- No settlement/batch reconciliation import or API sync.
- No CyberSource Transaction Search or Reporting API integration.
- No CyberSource Pay by Link, Invoicing, Recurring Billing, or BIN Lookup integration.
- No Token Management Service integration.
- No saved-card consent model.
- No fraud/risk/Decision Manager decision handling.

Durable data:

- No `payment_attempts` table.
- No `payment_transactions` table separating authorization, capture, sale, refund, void, and reversal IDs.
- No webhook event inbox/dedupe table.
- No payment action audit table.
- No settlement/reconciliation table.
- No tokenized payment instrument table.
- No provider-health history table.

Admin operations:

- No provider transaction timeline.
- No real refund/partial-refund/void/capture buttons.
- No role-based money-movement permissions.
- No mandatory admin reason/notes for money movement.
- No idempotency key tracking in admin actions.
- No irreversible-action confirmation workflow.
- No production-readiness checklist gate beyond env readiness plus the DB `online_payment_enabled` flag.
- No admin balance-payment-link or add-on/top-up-link generator.

## Existing Admin / Payment Provider Readiness

| Area | Existing behavior | Classification | Notes |
|---|---|---|---|
| `/admin/settings` payment section | Guest-safe settings for payment mode, deposit minimum, manual rails, public copy, provider display name, online enabled | Useful foundation for next PR | Good separation from secrets; not enough for production readiness by itself |
| Provider readiness panel | Shows provider, configured, implemented, checkout-ready, environment, admin message, missing requirements | Useful foundation for next PR | Should expand to webhook, decline-vector, settlement, production-gate statuses |
| Generic admin settings API | Admin can upsert arbitrary `settings.key/value` rows | Partial/risky | Admin-auth protected, but future payment config should use allow-listed payment settings endpoints |
| Public settings API | Allows only safe settings keys and merges runtime checkout readiness | Production-ready foundation | Correctly hides secrets and blocks online checkout unless DB setting and runtime readiness agree |
| Admin booking payment summary | Shows totals, amount paid/due, deposit, last payment, references/timestamps | Useful foundation | Not a provider transaction timeline |
| Request deposit | Writes deposit amount, payment method, due date, notes, `payment_status = payment_requested` | Partial/manual | Does not create provider link or Pay by Link |
| Record payment | Admin manually increments `amount_paid`, sets method/reference/received timestamp/status | Partial/manual | Useful for bank/cash/portal-managed payments; risky for provider card payments if used instead of verified gateway events |
| Issue refund | Admin records `refund_status = refunded`, amount, timestamp, notes | Partial/manual/risky | No provider refund call; no partial-refund UI despite a `partial_refund` enum existing |
| Send payment reminder | Sends reminder only after payment requested | Useful foundation | Email-only; no WhatsApp/link resend yet |
| Payment link fields in admin API | API accepts `payment_link_url`, provider, status, expires, session id | Partial/risky | Should be moved behind dedicated provider/payment-link operations; manual mutation of provider IDs should not be general-purpose |
| Booking payment emails | Payment requested/received/reminder emails exist | Useful foundation | Needs provider-event awareness and link-resend content |
| Admin role model | Single admin auth | Partial/risky | Refunds/voids/captures should require role/permission separation or at least stronger confirmation/audit |

## Professional Admin Payment Provider Design

Admin should control guest-safe operations and business policy. Admin should not control or see gateway secrets.

Admin should eventually show:

- Active provider: Credit Libanais / NetCommerce / CyberSource.
- Environment: sandbox or production.
- Checkout mode: hosted checkout / Unified Checkout.
- Production payment enabled: yes/no, derived from env-only production gate plus admin guest-facing enablement.
- Provider health: credentials configured, sessions API reachable, payments API reachable, webhook configured, MLE configured, latest webhook received.
- Sandbox test status: approved-card passed, declined-card vector passed/not passed.
- Webhook status: enabled, event types subscribed, latest accepted event timestamp, latest failed event timestamp.
- Settlement status: latest report imported/synced, unmatched items count, last reconciliation date.
- Allowed payment actions for the booking: authorize/sale, capture, void, authorization reversal, refund, partial refund, resend payment link, create balance link, create add-on/top-up link.
- Risk/fraud status if Decision Manager or payer authentication is enabled.
- Tokenization status if TMS is enabled.
- Saved-card status only after explicit guest consent.
- Warnings when production is not fully ready.

Admin may control:

- Guest payment mode: request-only, manual, online, hybrid.
- Whether online payment is shown to guests after env readiness passes.
- Minimum deposit percentage.
- Full vs deposit availability.
- Manual payment rails and guest instructions.
- Public provider display name.
- Safe payment-link issuance actions after provider integration exists.
- Operational notes, refund reason, and reconciliation annotations.

Admin must not control or view:

- Merchant ID if NetCommerce treats it as sensitive.
- Key ID if NetCommerce treats it as sensitive.
- Shared secret.
- Webhook MLE private key.
- Webhook secret values.
- Vercel env values.
- Raw capture contexts.
- Transient tokens.
- PAN, CVV, full card number, or full payment-account credentials.
- Raw provider payloads that include sensitive payment data.
- Production/sandbox env switching through the database.
- Final production enablement if it depends on an env-only kill switch.

Recommended split:

- Env-only: provider credentials, provider environment, API base URL, webhook/MLE key material, production hard enablement flag, secret rotation metadata.
- Database/admin settings: guest-safe payment mode, public copy, deposit policy, manual rails, safe provider display label, non-secret status snapshots.
- Provider portal / NetCommerce: merchant onboarding, settlement accounts, risk/fraud rules, Pay by Link/Invoicing enablement, recurring billing enablement, Decision Manager rules, webhook subscriptions if provider-owned.

## Professional Payment Architecture Patterns

Production booking/e-commerce platforms usually separate four truths:

1. Booking/order truth: Oraya decides whether a stay is operationally confirmed.
2. Payment authorization/capture truth: the provider decides whether money movement is authorized, captured, refunded, voided, or settled.
3. Webhook/event truth: asynchronous provider events reconcile states after browser/API responses.
4. Settlement truth: reports and bank deposits prove captured funds settled.

Patterns Oraya should follow:

- Credentials live in env vars or a secret manager, not admin UI or database.
- Admin UI shows connection status and masked metadata, never secrets.
- Browser returns are informational only.
- Server-side provider verification and verified webhooks update payment state.
- Every provider operation uses idempotency keys.
- Every money movement action writes an audit event.
- Refund, void, capture, and reversal actions require admin auth, reason, and confirmation.
- Payment data model separates attempts, transactions, events, and settlement batches.
- Saved cards require explicit guest consent and token-only storage.
- Fraud/risk decisions can block capture or require manual review.
- Settlement/reconciliation is separate from checkout success.

## Capability Matrix

| Capability | Current Oraya status | Provider/NetCommerce status | Recommendation |
|---|---|---|---|
| Unified Checkout | Partly implemented; sandbox approved-card path passed | Confirmed as current integration direction | Keep as PR #64 foundation |
| Capture context creation | Implemented for session API | Needs production credentials before live | Keep server-only |
| Transient token handling | Implemented; transient token posted server-side, not stored | CyberSource transient tokens are short-lived references to payment data | Keep; never store transient tokens |
| Payments authorization | Partly implemented through `/pts/v2/payments` | Needs NetCommerce confirmation of merchant behavior | Confirm status semantics and decline vectors |
| Sale / immediate capture | Current code requests `capture: true`; status handling accepts `AUTHORIZED` or `CAPTURED` | Needs NetCommerce confirmation | Treat as sale-like until confirmed; decide if this is acceptable for pending bookings |
| Manual capture | Not implemented | Likely available if account supports auth-only + capture | Recommended if Oraya wants admin approval before capture |
| Authorization reversal | Not implemented | CyberSource supports reversals for authorizations | Recommended if auth-only is used |
| Void | Not implemented | CyberSource supports voids for unprocessed capture/credit requests | Recommended for pre-settlement operational recovery |
| Refund | Manual admin record only; no provider call | CyberSource supports follow-on refunds | Required before production operations |
| Partial refund | Enum exists but UI always records full `refunded`; no provider call | CyberSource refund amount can be specified | Required for hospitality policies |
| Webhooks | Generic scaffold exists; Stripe dev verification exists; Credit Libanais throws | CyberSource payment and Unified Checkout events require MLE | Required before production hardening |
| MLE webhook decryption/verification | Not implemented | Required for relevant events | Required before trusting asynchronous events |
| Settlement/reconciliation | Not implemented | Reporting and Transaction Search APIs exist; bank settlement process must be confirmed | Required after webhooks |
| Tokenization / TMS | Not implemented | CyberSource TMS supports token management | Later phase with consent |
| Saved cards | Not implemented | Depends on TMS/COF enablement | Not recommended until core operations are stable |
| Token management | Not implemented | TMS supports create/retrieve/update/delete payment instruments | Later phase |
| Decision Manager / fraud | Not implemented | Decision can return `REVIEW` when Decision Manager is used | Confirm enablement; surface read-only first |
| Payer authentication / 3DS | Not explicitly modeled | May be configured through provider/CyberSource | Ask NetCommerce; surface status if enabled |
| Digital wallets | Not explicitly implemented | May be available through Unified Checkout configuration | Confirm before advertising |
| Pay by Link | Oraya has internal signed payment page links; CyberSource Pay by Link not implemented | CyberSource has Pay by Link APIs, requires enablement | Not needed for first production if Oraya internal links suffice; useful later |
| Invoicing | Not implemented | CyberSource Invoicing API exists | Later, useful for event proposals/add-ons |
| Installments | Not implemented | Needs NetCommerce confirmation | Not recommended until core card operations are stable |
| Recurring billing | Not implemented | CyberSource Recurring Billing requires TMS and account enablement | Not recommended for villa bookings now |
| BIN lookup | Not implemented | CyberSource BIN Lookup exists and may be limited availability | Not recommended unless needed for routing/installments/eligibility |
| Reporting | Not implemented | CyberSource Reporting API supports report subscriptions/downloads/one-time reports | Recommended for reconciliation |
| Transaction Search | Not implemented | API can search/view transaction details | Recommended for admin refresh and investigation |
| Payouts/platform services | Not implemented | Likely irrelevant for single-merchant villa bookings | Not recommended now |

## Oraya Business Rules

Full payment now:

- Allowed only for operationally simple, instant-eligible stays with no special requests and no approval-based add-ons.
- Booking row is created first.
- Payment completion updates payment fields only.
- `bookings.status` remains `PENDING` until admin/operations confirmation.
- If the current `capture: true` sale-like behavior remains, Oraya must accept that funds may be captured before final admin confirmation.

Deposit payment:

- Default minimum deposit is 40% unless David changes the admin setting.
- Deposit amount must be at least the configured minimum and not exceed the booking total.
- Deposit payment should mark `payment_status = deposit_paid`, `payment_stage = partially_paid`, `amount_paid`, `amount_due`, and `payment_received_at`.
- Deposit does not auto-confirm the stay.

Remaining balance:

- Balance should become due based on Oraya policy: after admin confirmation, before check-in, or at a configured deadline.
- Balance collection should use a new balance-payment link tied to the booking and prior payments.
- Balance payment should not reuse the original deposit attempt/session.

Add-ons and top-ups:

- Approval-based add-ons and special requests are reviewed after booking creation.
- Once approved, admin should create an add-on/top-up payment link with its own attempt and transaction records.
- Add-on payment should not overwrite the stay deposit/full-payment transaction.

WhatsApp payment links:

- WhatsApp should never invent payment URLs or payment status.
- WhatsApp may relay Oraya-generated signed payment links after identity is established.
- Payment links sent through WhatsApp must not expose admin tokens or raw provider tokens.

Refunds:

- Refund eligibility is a policy decision; provider refund execution is a payment operation.
- Admin must capture reason, amount, policy basis, and action owner.
- Partial refunds must be first-class.
- Refund records must reference the provider capture/sale transaction.
- Manual refund records should remain possible only for off-platform refunds, with clear labeling.

Voids and reversals:

- If the transaction is captured/sale-like and not yet submitted to processor settlement, void may be possible.
- If auth-only is adopted, authorization reversal should release unused holds.
- Admin UI should show whether void/reversal is still available based on provider status.

Capture/manual capture:

- If Oraya wants admin approval before capturing funds, future implementation should switch from `capture: true` to auth-only where supported.
- Admin capture should be allowed only after operations approval and fraud/risk review clearance.
- If immediate sale/capture remains, admin capture controls are not applicable for those transactions.

Booking confirmation:

- Payment success never automatically confirms a booking.
- Admin confirmation remains the source of truth for `bookings.status`.
- If a payment succeeds but admin later rejects/cancels, refund/void/reversal workflow must be ready.

## Proposed Data Model

Do not create these migrations until approved. This is the target shape.

Keep on `bookings` as summary fields:

- `payment_status`
- `payment_stage`
- `amount_total`
- `amount_paid`
- `amount_due`
- `deposit_amount`
- `payment_last_at`
- `payment_link_status`
- `payment_link_provider`
- `payment_link_expires_at`
- `refund_status`
- `refund_amount`
- `refunded_at`

Add a `payment_attempts` table:

- `id`
- `booking_id`
- `purpose` (`deposit`, `balance`, `full`, `addon`, `top_up`)
- `amount`
- `currency`
- `provider`
- `provider_environment`
- `status` (`created`, `active`, `authorized`, `captured`, `paid`, `failed`, `expired`, `cancelled`)
- `checkout_url`
- `expires_at`
- `requested_by_type` (`guest`, `admin`, `system`)
- `requested_by_admin_id` or safe actor label
- `idempotency_key`
- `provider_session_id`
- `provider_client_reference`
- `failure_code`
- `failure_message_safe`
- `created_at`
- `updated_at`

Add a `payment_transactions` table:

- `id`
- `booking_id`
- `payment_attempt_id`
- `provider`
- `provider_environment`
- `transaction_type` (`authorization`, `sale`, `capture`, `refund`, `partial_refund`, `void`, `authorization_reversal`)
- `provider_transaction_id`
- `parent_provider_transaction_id`
- `amount`
- `currency`
- `status`
- `processor_response_code`
- `approval_code`
- `network_transaction_id`
- `provider_status`
- `risk_decision`
- `risk_reason_code`
- `processed_at`
- `settled_at`
- `created_at`
- `updated_at`

Add a `payment_provider_events` table:

- `id`
- `provider`
- `provider_event_id`
- `event_type`
- `provider_transaction_id`
- `payment_attempt_id`
- `booking_id`
- `received_at`
- `verified_at`
- `processed_at`
- `processing_status`
- `dedupe_key`
- `safe_summary`
- `error_message_safe`
- optional encrypted/raw payload retention policy, redacted and time-limited only

Add a `payment_audit_log` table:

- `id`
- `booking_id`
- `payment_attempt_id`
- `payment_transaction_id`
- `actor_type`
- `actor_id_or_label`
- `action`
- `reason`
- `amount`
- `currency`
- `before_summary`
- `after_summary`
- `idempotency_key`
- `created_at`

Add `payment_reconciliation_batches` and `payment_reconciliation_items`:

- batch/report IDs
- settlement date
- provider report source
- imported/synced timestamp
- total expected/captured/refunded/fees/net
- match status
- unmatched reason
- linked booking/payment transaction

Add `payment_instruments` only if tokenization/saved cards is approved:

- `id`
- `member_id` or guest identity reference
- CyberSource TMS customer token
- payment instrument token
- instrument identifier token
- card brand
- last4 only if provided by token service
- expiry month/year
- consent_text_version
- consent_granted_at
- revoked_at
- created_at
- updated_at

Never store:

- PAN
- CVV
- full card number
- raw transient tokens
- raw capture contexts as durable records
- shared secrets
- webhook MLE private keys
- Vercel env values

## Proposed API Map

Existing APIs to keep and harden:

- `POST /api/payments/checkout` - create an initial hosted checkout for an existing booking.
- `POST /api/payments/unified-checkout-session` - create a fresh CyberSource capture context.
- `POST /api/payments/unified-checkout-complete` - complete a transient-token payment server-side.
- `POST /api/payments/webhook/[provider]` - verified provider event receiver.
- `GET /api/payments/readiness` - admin-safe provider readiness.

Proposed APIs:

- `POST /api/admin/payments/bookings/[id]/links` - create payment link for deposit/full/balance/add-on/top-up.
- `POST /api/admin/payments/attempts/[id]/resend` - resend link by email/WhatsApp-safe channel.
- `POST /api/admin/payments/transactions/[id]/capture` - capture an authorization.
- `POST /api/admin/payments/transactions/[id]/void` - void an eligible capture/credit.
- `POST /api/admin/payments/transactions/[id]/reverse-authorization` - release an authorization hold.
- `POST /api/admin/payments/transactions/[id]/refund` - full refund.
- `POST /api/admin/payments/transactions/[id]/partial-refund` - partial refund.
- `GET /api/admin/payments/bookings/[id]/timeline` - attempts, transactions, events, reconciliation items, audit log.
- `POST /api/admin/payments/bookings/[id]/refresh` - provider transaction search/status refresh.
- `GET /api/admin/payments/provider/status` - richer provider readiness and latest webhook/reconciliation state.
- `POST /api/admin/payments/reconciliation/import` - upload or trigger report import.
- `POST /api/admin/payments/reconciliation/sync` - pull reports/transaction search where available.
- `POST /api/admin/payments/tokens/consent` - record guest consent for saved card only if TMS approved.
- `DELETE /api/admin/payments/tokens/[id]` - revoke stored payment instrument token.

API rules:

- Admin money-movement endpoints require admin auth, idempotency keys, reason strings, and audit records.
- Public payment endpoints require signed booking view/payment tokens.
- Webhook endpoints are public but must verify CyberSource MLE/signatures before state changes.
- Provider IDs must be server-generated or provider-returned, not manually typed through generic booking PATCH.

## Proposed Admin UI Map

Provider status page:

- Active provider and environment.
- Production hard gate status.
- Checkout readiness.
- Sessions API health.
- Payments API health.
- Webhook subscription/MLE health.
- Latest webhook received.
- Declined-card test status.
- Settlement report status.
- NetCommerce approval checklist.

Payment configuration panel:

- Guest-facing payment mode.
- Minimum deposit percentage.
- Full/deposit availability.
- Manual rails.
- Public instructions.
- Provider display name.
- Online-payment enabled toggle with warnings.
- Read-only env status; no secret values.

Booking payment timeline:

- Payment attempts.
- Authorization/sale/capture/refund/void/reversal transactions.
- Provider status changes.
- Webhook events.
- Admin actions.
- Reconciliation result.

Booking payment controls:

- Create secure payment link.
- Resend current payment link.
- Create balance payment link.
- Create add-on/top-up payment link.
- Capture authorization, only when available.
- Void eligible transaction, only when provider says eligible.
- Reverse authorization, only for uncaptured auths.
- Refund / partial refund.
- Refresh provider status.
- Export or view receipt metadata.

Badges:

- `unpaid`
- `payment_requested`
- `authorized`
- `captured`
- `paid_in_full`
- `deposit_paid`
- `failed`
- `voided`
- `refunded`
- `partially_refunded`
- `pending_settlement`
- `settled`
- `reconciliation_exception`
- `risk_review`

Disabled-state warnings:

- "Production env is not enabled."
- "Webhook/MLE not verified."
- "Declined-card vector not validated."
- "No refundable provider transaction found."
- "Transaction is already settled; use refund instead of void."
- "Risk review pending; capture disabled."

## Security and Compliance Requirements

- No PAN/CVV storage in Oraya.
- No full card number in logs, docs, database, screenshots, or admin UI.
- Token-only storage if TMS/saved cards are approved.
- Saved-card consent must be explicit, versioned, and revocable.
- CyberSource webhook MLE must be implemented before asynchronous events are trusted.
- Webhook processing must be idempotent and deduped.
- Admin money movement must be audited.
- Refunds/voids/captures must be admin-only and permission-controlled.
- Production and sandbox must be separated by env, not an admin toggle alone.
- Provider secret values must be env-only.
- Private Vercel share links, signed checkout URLs, capture contexts, transient tokens, card data, and merchant secrets must not be committed or printed.
- Manual approval gates must remain before operational booking confirmation.
- Fraud/risk review states must block capture until accepted.
- Logs must use safe summaries and IDs only.

## Implementation Phases

### 16B.1 - Current PR #64 foundation

Status: partly implemented on PR #64 Preview.

- Unified Checkout sandbox path.
- NetCommerce seal.
- Server-side transient-token completion.
- Booking payment fields update.
- `bookings.status` remains `PENDING`.
- Production disabled.

Exit criteria still open:

- NetCommerce review.
- Declined-card vector.
- Confirmation of capture/sale/auth behavior.

### 16B.2 - Provider confirmation and declined-card vector

- Ask NetCommerce the exact questions in this document.
- Validate approved and declined paths.
- Decide sale/immediate-capture vs auth-only/manual-capture.
- Confirm webhook/MLE, refund, void, capture, settlement, and portal/API boundaries.

### 16B.3 - Webhook architecture

- Implement CyberSource webhook MLE verification.
- Add webhook event inbox/dedupe table.
- Subscribe to payment, capture, refund, void, and Unified Checkout events as supported.
- Keep browser returns informational.

### 16B.4 - Admin payment provider status/settings page

- Expand current `/admin/settings` readiness panel into a payment provider status area.
- Add production checklist status, latest webhook, decline validation, settlement status.
- Add env-only production hard gate.

### 16B.5 - Refunds, voids, captures, and reversals

- Add provider transaction table and admin operations.
- Add role/permission and audit requirements.
- Implement provider refund, partial refund, void, capture, and auth reversal only after NetCommerce confirms support.

### 16B.6 - Deposits and balance links

- Add durable payment attempts.
- Support deposit, full, balance, add-on, and top-up link purposes.
- Add WhatsApp-safe payment link relay after identity verification.

### 16B.7 - Reconciliation and settlement

- Add Transaction Search and Reporting workflows.
- Import/sync reports.
- Match provider transactions to bookings.
- Surface exceptions.

### 16B.8 - Tokenization and saved cards

- Only if NetCommerce enables TMS and Oraya wants saved cards.
- Implement explicit consent, token storage, revocation, and token lifecycle management.

### 16B.9 - Fraud/risk and Decision Manager

- Confirm Decision Manager enablement.
- Surface `ACCEPT`, `REVIEW`, `REJECT`, and risk reason codes.
- Block capture on review until accepted.

### 16B.10 - Production rollout

- NetCommerce sandbox approval.
- Production credentials.
- Vercel Production env setup.
- Webhook/MLE production verification.
- Declined-card validation.
- Controlled live/payment-readiness test.
- Final code review and human merge/release decision.

## NetCommerce Questions

1. Is this merchant configured for authorization only, sale/automatic capture, or capture-on-request?
2. With the current Payments API request using `processingInformation.capture: true`, should Oraya expect `AUTHORIZED`, `CAPTURED`, or another status?
3. Should Oraya switch to auth-only and capture after admin confirmation, or is immediate capture the intended operating model?
4. Are captures enabled through API for this merchant?
5. Are authorization reversals enabled through API?
6. Are voids enabled through API, and what is the time window before settlement/batch submission?
7. Are refunds enabled through API?
8. Are partial refunds enabled through API?
9. What provider transaction ID should Oraya store for authorization, capture, sale, refund, void, and reversal?
10. Are webhooks enabled for this merchant?
11. Which webhook event types should Oraya subscribe to for Unified Checkout, payment authorization, capture, refund, void, failure, and settlement updates?
12. What MLE setup is required: key ID, private key handling, certificate ID, and rotation process?
13. What is the official declined-card sandbox vector or decline trigger?
14. Is tokenization / Token Management Service enabled?
15. If TMS is enabled, which token types should Oraya store for future guest-consented payments?
16. Is Decision Manager or any fraud/risk product enabled?
17. If fraud review is enabled, what statuses and webhooks indicate `REVIEW`, `ACCEPT`, or `REJECT`?
18. Is payer authentication / 3-D Secure enabled or required for this merchant?
19. Are digital wallets enabled inside Unified Checkout?
20. Are installments enabled for Lebanese cards or this acquiring setup?
21. Is recurring billing enabled, or irrelevant for this merchant?
22. Is CyberSource Pay by Link enabled for this merchant?
23. Is CyberSource Invoicing enabled, and should Oraya use it for event proposals/add-ons?
24. Is BIN Lookup enabled, and is it recommended for Oraya's use case?
25. How are settlement and reconciliation reports accessed: Business Center, Reporting API, Transaction Search, SFTP, or bank portal?
26. What settlement batch IDs, acquirer references, fees, and payout/deposit fields are available?
27. Which operations should Oraya perform by API versus through the NetCommerce/CyberSource portal?
28. What admin/payment actions require bank/provider approval?
29. What production credentials and activation process will be used?
30. Are there any Lebanon/Credit Libanais-specific currency, settlement, refund, or card-network constraints Oraya must model?

## Risks

- Captured payment before admin approval: current `capture: true` behavior may capture funds while the booking remains pending.
- Declined path unvalidated: attempted decline-style sandbox card authorized.
- Webhook gap: CyberSource MLE verification is not implemented, so asynchronous reconciliation is not production-ready.
- Manual refund risk: admin UI records refunds without provider execution.
- Generic booking PATCH risk: admin API can update provider link/session fields directly; future implementation should centralize provider state mutations.
- Data model compression risk: booking summary fields are not enough for refunds, captures, settlement, or audits.
- Production gate risk: a database `online_payment_enabled` toggle should not be the only production safety gate once production credentials exist.
- Settlement blind spot: payment success is not the same as settled funds.
- Role risk: all admin users currently share the same auth boundary.
- Saved-card risk: tokenization must not be added without explicit consent and token lifecycle management.

## Recommended Next Step

Do not expand production payment behavior until NetCommerce answers the capture/sale/auth, refund/void/capture, webhook/MLE, decline-vector, and settlement questions. The immediate next implementation should be a narrow 16B.2 provider-confirmation and webhook-design step:

1. Obtain the official declined-card sandbox vector.
2. Confirm whether PR #64 should remain sale/immediate-capture or switch to auth-only/manual capture.
3. Confirm required webhook/MLE event setup.
4. Decide the minimal data model for `payment_attempts`, `payment_transactions`, `payment_provider_events`, and `payment_audit_log`.
5. Only then implement provider-integrated admin operations.
