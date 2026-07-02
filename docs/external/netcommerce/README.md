# NetCommerce Handoff Docs

This folder contains vendor handoff documentation for Oraya's NetCommerce / CyberSource Unified Checkout sandbox testing.

These files are intended to help NetCommerce testers understand the PR #64 Preview testing flow, expected booking behavior, and remaining open test items.

## Safety Rules

- The real protected Vercel Preview share link is sent by email only.
- Do not commit protected Preview share links.
- Do not commit `_vercel_share` URLs.
- Do not commit payment credentials, merchant IDs, key IDs, shared secrets, capture contexts, transient tokens, signed booking URLs, or card numbers.
- Do not use production card data in sandbox testing.
- Do not use production credentials for PR #64 Preview validation.

## Files

- `NETCOMMERCE_SANDBOX_TESTING_HANDOFF.md` - vendor-facing handoff summary.
- `NETCOMMERCE_TEST_CHECKLIST.md` - testing checklist for NetCommerce.
- `netcommerce-handoff-email.txt` - copy-ready email body with a private-link placeholder.
