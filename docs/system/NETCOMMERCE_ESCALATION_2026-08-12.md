# NetCommerce escalation — merchant 06385000

One message covering three blockers. Send from the Oraya account contact.

---

**Subject:** Merchant 06385000 — Decision Manager rejecting all authorizations, plus Apple Pay and Transaction Search enablement

Hello,

Oraya (merchant ID `06385000`) is live on CyberSource Unified Checkout with
server-side authorization against `/pts/v2/payments`. Three items need your side.

## 1. Decision Manager rejects every authorization (reason 481)

Every issuer-approved authorization on this merchant is being rejected by
Decision Manager with reason **481**, so settlement never runs. We could not
turn the profile off from the Business Center, and had to send
`processingInformation.actionList: ["DECISION_SKIP"]` on every payment to take
money at all.

Examples (all issuer-approved, all DM-rejected):

- `7863958223886680704897` — 2026-08-10
- `7863969294066269704890` — 2026-08-10

Running live with fraud screening skipped is not acceptable to us as a standing
position. Please confirm:

- why the Decision Manager profile on `06385000` rejects 100% of authorizations;
- what the profile should be set to for a hotel/villa booking merchant;
- when we can re-enable screening without losing every payment.

## 2. Apple Pay enablement

We want Apple Pay on Unified Checkout. Our integration already requests
`APPLEPAY` in `allowedPaymentTypes` and is gated off until enrolment completes.
Please provide, for `06385000`:

- Apple Pay enrolment on the merchant profile (merchant identity certificate /
  payment processing certificate as CyberSource requires);
- the **domain association file** for `stayoraya.com`, which we will serve at
  `/.well-known/apple-developer-merchantid-domain-association`;
- confirmation of which domains you have registered, so preview and production
  are both covered.

## 3. Transaction Search entitlement

Refunds or voids performed directly in the Business Center are currently
invisible to our system, because the payment resource does not report follow-on
credits for this account. Please enable the **Transaction Search / Transaction
Details API** entitlement on `06385000` so we can reconcile our ledger against
your records automatically instead of by hand.

## 4. Settlement confirmation

Separately, please confirm the settlement and payout schedule for this merchant:
when a same-day capture joins the batch, and how long funds take to reach the
registered bank account. We have not yet observed a payout.

Thank you,
Oraya
