# Payment Integration Readiness

**Status:** Phase 16B readiness audit/update only. No live bank payment implementation in this file.

**Date:** 2026-06-03

**Branch:** `codex/phase-16b-payment-readiness`

**Production direction:** Credit Libanais / NetCommerce / MPGS hosted checkout. Stripe remains a local/dev test adapter only and is not the Oraya production path.

---

## Executive Summary

Current `origin/master` already contains a meaningful Phase 16B payment foundation: booking-side ledger columns, payment-link columns, provider-neutral runtime types, a hosted-checkout route, a webhook handler, admin readiness reporting, public payment settings, and a placeholder Credit Libanais / MPGS provider.

The foundation is correctly cautious: Credit Libanais / MPGS is modeled but intentionally refuses checkout and callback handling until official bank/NetCommerce/MPGS specs and credentials arrive. Browser redirects are treated as informational; verified server notification/webhook handling is the authority for payment state.

No payment runtime code should be expanded yet. The next implementation phase must wait for the bank/e-commerce partner spec pack.

---

## Current Master Payment Foundation

### Existing booking payment foundation

- `sql/phase-15i1-payment-foundation.sql` documents the earlier booking ledger columns: `payment_stage`, `amount_total`, `amount_due`, and `payment_last_at`, alongside existing payment fields such as `payment_status`, `amount_paid`, `deposit_amount`, and `payment_method`.
- `lib/payment-foundation.ts` computes payment totals and stages from stay totals or event proposal totals.
- Admin booking flows already show and update manual payment ledger information.

### Existing payment-link schema foundation

- `sql/phase-16b1-payment-link-foundation.sql` adds nullable payment-link columns on `bookings`:
  - `payment_link_url`
  - `payment_link_provider`
  - `payment_link_expires_at`
  - `payment_link_issued_at`
  - `payment_link_status`
  - `payment_provider_session_id`
- `sql/phase-16b4-credit-libanais-provider-compat.sql` widens the provider allow-list to include `credit_libanais` while preserving `manual`, `whish`, and `stripe`.
- Both SQL files are human-gated. They are not deployment automation.

### Existing routes

- `POST /api/payments/checkout`
  - Creates a hosted checkout session only after a booking row exists.
  - Requires `booking_id`, signed `booking_token`, and a payment purpose.
  - Validates pay-now availability through public payment settings.
  - Resolves the configured hosted-checkout provider.
  - Persists `payment_link_*` state after session creation.
- `GET /api/payments/readiness`
  - Admin-authenticated readiness summary.
  - Exposes non-secret provider status, missing requirements, and checkout readiness.
- `POST /api/payments/webhook/[provider]`
  - Generic provider callback route.
  - Delegates verification and event mapping to the selected provider adapter.
  - Updates booking payment state only after provider verification.
- `POST /api/payments/webhook/stripe`
  - Stripe compatibility shim for local/dev testing.

### Existing provider/runtime files

- `lib/payments/provider.ts`
  - Defines hosted-checkout provider contracts, payment-link statuses, provider keys, persisted provider values, currencies, purposes, provider events, and booking deltas.
- `lib/payments/runtime.ts`
  - Resolves `PAYMENT_PROVIDER`.
  - Allows only `credit_libanais` in production.
  - Defaults to Stripe only outside production.
  - Produces guest-safe and admin-safe readiness summaries.
- `lib/payments/credit-libanais.ts`
  - Placeholder-only production target adapter.
  - Records the expected contract surface.
  - Always reports `implemented: false` and `checkout_ready: false`.
  - Throws configuration/readiness errors for checkout and webhook verification.
- `lib/payments/stripe.ts`
  - Implemented Stripe Checkout adapter for dev/test only.
  - Creates Stripe Checkout sessions and verifies Stripe signatures.
  - Not approved for production.
- `lib/payments/webhook-handler.ts`
  - Shared webhook reconciliation.
  - Looks up bookings by `payment_provider_session_id`.
  - Uses provider deltas to set paid/expired/cancelled/failed states.
  - Guards final writes with `eq("payment_provider_session_id", ...)` for idempotency.
- `lib/payments/settings.ts`
  - Public payment-mode settings: `request_only`, `manual_payment`, `online_payment`, `hybrid`.
  - Deposit percentage, full/custom deposit switches, manual rails, instructions, provider display name, and online enablement.
- `lib/payments/checkout-amount.ts`, `lib/payments/domain.ts`, and `lib/payments/link-state.ts`
  - Amount validation, domain types, and payment-link state helpers.

### Existing settings/admin surfaces

- `/api/settings?key=payment_public_settings` returns only guest-safe payment settings plus runtime checkout readiness.
- `/admin/settings` reads `/api/payments/readiness` to show non-secret provider readiness.
- `/book` has a settings-driven Reserve path that can choose pay-now vs pay-later, but pay-now remains gated by `online_checkout_ready`.

---

## Old Commit `4f7086e` Review

### Files changed by `4f7086e`

- `app/api/payments/checkout/route.ts`
- `app/api/payments/create-session/route.ts`
- `app/api/settings/route.ts`
- `docs/system/ARCHITECTURE.md`
- `docs/system/CURRENT_PHASE.md`
- `docs/system/DECISIONS_LOG.md`
- `docs/system/PROJECT_STATE.md`
- `lib/payments/credit-libanais.ts`
- `lib/payments/mpgs.ts`
- `lib/payments/payment-state.ts`
- `lib/payments/runtime.ts`
- `lib/payments/settings.ts`
- `lib/payments/stripe.ts`

### What it attempted

The commit tried to polish naming and readiness vocabulary without implementing real bank checkout:

- Added `POST /api/payments/create-session` as an alias to the existing checkout handler.
- Added stable JSON error codes to `/api/payments/checkout`.
- Added `lib/payments/mpgs.ts` as an alias boundary for the Credit Libanais production provider.
- Added `lib/payments/payment-state.ts` with a target provider-neutral lifecycle vocabulary.
- Changed placeholder copy from "setup is in progress" to clearer "secure card payment is not available yet" messaging.
- Updated system docs to describe `/api/payments/create-session` as the production-facing route name.

### Useful parts

- The clearer guest/admin placeholder copy is useful later because it avoids implying card payment is almost live.
- A stable error code such as `provider_not_configured` may be useful later for UI handling and monitoring.
- The MPGS module boundary may be useful after specs arrive if the bank documents the integration as MPGS rather than Credit Libanais-specific.
- A provider-neutral lifecycle vocabulary is directionally useful, but should only be introduced when it is actually consumed by schema or runtime code.

### Risky parts

- Adding `/api/payments/create-session` creates a second public payment route name before the bank contract exists. Current master already uses `/api/payments/checkout`; introducing an alias now increases route vocabulary without functional benefit.
- `lib/payments/payment-state.ts` adds lifecycle states not consumed by the database or runtime. That can create false confidence that refunds, authorization, partial refunds, and add-on payment states are implemented.
- `lib/payments/mpgs.ts` aliases the placeholder Credit Libanais adapter before the real MPGS contract is known. That may blur whether the implementation is bank-specific, NetCommerce-specific, MPGS-native, or a bank-hosted wrapper.
- Docs in the old commit imply the `create-session` name is authoritative, but current master and `/book` still call `/api/payments/checkout`.

### Recommendation

Do not cherry-pick `4f7086e` now. Keep it as reference only.

Later, after the bank spec pack arrives, selectively reintroduce only the parts that match the official contract:

- clearer unavailable-payment copy,
- stable machine-readable checkout error codes,
- possibly an MPGS module boundary,
- possibly a lifecycle vocabulary if paired with approved schema/runtime usage.

---

## Required Bank / NetCommerce / MPGS Specs Still Missing

Oraya should not implement real Credit Libanais / NetCommerce / MPGS checkout until the following are received and reviewed:

1. Merchant identifiers
   - Merchant ID / merchant name / terminal ID if applicable.
   - Whether credentials differ between sandbox and live.
   - Whether the merchant is onboarded as an individual and any constraints that follow from that.

2. Hosted Checkout session creation
   - Exact base URL and endpoint path.
   - HTTP method.
   - Request body format.
   - Required fields for amount, currency, merchant reference, order ID, return URL, cancel URL, notification URL, description, customer data, and expiry.
   - Whether idempotency keys or duplicate merchant references are supported.

3. Authentication and request signing
   - Auth type: API key, basic auth, HMAC, JWT, certificate, shared secret, or MPGS-specific auth.
   - Header names and canonical signing string.
   - Hash algorithm and encoding.
   - Timestamp/nonce requirements.
   - Replay window.

4. Hosted Checkout response contract
   - Field containing hosted payment URL.
   - Field containing provider session/order/transaction ID.
   - Expiry field and timezone.
   - Error shape and provider error codes.

5. Browser return contract
   - Success URL parameters.
   - Cancel/failure URL parameters.
   - Whether any return parameters are signed.
   - Confirmation that browser redirect is not authoritative for payment status.

6. Server notification / webhook contract
   - Notification URL format.
   - Event types and status values.
   - Signature verification method.
   - Raw body requirements.
   - Retry behavior.
   - Duplicate event behavior.
   - Whether events include full amount, currency, merchant reference, and transaction/session ID.

7. Payment status lookup
   - Endpoint to query transaction/session/order status.
   - Required auth.
   - Response statuses.
   - Whether status lookup is required for reconciliation if notifications fail.

8. Capture, authorization, refund, and void behavior
   - Whether hosted checkout is sale/capture only or supports authorization then capture.
   - Refund endpoint, refund notification event, and partial refund support.
   - Chargeback/dispute reporting, if any.

9. Currency and settlement
   - USD support.
   - LBP support, if any.
   - Fresh USD settlement rules.
   - Decimal precision/minimum amount.
   - Fees, settlement delays, and reconciliation reports.

10. Environment and operational details
    - Sandbox credentials.
    - Live credentials.
    - Allowed origins / IP allow-list requirements.
    - TLS/certificate requirements.
    - PCI/compliance constraints.
    - Provider support contact and escalation process.

---

## What Must Not Be Implemented Yet

- Do not implement real Credit Libanais / NetCommerce / MPGS checkout calls before the official spec pack arrives.
- Do not trust browser success redirects as payment confirmation.
- Do not mark `payment_status`, `payment_stage`, `amount_paid`, or `amount_due` from client-side signals.
- Do not alter `app/api/bookings` or booking creation logic for payment execution.
- Do not add new schema/migrations before specs confirm the necessary fields.
- Do not add dependencies or SDKs before the provider contract proves they are needed.
- Do not expose provider secrets through `NEXT_PUBLIC_*` variables or public settings routes.
- Do not promote Stripe as production path.
- Do not implement refunds, authorization/capture, chargebacks, or add-on payment states until their provider semantics are known.
- Do not create a second public payment route name unless there is a specific compatibility reason.
- Do not let WhatsApp/Butler generate or confirm payment links independently of the website backend and verified server notification.

---

## Recommended Implementation Sequence After Bank Specs Arrive

1. Spec reconciliation
   - Compare the official bank/NetCommerce/MPGS documents against `lib/payments/provider.ts`.
   - Decide whether the concrete file should be `credit-libanais.ts`, `mpgs.ts`, or both with one re-exporting the other.
   - Update this readiness document and `ENVIRONMENT_MAP.md` with exact credential names and callback requirements.

2. Contract tests and fixtures
   - Add sanitized request/response fixtures from the bank sandbox docs.
   - Add tests for signature generation, callback verification, status mapping, and amount/currency formatting.
   - Keep all secrets mocked.

3. Implement provider adapter behind readiness gates
   - Implement session creation in the Credit Libanais / MPGS adapter.
   - Keep `checkout_ready` false unless all required env and spec-driven fields are present.
   - Preserve production enforcement that `PAYMENT_PROVIDER` must be `credit_libanais`.

4. Implement verified callback handling
   - Verify raw-body signatures before parsing/trusting the payload.
   - Map provider statuses into existing `PaymentProviderEvent` values.
   - Confirm idempotency on provider session/order ID.
   - Treat browser redirect as informational only.

5. Sandbox end-to-end validation
   - Use sandbox credentials to validate hosted checkout creation, cancel return, failed payment, success notification, duplicate notification, expired session, and status lookup.
   - Confirm database updates and guest/admin displays.

6. Production readiness gate
   - Confirm Credit Libanais/NetCommerce live credentials, webhook URL registration, settlement account, supported currencies, and operational contacts.
   - Confirm online payment is still disabled in public settings until live checkout has passed a controlled test.

7. Controlled launch
   - Enable online payment for a narrow Reserve path only.
   - Monitor readiness output, server logs, payment state transitions, and bank settlement reports.
   - Expand only after reconciliation is proven.

---

## Risk Notes

- The codebase already contains Stripe dev/test checkout. Keep it isolated; production must remain Credit Libanais / MPGS.
- The Credit Libanais adapter currently has placeholder env names and requirement strings. Those may need to change once NetCommerce/MPGS sends the official credential names.
- Current master uses `/api/payments/checkout`; changing route names should be treated as a compatibility decision, not a cleanup.
- The payment-link database constraint must include `credit_libanais` before any live bank session can persist its provider key.
- Payment state correctness depends on verified server notification and idempotent provider session IDs, not on guest redirect URLs.
