# Phase 16B - Oraya Payment System Mission

**Owner decision date:** 2026-08-09

**Status:** approved product scope; implementation remains incremental and production-gated

**Authority:** this mission supersedes older Phase 16B language that treats the phase as only NetCommerce/CyberSource hosted card checkout or excludes member saved cards from the phase.

## Mission

Phase 16B delivers Oraya's complete business payment system. NetCommerce/CyberSource is one provider workstream inside the phase; it is not the definition of the phase.

The finished system must let Oraya:

- collect during the website booking journey;
- request a deposit, balance, add-on, damage charge, event payment, or other amount after a booking exists;
- create a secure standalone Oraya payment link for a caller or WhatsApp contact who has no website booking;
- receive and record cash, bank transfer, cards, Apple Pay, Whish, OMT Pay, Western Union, and the provider the owner called "Sunbook Pay";
- support partial and multiple payments against the same request;
- preserve an auditable history of receipts, refunds, reversals, fees, references, and operator actions;
- support members saving a card later, using provider tokenization and explicit consent, without Oraya storing card numbers or CVV.

Production activation remains a separate, deliberate decision for each integrated provider. Documenting a method in this mission does not assert that its merchant API, contract, credentials, settlement, refunds, or webhook security are already available.

## Current reality

The repository currently has a strong but narrow card-payment foundation:

- booking-linked payment summary and payment-link fields on `bookings`;
- manual booking payment actions in operations;
- a durable `payment_attempts` state machine for NetCommerce/CyberSource calls;
- Unified Checkout sandbox support and the Phase 16B-2B1 JWT/JWS plus payment request/response MLE implementation;
- server-authoritative card outcomes, informational browser returns, and a fail-closed production switch.

It does not yet have a complete payment operating system. In particular, there is no durable standalone payment-request object, no multi-transaction business ledger, no provider-event ledger, no saved-card instrument/consent model, and no complete cash receipt/correction flow. The `bookings.amount_*` and `bookings.payment_*` fields are useful summaries, but one mutable booking row cannot be the long-term history of every money movement.

## Canonical model

The implementation must separate the following concepts.

### 1. Payment request - what Oraya asks someone to pay

A `payment_request` may belong to a booking, but `booking_id` is optional. It contains:

- opaque public token and safe public URL;
- payer name and optional phone/email;
- amount and currency;
- purpose (`deposit`, `balance`, `full`, `addon`, `event`, `damage`, `other`);
- optional booking link and human-readable description;
- allowed payment methods;
- issue and expiry times;
- status: `draft`, `active`, `partially_paid`, `paid`, `expired`, or `cancelled`;
- creator and audit timestamps.

This object is the basis for both booking-linked requests and standalone links. An administrator can copy it, send it by WhatsApp/email, cancel it, or later associate it with a booking. Public tokens must be unguessable and must never expose internal/admin credentials.

### 2. Payment transaction - what actually happened to money

Each receipt, refund, reversal, or correction is an immutable ledger transaction. It may reference a payment request, a booking, both, or neither where an operator is recording an unmatched receipt for later reconciliation.

Minimum fields include:

- type: `payment`, `refund`, `reversal`, or `adjustment`;
- status: `pending`, `confirmed`, `failed`, `reversed`, or `refunded`;
- amount and currency;
- method, provider, and optional wallet presentation;
- provider or manual receipt reference;
- gross amount, fee, and net amount when available;
- received/effective time;
- verified source (`provider`, `operator`, or future reconciliation import);
- actor, note, and audit timestamps.

Confirmed history is corrected by a linked reversal or adjustment, never silently edited or deleted. Booking payment columns become derived/cache summaries and are not the only ledger.

### 3. Provider attempt and event records

The existing `payment_attempts` table remains the idempotency and ambiguous-outcome boundary for provider calls. It should eventually reference a payment request as well as a booking.

Verified asynchronous messages belong in a durable `payment_provider_events` ledger with provider event ID, receipt time, verification result, processing result, replay key, and safe metadata. A browser redirect is never proof of payment.

### 4. Saved payment instrument

Member saved cards are in Phase 16B product scope as a later workstream. Oraya stores provider tokens and display metadata only, for example brand, last four digits, expiry display, consent version/time, member ID, and revoked time. Oraya must never store PAN or CVV.

Saving a card requires:

- member authentication;
- explicit opt-in consent;
- NetCommerce/CyberSource TMS or another approved provider tokenization contract;
- a revoke/delete flow;
- a clear policy for customer-initiated reuse versus merchant-initiated charges;
- security, legal, and operational approval before activation.

The earlier NetCommerce launch decision to omit "Save card" remains valid for the current one-time-card launch. It is no longer a permanent exclusion from Phase 16B.

### 5. Method, provider, and presentation are different fields

Do not collapse all three into one label.

| Example | Method | Provider/rail | Presentation |
|---|---|---|---|
| Notes handed to staff | cash | manual | cash |
| Visa entered in Unified Checkout | card | Credit Libanais / CyberSource | card form |
| Apple Pay through Unified Checkout | card | Credit Libanais / CyberSource | Apple Pay |
| Whish wallet checkout | wallet | Whish | Whish Pay |
| OMT wallet receipt | wallet | OMT | OMT Pay |
| Western Union transfer | transfer | Western Union | transfer/reference |

This keeps settlement and reconciliation accurate. Apple Pay is a wallet presentation over a card-processing provider, while OMT Pay and Western Union are distinct rails even when OMT offers Western Union services.

## Required business scenarios

### Scenario A - cash first

1. An operator opens a booking/payment request, or starts a standalone receipt.
2. The operator records amount, currency, payer, purpose, received time, receipt/reference, and an optional note.
3. Oraya creates a confirmed cash transaction and records the staff actor.
4. If linked, Oraya recalculates the request and booking summaries (`partially_paid` or `paid`).
5. Oraya produces a receipt/confirmation that can be copied or sent.
6. A mistake is corrected by an auditable reversal/adjustment, not by overwriting history.

Cash must support deposits, balances, multiple installments, overpayment warnings, USD/LBP, and end-of-period reconciliation. No provider verification is implied; the authenticated operator is the authority.

### Scenario B - standalone Oraya payment link

1. A person calls or messages Oraya without using the website.
2. An operator enters payer details, description/purpose, amount, currency, expiry, and allowed methods.
3. Oraya creates one safe `/pay/<opaque-token>` front door that does not require an account or booking.
4. The operator copies or sends the link by WhatsApp/email.
5. The payer chooses an available method. Integrated methods open their verified checkout; manual methods display approved instructions and reference requirements.
6. Oraya records the resulting transaction and updates the request to partially paid or paid.
7. Operations can later link the request to a booking, cancel it, reissue it, send a reminder, or reconcile it.

The Oraya link should remain the customer-facing front door even when a provider also offers its own payment-link product, so Oraya retains consistent status, branding, expiry, and audit history.

### Scenario C - website card/debit-card payment

The booking `Pay now` action and an operations-generated later payment link use the same payment-request/transaction model. NetCommerce/CyberSource Unified Checkout remains the hosted card collector. Existing server authority, idempotency, ambiguous-outcome blocking, amount/currency checks, and booking/payment-state separation remain mandatory.

### Scenario D - Apple Pay

Apple Pay is enabled as a wallet presentation within an approved hosted checkout/provider configuration, not implemented as an unrelated ledger. It requires provider enablement plus Apple domain verification/certificates and must use the same payment request, attempt, transaction, webhook, refund, and reconciliation controls as cards.

### Scenario E - Whish

- Initial mode: authenticated staff can record a Whish receipt/reference as a manual transaction.
- Integrated mode: enable Whish Pay only after Oraya has merchant credentials, official integration documentation, verified callbacks, refund/cancellation behavior, fees, currency, and settlement terms.
- Whish-generated links may be associated with an Oraya request when useful, but the Oraya link remains the preferred customer-facing entry point.

### Scenario F - OMT Pay and Western Union

Treat these as separate methods:

- OMT Pay wallet/merchant payment;
- Western Union transfer received through the applicable service/agent process.

Both begin as manual receipt/reference workflows. Native online integration is gated on an Oraya merchant agreement and official API/callback, refund, fee, currency, and settlement documentation. Public consumer features alone are not proof that an API is available to Oraya.

### Scenario G - "Sunbook Pay" provider (name not confirmed)

No official Lebanese payment provider named "Sunbook Pay" was verified. The likely intended provider is **Suyool**, whose official public materials describe consumer payment links and merchant payment tools. The code and permanent labels must not assume this correction until the owner confirms the exact provider name.

Until confirmed and contracted, this is a provisional manual rail. Native integration requires the same merchant/API, callback, refund, fee, currency, and settlement checks as other wallets.

### Scenario H - saved card for a member

1. A signed-in member explicitly chooses to save a card during an eligible provider checkout.
2. The provider tokenizes it; Oraya receives no reusable raw card data.
3. Oraya stores the provider token reference, safe display metadata, consent, ownership, and lifecycle status.
4. A later customer-initiated payment lets the member select that instrument and approve the specific amount.
5. The member can revoke it. Provider and Oraya state are reconciled.

Recurring or merchant-initiated charges are not implied by a saved card and need a separately approved consent and operating policy.

## Delivery sequence

Each stage is a separate small branch/PR with tests and a human-run migration where required. No stage silently activates a live provider.

1. **16B-F1 - ledger and request foundation.** Add payment requests, transactions, audit rules, statuses, permissions, projections, and additive migration/backfill design.
2. **16B-F2 - cash and manual receipts.** Build the complete operator cash flow first, including partial payment, receipt, reversal, and booking summary projection. Extend the same flow to bank transfer/manual Whish/OMT/Western Union/provisional Suyool.
3. **16B-F3 - standalone Oraya links.** Add operations creation, `/pay/<token>`, copy/send, expiry/cancel/reminder, optional booking association, and method selection.
4. **16B-NC - NetCommerce production completion.** Finish the already active CyberSource workstream: production webhook JWE/signature/replay contract, subscription, credentials, migrations, declined-card and reconciliation validation, email lifecycle, and controlled activation.
5. **16B-CARD - unified booking and operations card collection.** Route website checkout and later/standalone links through the canonical request ledger; support deposits, balances, add-ons, and event payments.
6. **16B-APPLE - Apple Pay.** Complete provider enablement, Apple domain verification/certificate, device/browser tests, webhook/refund/reconciliation tests, then gated activation.
7. **16B-WALLET - Whish, OMT/WU, and confirmed Suyool workstreams.** Integrate providers independently only when their contracts are verified; retain manual fallback.
8. **16B-TMS - member saved cards.** Implement explicit-consent tokenized instruments, member management, reuse, revoke, and security/legal approval.
9. **16B-OPS - settlement, reconciliation, refunds, reporting, and controlled rollout.** Provider/manual matching, fee/net reporting, unmatched-item queue, exports, permissions, alerts, and runbooks.

PR #109 / Phase 16B-2B1 remains a valid completed security increment within step 4. Its JWT/JWS and MLE work must be preserved; redefining the umbrella does not discard or duplicate it.

## Definition of done

Phase 16B is complete only when:

- booking-linked and standalone payment requests work;
- cash works end to end and every other approved method is either integrated or explicitly supported as a truthful manual workflow;
- every money movement has an immutable, attributable ledger record;
- partial payments, multiple payments, refunds, reversals, fees, and remaining balances reconcile correctly;
- browser returns cannot create payment truth;
- integrated provider events are authenticated, replay-safe, idempotent, and reconcilable;
- operations can issue, send, expire, cancel, receipt, and reconcile requests;
- members can save and revoke provider-tokenized cards with explicit consent, if the saved-card workstream receives final activation approval;
- Oraya stores no PAN/CVV or provider secrets in public/client data;
- permissions and audit logs cover money-changing actions;
- each provider has tested failure, decline, timeout/ambiguous, refund, and settlement paths;
- activation is deliberate, reversible, and independently gated per provider.

## Provider evidence and gates

The product plan is based on public official capabilities, but implementation still requires Oraya-specific merchant approval and technical documentation:

- CyberSource Unified Checkout and Apple Pay: <https://developer.cybersource.com/content/dam/docs/cybs/en-us/unified-checkout/developer/all/rest/unified-checkout.pdf>
- OMT Pay consumer/merchant-facing capabilities: <https://omt.com.lb/en/omt-pay>
- OMT agent/merchant onboarding: <https://www.omt.com.lb/en/agent>
- Whish app and Whish Pay: <https://www.whish.money/whish-app>
- Whish payment-link information: <https://www.whish.money/app/faq>
- Suyool payment links (provisional name match only): <https://suyool.com/receive-money>
- Suyool merchant tools (provisional name match only): <https://suyool.com/omnichannel>

## Non-negotiable safety rules

- No payment provider is activated merely because this mission lists it.
- No payment is marked received from a redirect, screenshot, or unverified provider message.
- Manual payments identify the authenticated operator as the authority and preserve the receipt/reference evidence.
- No raw card number, CVV, private key, shared secret, capture context, or reusable checkout token is logged or stored in public/application records.
- Existing Phase 16B-2A and 2B1 duplicate-charge, monotonic-state, JWT/JWS, and MLE protections stay intact.
- Additive migrations are human-run and production remains fail-closed until explicitly approved.
- Booking approval and payment receipt remain separate business states.
