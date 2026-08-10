# Phase 16B - Card Production Activation Mission

**Owner decision date:** 2026-08-09  
**Status:** active  
**Scope:** NetCommerce / CyberSource Unified Checkout one-time Visa and Mastercard payments  
**Baseline:** `master` at `e637bd2` (PR #115)

## Verified starting facts

These facts are complete and must not be reopened as future onboarding work:

- NetCommerce completed the approved CyberSource sandbox test.
- NetCommerce activated Oraya's live merchant account for Visa and Mastercard.
- Unified Checkout is enabled for Oraya's production website.
- CyberSource created the production Business Center organization and sent the owner an administrator-registration invitation.
- NetCommerce supplied the production API host and instructed the owner to create production REST Shared Secret credentials in Business Center.
- The Oraya card application, payment-request bridge, immutable provider ledger, JWT/JWS, request/response MLE, verified webhook receiver, replay protection, reconciliation queue, and fail-closed live switch are implemented and deployed.
- Production Vercel now contains the CyberSource session, Payments MLE, and webhook security variables as hidden/sensitive values. Live Supabase still has no enabled `payments_live_enabled` row, so real charging remains deliberately off.

NetCommerce onboarding and merchant activation are **complete**. The remaining mission is Oraya-owned production credential configuration, webhook subscription, controlled verification, and activation.

## Mission outcome

Make one-time Visa and Mastercard payments operational through Oraya without weakening the existing safety controls. Completion requires direct evidence that a controlled real payment:

1. is authorized exactly once by CyberSource;
2. is recorded exactly once in Oraya's immutable transaction ledger;
3. updates the correct payment request and, when applicable, booking projection;
4. is confirmed by a verified, encrypted, replay-safe webhook;
5. is visible and reconcilable in operations and CyberSource Business Center;
6. can follow the approved refund procedure; and
7. appears correctly in remittance/settlement evidence.

Application tests, a successful deployment, provider activation email, or a browser success page alone do not satisfy this outcome.

## Seven-step execution plan

### 1. Reconcile and lock the baseline

**Status:** complete on 2026-08-09

- Start from current remote `master`; do not reuse a merged branch.
- Treat NetCommerce onboarding and live merchant activation as verified complete.
- Confirm production remains fail-closed before any credential work.
- Preserve PRs #109, #112, #113, #114, and #115; do not duplicate their implementation.
- Record this mission in the canonical Phase 16B documents.

**Evidence:** remote `master` commit, production health/readiness response, Vercel variable-name inventory without values, and live-switch state.

### 2. Establish Business Center access and inventory production security material

**Status:** complete on 2026-08-09

**Owner action:** complete or renew the CyberSource administrator invitation, sign in, retain account recovery access, and generate/download production credentials when instructed. Passwords, shared secrets, private keys, card data, and downloaded credential files must never be pasted into chat, committed, photographed, or emailed.

**Codex action:** guide the authenticated owner through the current CyberSource menus and map each value directly to its server-only destination without displaying secret values.

Required inventory:

- REST Shared Secret key ID and secret;
- CyberSource request-MLE public certificate and key ID;
- Oraya response-MLE private key and key ID;
- webhook MLE certificate/private key identifiers;
- separate webhook digital-signature key ID and secret;
- production product/event permissions required for Unified Checkout and Payments webhooks.

**Exit evidence:** Business Center administrator access is active; the compromised initial REST key was revoked and replaced; REST, request/response MLE, webhook MLE, and webhook digital-signature material was generated or registered; CyberSource's production product inventory exposes `unifiedCheckout` / `uc.orders.transactionresults`; zero existing subscriptions were confirmed; no secret is present in Git or chat.

### 3. Configure production while charging stays off

**Status:** complete on 2026-08-09

- Enter the complete production configuration directly into Vercel Production scope.
- Keep Apple Pay absent/false.
- Keep the database `payments_live_enabled` switch off.
- Redeploy from unchanged, reviewed `master` unless a narrowly scoped correction is required.
- Prove that the kill switch still prevents guest payment execution even with credentials present.

**Exit evidence:** Vercel confirms required variable names exist without exposing values; deployment is healthy; readiness identifies production configuration; checkout remains fail-closed because the live switch is off.

### 4. Configure and prove production webhooks

**Status:** in progress; production subscription created and awaiting CyberSource URL approval

- Generate the separate CyberSource webhook digital-signature key.
- Register the production webhook MLE certificate/key as required.
- Create the production subscription for the supported Unified Checkout/payment events against Oraya's exact production webhook and health-check URLs.
- Prove JWE decryption, timestamped signature verification, key-ID matching, durable replay claiming, idempotent processing, and rejection of invalid/replayed messages.

**Exit evidence:** CyberSource subscription ID/status, successful health check, one verified delivery recorded by Oraya, and safe rejection/replay test results. Secret values are excluded from evidence.

**Current evidence (2026-08-09):** PR #116 is merged and deployed. CyberSource accepted exactly one production `unifiedCheckout` / `uc.orders.transactionresults` subscription for Oraya and returned `PENDING_REVIEW`; the official status lookup still returns `PENDING_REVIEW`. Both `GET` and `POST` to `https://www.stayoraya.com/api/health` return HTTP 200. No delivered provider test notification exists yet, so this step remains incomplete and the live switch stays off.

**Update (2026-08-10):** the subscription status lookup returned `ACTIVE`, and the provider-side subscription configuration test passed (`subscription_configuration_test=passed`, product `unifiedCheckout`, event `uc.orders.transactionresults`). Three real test deliveries reached the production webhook endpoint but were refused 401 `webhook_mle_missing_jwe`: CyberSource's product registry for org 06385000 reports `payloadEncryption: false` for this event and delivers signed plaintext, while the deployed receiver required JWE. NetCommerce's CTO confirmed nothing further is required provider-side. Per the owner's decision (DECISIONS_LOG 2026-08-10), the receiver now accepts signature-verified plaintext per the org contract. Remaining step-4 exit evidence: after that change deploys, re-run the configuration test and record one verified, replay-claimed delivery in `payment_provider_events`. The live switch stays off.

### 5. Run non-charging production-readiness verification

**Status:** in progress; production capture-context smoke passed, full verification awaits step 4

- Create a production capture context without submitting card data.
- Render Unified Checkout on the effective production checkout host.
- Verify origin/domain, return/cancel behavior, server-only configuration, public error redaction, operations readiness, reconciliation queue, monitoring, and emergency kill switch.
- Re-run focused payment/security tests, type checking, lint/build, production health, and mobile/desktop checkout inspection.

**Exit evidence:** signed test report showing no charge was attempted, no secret leaked, checkout rendered from CyberSource, and every safety gate passed.

### 6. Perform one controlled real-card transaction

**Status:** pending steps 2-5 and owner presence

**Owner action:** authorize a small amount and enter the real card only inside the CyberSource-hosted fields. Card number, CVV, OTP, and banking credentials are never shared with Codex or Oraya.

**Codex action:** open the live switch only for the approved test window, observe non-secret application/provider evidence, and close the switch immediately if any result is unknown or inconsistent.

Verify:

- exactly one provider transaction/request ID;
- correct amount and currency;
- exactly one Oraya payment attempt and provider transaction;
- verified webhook receipt and idempotent replay behavior;
- correct request, booking and operations projections;
- safe guest success message; and
- no duplicate authorization after refresh, return replay, or repeated click.

**Exit evidence:** owner-confirmed card transaction, redacted CyberSource record, Oraya ledger/operations record, and verified webhook event all agree.

### 7. Prove refund/reconciliation/settlement and activate deliberately

**Status:** pending step 6

- Exercise the approved refund procedure and record the CyberSource reference in Oraya.
- Confirm the resulting provider and Oraya states reconcile.
- Preserve or perform a separately approved small transaction long enough to confirm remittance/settlement evidence where required.
- Resolve every material discrepancy before broad activation.
- Enable live card payments deliberately, verify the kill switch remains reversible, monitor the first live period, and update all source-of-truth documents with evidence and operating instructions.

**Exit evidence:** refund evidence, reconciliation result, settlement/remittance evidence, live health/readiness, owner approval, monitoring result, and final documentation commit/PR.

## Progress rules

- A step moves to complete only when its exit evidence exists.
- Unknown provider outcomes are not retried; they enter reconciliation.
- No secret value or card data may appear in source control, chat, screenshots, logs, test fixtures, or documentation.
- The live switch stays off except during an explicitly approved test window or after final activation approval.
- Apple Pay, saved cards, and native Whish/OMT/Suyool integrations remain separately gated and cannot be inferred from card activation.
- If CyberSource's live behavior differs from documentation, preserve the safe disabled state and record the exact evidence before changing code.

## Current next action

The subscription is `ACTIVE` (2026-08-10). Merge and deploy the org-contract webhook change (signature-verified plaintext acceptance, DECISIONS_LOG 2026-08-10), then re-run the helper's `verify-subscription` configuration test and confirm one verified, replay-claimed delivery row in `payment_provider_events` with `payload_encrypted` recorded. That completes step 4. Then finish step-5 verification and schedule the step-6 controlled real-card window with the owner present. The live switch stays off until that step-6 window is explicitly approved. Watch for retry-policy auto-deactivation from the earlier refused deliveries; if the subscription reports `INACTIVE`, reactivate the existing subscription — never create a duplicate.
