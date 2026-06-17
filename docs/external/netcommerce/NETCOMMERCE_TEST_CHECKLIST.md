# NetCommerce Sandbox Test Checklist

Use this checklist for Oraya PR #64 sandbox testing.

## Access

- [ ] Open the protected Vercel Preview link sent by email.
- [ ] Confirm the Preview site opens without requiring a Vercel account.
- [ ] Confirm `/book` loads.

## Approved Payment Path

- [ ] Create a sandbox booking through `/book`.
- [ ] Choose the pay-now path.
- [ ] Confirm the flow redirects to `/payments/checkout/[token]`.
- [ ] Confirm CyberSource Unified Checkout opens.
- [ ] Confirm the NetCommerce payment/security seal is visible.
- [ ] Complete an approved sandbox payment using sandbox card data only.
- [ ] Confirm the success page / return path is shown.
- [ ] Confirm Oraya records payment server-side after gateway approval.
- [ ] Confirm the booking remains pending for Oraya admin review.

## Declined Payment Path

- [ ] Provide Oraya with the official declined-card sandbox test vector or decline trigger.
- [ ] After Oraya receives the decline vector, test declined payment.
- [ ] Confirm declined payment does not mark the booking as paid.
- [ ] Confirm the guest can retry payment after a decline.

## Issue Reporting

- [ ] Report any gateway UI issue.
- [ ] Report any seal placement or wording issue.
- [ ] Report any failed session creation or authorization issue.
- [ ] Report any unexpected booking status behavior.
- [ ] Do not send live card data, production credentials, or sensitive gateway secrets in issue reports.
