# Oraya — NetCommerce Sandbox Testing Handoff

## Purpose

This document summarizes the Oraya NetCommerce / CyberSource Unified Checkout sandbox implementation prepared for NetCommerce external testing.

NetCommerce requested that Oraya:

- use the CyberSource Unified Checkout integration guideline
- use the sandbox merchant details
- add the NetCommerce payment/security seal on the website
- confirm readiness so NetCommerce can begin testing

## Environment

This handoff is for the Oraya PR #64 Vercel Preview environment only.

- Environment type: Vercel Preview / sandbox
- Pull request: https://github.com/Staleen/oraya-web/pull/64
- Gateway direction: NetCommerce / Credit Libanais / CyberSource Unified Checkout
- Production credentials: not used
- Production payments: not enabled
- Live card usage: not permitted

All testing must use CyberSource / NetCommerce sandbox credentials and approved sandbox test cards only. No live customer card data should be used in this environment.

## Preview Access

The protected Vercel Preview access link was sent directly by email. It is intentionally not stored in this repository.

If access fails, please reply to the email thread and Oraya will issue a fresh protected Preview access link.

## Implementation Completed

The PR #64 sandbox implementation includes:

- CyberSource Unified Checkout session creation for the Oraya Reserve pay-now flow
- loading of the CyberSource-returned Unified Checkout browser library
- hosted card entry inside the gateway-controlled checkout UI
- server-side CyberSource authorization after receipt of the transient token
- Oraya-side payment field updates only after server-side gateway approval
- NetCommerce payment/security seal placement on the checkout and payment information surfaces
- sandbox-only Preview configuration

No production payment activation is included in this handoff.

## Payment Flow Summary

1. Guest opens the Oraya Preview link.
2. Guest creates a test booking through `/book`.
3. Guest chooses the pay-now path.
4. Oraya creates the booking request first.
5. Oraya redirects the guest to `/payments/checkout/[token]`.
6. Oraya creates a CyberSource Unified Checkout capture context server-side.
7. CyberSource Unified Checkout opens in the browser.
8. Guest enters sandbox card details inside the gateway-controlled UI.
9. CyberSource returns a transient token to Oraya.
10. Oraya submits the transient token to CyberSource server-side for authorization.
11. Oraya records payment fields only after server-side approval.
12. Browser success/cancel return pages remain informational.

## What Was Tested Successfully

Oraya successfully validated the approved sandbox payment path:

- `/book` loaded in the Preview environment
- a sandbox booking request was created
- pay-now redirected to `/payments/checkout/[token]`
- CyberSource Unified Checkout session creation succeeded
- the hosted checkout UI loaded
- approved sandbox payment completed successfully
- server-side payment authorization succeeded
- Oraya payment fields updated after server-side approval
- booking status remained `PENDING`, as intended
- the NetCommerce payment/security seal rendered on the payment surfaces

## Server-Side Payment Authority

Oraya treats server-side gateway verification as the payment authority.

Browser redirects are informational only. A browser return to a success page does not, by itself, mark payment as received. Payment state is recorded only after Oraya receives server-side authorization and/or verified gateway notification.

For production rollout, webhook / message-level encryption verification and reconciliation must be completed before asynchronous gateway notifications are considered authoritative.

## Booking Status Behavior

After payment approval, `bookings.status` remains `PENDING` intentionally.

This is Oraya's operational model:

- online payment can be received during the Reserve flow
- Oraya still reviews and confirms the booking operationally
- admin confirmation is required before the booking becomes fully confirmed

This behavior is expected and should not be treated as a payment failure.

## NetCommerce Seal Placement

The official NetCommerce payment/security seal is included at:

- `public/payment/NCseal_M.png`

The seal is displayed on the Oraya checkout/payment surfaces together with this wording:

> Online payments are processed securely through NetCommerce Secure Payment Gateway.

## Items Requested From NetCommerce

Please provide:

- the official declined-card test vector or decline trigger for this sandbox merchant
- any additional sandbox card scenarios NetCommerce wants Oraya to validate
- any required webhook / callback / MLE configuration steps for production hardening
- confirmation when NetCommerce external sandbox testing is complete
- confirmation of any required wording or seal-placement changes before production approval

## Production Rollout Notes

This Preview handoff does not activate production payments.

Final production rollout requires:

- NetCommerce / Credit Libanais production approval
- production merchant credentials
- production gateway endpoint confirmation
- production webhook / callback / MLE verification
- final production environment variable setup in Vercel
- Oraya human approval to enable production payment settings
- final live rollout validation using bank-approved production procedures

Until those steps are complete, Oraya remains in sandbox / Preview testing mode only.

## Contact

Primary Oraya contact:

David Hourani
Oraya
