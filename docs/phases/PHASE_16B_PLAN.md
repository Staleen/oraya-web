# Phase 16B — Payment Processing + Refunds (Architecture Plan)

**Status:** ⏳ provisioned, no implementation. This file is **planning context only**. No code lands until a Phase 16B kickoff task is approved.

**Audience:** future Claude / Codex / Cursor sessions executing Phase 16B work, plus humans approving each PR-safe sub-phase.

**Authority order:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) > [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) > [/docs/system/DECISIONS_LOG.md](../system/DECISIONS_LOG.md) > this file. If this file conflicts with any of those, the more conservative reading wins.

**Last updated:** 2026-05-18.

---

## 0. Scope and non-goals

**In scope:**

- Payment state model on `bookings` (existing columns + targeted additions).
- Payment provider abstraction (`lib/payments/*`), provider-agnostic.
- Payment link lifecycle (generation, display, expiration, status sync).
- WhatsApp payment-reply branching by booking status (consumed by Phase 16A's Butler surface).
- Admin payment workflow (trigger / refresh links, mark received, attach reference).
- Guest payment view on `/booking/view/[token]`.
- Refund / cancellation auditing (manual first, automated later).

**Explicitly NOT in this phase:**

- ❌ Smart-lock PIN issuance, access-code delivery, gate-code generation — **Phase 16D**.
- ❌ Member ↔ phone linkage / verified guest identity from WhatsApp — later phase.
- ❌ Membership points / rewards — Phase 16E.
- ❌ Booking schema-rewrite or new booking state model — out of scope; we layer on top of `bookings`.
- ❌ Migrating the locked `/api/bookings` POST overlap / pricing / addon pipeline.
- ❌ Replacing the existing `payment_status` / `payment_stage` / `payment_method` / `amount_*` columns introduced in Phase 13L.1 / 15I.1.
- ❌ Introducing chargebacks, dispute handling, or PCI-DSS-card-storage flows in the first iteration.

The 8-character booking reference (`bookings.id` first 8 chars, uppercased) shown on `/booking/view/[token]` continues to be a **public support code**, not an access PIN. Phase 16B does not introduce an access PIN.

---

## 1. Payment state model

### 1.1 What exists today (verified 2026-05-18)

Confirmed in repo via `/api/admin/bookings/[id]/route.ts`, `/api/admin/data/route.ts`, `/app/booking/view/[token]/page.tsx`, and `lib/payment-foundation.ts`:

- **Status columns:**
  - `payment_status` — allow-listed: `unpaid` / `payment_requested` / `deposit_paid` / `paid_in_full`. Nullable.
  - `payment_stage` — allow-listed: `none` / `unpaid` / `partially_paid` / `fully_paid`. Computed from amounts via `derivePaymentFoundationStage`.
  - `payment_method` — allow-listed: `whish` / `cash` / `bank_transfer` / `card_manual` / `other`. Manual ledger only — no provider integration today.
- **Amount columns:**
  - `amount_total` — contract total (event proposal total when event, else stay estimated total).
  - `amount_paid` — sum of received payments.
  - `amount_due` — derived as `amount_total - amount_paid`.
  - `deposit_amount` — requested deposit, manual.
  - `payment_last_at` — timestamp of last payment ledger movement.
- **Reference + timestamp columns:**
  - `payment_reference` — free-form text; Whish receipt / bank transfer reference number.
  - `payment_requested_at`, `payment_received_at`, `payment_due_at` — manual lifecycle timestamps.
  - `payment_notes`, `payment_marked_by` — admin audit fields.
- **Refund columns:**
  - `refund_status` — allow-listed: `refund_pending` / `partial_refund` / `refunded`.
  - `refund_amount`, `refunded_at` — manual.

Existing transactional emails: `lib/send-booking-payment-email.ts` already formats a payment-confirmed message including `payment_reference` and computed remaining balance.

### 1.2 What is missing

To support a payment-link lifecycle (whether automated or manually generated), we need:

- **`payment_link_url`** — current live payment link the guest can click (Whish web-link, Stripe Checkout session URL, etc.).
- **`payment_link_provider`** — `whish` / `stripe` / `manual_invoice` / etc. — required because providers differ in expiry semantics.
- **`payment_link_expires_at`** — provider-issued expiration. Used by `/booking/view/[token]` and the WhatsApp reply to know whether the link is still valid.
- **`payment_link_issued_at`** — issue timestamp.
- **`payment_link_status`** — allow-listed: `none` / `active` / `paid` / `expired` / `cancelled` / `failed`. Distinct from `payment_status` because a link can expire without the booking being unpaid (admin can issue a new one).
- **`payment_provider_session_id`** — provider-side ID (Whish reference, Stripe session id) for webhook reconciliation.

### 1.3 Schema decision

**Recommended:** additive columns on `bookings`. **No** new `payment_links` table in the first iteration.

Rationale:
- One live link per booking is sufficient for the Whish-style "manual create + share" workflow and for the Stripe Checkout "session per booking" workflow. Multiple historical links can be reconstructed from webhook event logs if needed (Phase 16B.6 or later).
- A separate table introduces a join on every booking read in the admin console and on every guest view — overhead that isn't justified by the v1 use case.
- All existing `bookings.payment_*` columns are additive and follow the same convention. Continuing the convention keeps the admin diff helpers (`lib/admin-booking-diff.ts`) and the data fetch (`/api/admin/data`) ergonomic.

**SQL sketch (NOT to be run yet — kickoff task must approve):**

```sql
alter table bookings
  add column if not exists payment_link_url            text          null,
  add column if not exists payment_link_provider       text          null,
  add column if not exists payment_link_expires_at     timestamptz   null,
  add column if not exists payment_link_issued_at      timestamptz   null,
  add column if not exists payment_link_status         text          null
    check (payment_link_status in ('none','active','paid','expired','cancelled','failed')),
  add column if not exists payment_provider_session_id text          null;

-- Optional partial index for "find bookings with a live link"
create index if not exists bookings_payment_link_active_idx
  on bookings (payment_link_expires_at)
  where payment_link_status = 'active';
```

The locked `/api/bookings` POST does **not** need to change — these columns default to null on insert and are populated by the admin payment route (Phase 16B.3) or by a webhook handler (Phase 16B.5+).

### 1.4 Migration risk

- Additive `add column if not exists`-style migrations are reversible. They do not block on any existing data.
- The new `payment_link_status` `check` constraint must allow `null` (omit `not null`) so the booking insert from the locked route continues to succeed unchanged.
- Admin payment routes must accept the new columns in the same allow-list pattern used for `payment_status`. The kickoff PR must add them.

---

## 2. Payment provider abstraction

### 2.1 Where the code lives

**Recommended directory:** `lib/payments/`. Mirrors the existing `lib/butler/` / `lib/calendar/` / `lib/pricing/` pattern.

- `lib/payments/provider.ts` — interface every provider implements.
- `lib/payments/whish.ts` — Whish (Lebanon) adapter. Manual create-link + manual mark-received in v1; later upgraded to API if Whish ships one.
- `lib/payments/stripe.ts` — Stripe Checkout adapter. Phase 16B.5+, optional.
- `lib/payments/manual.ts` — manual-invoice adapter (bank transfer / cash). No external API, just a record-keeping flow.
- `lib/payments/index.ts` — provider registry + helper to resolve the active provider for a given booking.

### 2.2 Provider-agnostic interface

Minimal v1 surface (concrete TypeScript types decided in 16B.1):

```ts
export interface PaymentProvider {
  readonly id: "whish" | "stripe" | "manual";

  /** Create or retrieve a payment link for the given booking + amount. */
  createPaymentLink(input: {
    booking_id: string;
    amount_due: number;
    currency: "USD" | "LBP";
    purpose: "deposit" | "balance" | "full";
    return_url: string;     // /booking/view/[token]
    cancel_url: string;     // /booking/view/[token]?payment=cancelled
  }): Promise<{
    payment_link_url: string;
    expires_at: string;     // ISO timestamp
    provider_session_id: string;
  }>;

  /** Verify a webhook payload (provider-specific signature check). */
  verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<{ ok: true; event: PaymentProviderEvent } | { ok: false }>;

  /** Translate provider event into a booking state delta. */
  toBookingDelta(event: PaymentProviderEvent): PaymentBookingDelta;
}

export type PaymentProviderEvent =
  | { kind: "session.completed"; provider_session_id: string; amount_paid: number; paid_at: string; }
  | { kind: "session.expired";   provider_session_id: string; }
  | { kind: "session.cancelled"; provider_session_id: string; }
  | { kind: "session.failed";    provider_session_id: string; reason: string; };

export type PaymentBookingDelta =
  | { kind: "set_paid";      payment_status: "deposit_paid" | "paid_in_full"; amount_paid: number; payment_received_at: string; }
  | { kind: "set_expired"; }
  | { kind: "set_cancelled"; }
  | { kind: "set_failed";   reason: string; };
```

### 2.3 Avoiding lock-in

- The `payment_link_provider` column lets `/api/payments/webhook/[provider]` route per-provider without storing provider state outside `bookings`.
- The provider interface is a thin **adapter**, not a framework. We do not adopt a payment SDK as the abstraction layer (no `@stripe/checkout` direct deps in `lib/payments/provider.ts`).
- The webhook route must verify signatures using `crypto.timingSafeEqual` for shared-secret providers and provider SDK verification for HMAC/JWT-based providers — never trust `req.body` to be authentic before verification.
- Currency stays explicit on every method signature. Mixing USD-priced stays with LBP payment is a real Lebanese-market scenario; the interface must not assume USD.
- Idempotency: every `provider_session_id` write to `bookings` is guarded by an `eq("payment_provider_session_id", session_id)` lookup first so duplicate webhook deliveries do not double-credit `amount_paid`.

---

## 3. Payment link lifecycle

State machine for `payment_link_status` (column added in 16B.2):

```
              ┌──────── admin generates ───────┐
              ▼                                │
   none → active ─── webhook: completed ──→ paid
              │
              ├── webhook: expired ──→ expired
              ├── webhook: cancelled ──→ cancelled
              └── webhook: failed ──→ failed
   (any non-paid state) → admin reissues → active (new session_id)
```

**Generation:**
- Triggered manually by admin from `/admin/bookings` (16B.3). Auto-generation on booking creation is **out of scope for v1** — instant booking still goes to "pending review" and the admin issues the link after confirming.
- `createPaymentLink` writes `payment_link_url`, `payment_link_provider`, `payment_link_issued_at`, `payment_link_expires_at`, `payment_link_status = 'active'`, `payment_provider_session_id`.

**Display:**
- Guest sees the link on `/booking/view/[token]` when `payment_link_status === 'active'` and not expired.
- Admin sees status + reissue button on `/admin/bookings/[id]`.
- WhatsApp shows the link only when status is `active` and only via the deterministic response template (§4).

**Expiration:**
- `payment_link_expires_at` is enforced server-side. The guest view treats `now > expires_at` as `expired` regardless of stored status (defense-in-depth).
- A separate Vercel Cron job (16B.5) flips `payment_link_status` to `expired` for any active link past `expires_at`. Webhook-driven expiration is preferred when the provider supports it.

**Failure handling:**
- Webhook delivery is best-effort. The provider-agnostic webhook route writes to `bookings` only after signature verification.
- On any state transition, the admin sees a `payment_last_at`-style timestamp update.
- Lost webhook deliveries are recovered by admin manually clicking "refresh status" on `/admin/bookings/[id]` (16B.3), which calls the provider's read-session API.

**Cancellation / refund implications:**
- Cancelling a booking does **not** automatically refund — refund is a separate admin action (see §7).
- A refunded booking keeps `payment_link_url = null` and `payment_link_status = 'cancelled'` so neither admin nor guest re-trigger payment.

---

## 4. WhatsApp payment-reply branching by booking status

The WhatsApp Butler asks: *"How can I pay?"*. The reply branches deterministically on the booking-side state. The Butler must **never** invent a payment instruction — every branch returns a deterministic string from `lib/payments/whatsapp-reply.ts` (new helper, 16B.5).

The branching key is the **combination** of `bookings.status` and `bookings.payment_link_status` (plus `payment_status` and `refund_status` for the terminal cases):

| `bookings.status` | `payment_link_status` | `payment_status`        | `refund_status`     | Butler response                                                                                                                            |
|-------------------|-----------------------|-------------------------|---------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `pending`         | `none` / `null`       | `unpaid`                | —                   | "Your booking is under review. The Oraya team will confirm shortly and send you a payment link."                                            |
| `confirmed`       | `none` / `null`       | `unpaid` / `payment_requested` | —             | "Your booking is confirmed. The team will issue your payment link shortly — please hold."                                                   |
| `confirmed`       | `active`              | `unpaid` / `payment_requested` | —             | "Your payment link is ready: {link}. It expires {expires_at_human}."                                                                        |
| `confirmed`       | `paid`                | `deposit_paid`          | —                   | "Your deposit is received — thank you. The Oraya team will reach out with the next step."                                                   |
| `confirmed`       | `paid`                | `paid_in_full`          | —                   | "Your booking is fully paid — thank you. We'll be in touch with arrival details closer to your check-in."                                   |
| `cancelled`       | any                   | any                     | `null`              | "This booking is cancelled. If you'd like to book again, the team can help."                                                                |
| `cancelled`       | any                   | any                     | `refund_pending`    | "This booking is cancelled and your refund is being processed. The team will update you when it completes."                                 |
| `cancelled`       | any                   | any                     | `partial_refund`    | "This booking is cancelled and a partial refund has been issued. The team will reach out with the final breakdown."                         |
| `cancelled`       | any                   | any                     | `refunded`          | "This booking is cancelled and the refund has been completed."                                                                              |
| any               | `expired`             | `unpaid` / `payment_requested` | —             | "Your earlier payment link has expired. The team will issue a new one shortly — please hold."                                               |
| any               | `failed`              | any                     | —                   | "There was an issue with your last payment attempt. The team will reach out with a fresh link shortly."                                     |

Rules:
- The Butler **does not generate** any payment URL itself — only Oraya's backend does.
- A response is only sent when the inbound WhatsApp number resolves to a single, recent booking via the lead → booking linkage (Phase 16A's `whatsapp_leads.linked_booking_id`). Ambiguous matches escalate to a human.
- The deterministic strings live in `lib/payments/whatsapp-reply.ts` and are the **only** sentences the Butler is allowed to echo about payment state. No paraphrasing.
- The `expires_at_human` interpolation uses `Asia/Beirut` formatting (project time-zone discipline).

---

## 5. Admin payment workflow

### 5.1 First-pass surfaces

- `/admin/bookings/[id]` gains a **Payment** section with:
  - Current `payment_status` and `payment_stage` (existing).
  - Current `payment_link_url`, `payment_link_provider`, `payment_link_status`, `payment_link_expires_at` (new in 16B.2).
  - **Generate link** button — opens a small modal: provider select (`whish` / `manual` / future `stripe`), purpose (`deposit` / `balance` / `full`), amount (defaulted from `amount_due`), expiration (provider default).
  - **Refresh status** button — calls the provider's read-session API and updates `payment_link_status` + `amount_paid` if changed.
  - **Mark received manually** action — preserved from today; useful for Whish receipts.
  - **Cancel link** action — sets `payment_link_status = 'cancelled'`.

### 5.2 What stays manual in v1

- **Whish link creation.** No public Whish API today — admin enters the Whish web-link by hand after generating it in the Whish merchant dashboard. The "Generate link" flow for `provider='whish'` is therefore a glorified form that stores the admin-entered URL + expiration.
- **Cash + bank-transfer.** Provider = `manual`. No link, just a payment-confirmed timestamp.
- **Refund processing.** Always manual in v1 (see §7).

### 5.3 What gets automated when possible

- Stripe Checkout (16B.5+) — programmatic link creation, webhook-driven state sync.
- Webhook routes under `/api/payments/webhook/[provider]/route.ts` — signature-verified, idempotent.

### 5.4 RLS / auth

- All admin payment routes reuse `requireAdminAuth` from [lib/admin-auth.ts](../../lib/admin-auth.ts). No new auth surface.
- Webhook routes are **public** by definition but signature-verified using a per-provider secret stored as a sensitive env var (`STRIPE_WEBHOOK_SECRET`, etc.). Webhook routes never trust `req.body` before verifying.

---

## 6. Guest payment view

`/booking/view/[token]` already renders booking summary, status, and existing payment ledger fields. Phase 16B layers payment-link rendering on top.

### 6.1 Lookup model

- **Existing:** signed view token (HMAC, 72-hour TTL) — `lib/booking-action-token.ts`. Already implemented.
- **No change** to the token contract. The guest payment view reuses the same signed token. No "secure payment token" is added.

### 6.2 Display rules

- When `payment_link_status === 'active'` and `now < payment_link_expires_at`:
  - Show **Pay deposit** / **Pay balance** / **Pay total** CTA (button label keyed on `purpose`).
  - Show expiration ("Link expires in X hours" — `Asia/Beirut` formatting).
- When `payment_link_status === 'expired'`:
  - Show: "Your payment link has expired. The team will issue a new one shortly."
- When `payment_link_status === 'paid'` and `payment_status === 'paid_in_full'`:
  - Show "Paid in full — thank you." Hide the CTA.
- When `payment_link_status === 'paid'` and `payment_status === 'deposit_paid'`:
  - Show "Deposit received." If `amount_due > 0`, show next-step copy without exposing a balance link until admin issues one.
- Existing refund visibility (Phase 15I.11) carries over unchanged.

### 6.3 Privacy / link visibility

- The link itself is **only** displayed inside the signed-token view — never exposed via a public URL like `/pay/[booking_id]`.
- The booking reference (the 8-character prefix) remains a public support code only.
- WhatsApp payment-reply renders the link only when the inbound number is matched to the booking via lead linkage; ambiguous matches do not see the link.

---

## 7. Refund model

### 7.1 v1: manual

- Admin issues the refund out-of-band (Whish dashboard / bank transfer / Stripe dashboard).
- Admin sets `refund_status`, `refund_amount`, `refunded_at`, and adds a free-form note in `payment_notes`.
- Booking `status` is independently set to `cancelled` if the entire stay is voided.
- An admin email-trigger (16B.6) sends a refund-confirmation email to the guest.

### 7.2 v2: automated (deferred)

- Provider-specific refund APIs (`provider.refund(session_id, amount)`).
- Webhook events: `session.refunded` / `session.partially_refunded` reconcile `refund_status` automatically.
- Manual override always wins — the automated path never closes a refund that's manually marked `refund_pending` without explicit admin confirmation.

### 7.3 Cancellation vs refund

- **Cancellation** is a `bookings.status` transition. It can happen with or without a refund.
- **Refund** is an independent ledger movement on `refund_*` columns.
- The WhatsApp reply table (§4) treats them independently. A cancelled-no-refund booking sees a different message than a cancelled-refund-pending one.

### 7.4 Audit requirements

- Every refund mutation logs the admin id (`payment_marked_by`) and timestamp (`payment_last_at`).
- The booking-view page surfaces "Refund completed on X" using `refunded_at`.
- For automated refunds, the webhook handler appends an entry to a future `payment_event_log` table (out of scope for first iteration — captured in 16B.6).

---

## 8. Implementation roadmap

Each sub-phase is a **PR-safe**, independently mergeable unit. Every PR must comply with [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) (minimal diff, locked-system protection, no fake completion reports).

### 16B.1 — Architecture / decision / docs

- Approval gate. No code.
- Confirm the schema decision (§1.3). If a `payment_links` history table is preferred over additive columns, **revise this plan first**, then proceed.
- Confirm provider list for v1 — recommended floor: `manual` + `whish`. Stripe stays optional / 16B.5.
- Add a `DECISIONS_LOG.md` entry recording the chosen schema shape, provider list, and the WhatsApp branching contract from §4.

### 16B.2 — Payment state model (schema + admin route)

- Apply the additive migration (§1.3) in Supabase.
- Update `/api/admin/bookings/[id]` PATCH allow-list to accept the new columns (mirror the existing `payment_status` / `payment_method` pattern).
- Update `/api/admin/data` SELECT list, `/booking/view/[token]` SELECT list, and `lib/admin-booking-diff.ts` to include the new columns.
- No UI yet. No provider code yet.

### 16B.3 — Admin payment controls

- Add the Payment section in `/admin/bookings/[id]` (§5.1).
- Implement `lib/payments/provider.ts` interface + `lib/payments/manual.ts` and `lib/payments/whish.ts` (manual-link adapter both).
- Implement `/api/admin/bookings/[id]/payment/link` for create / reissue / cancel.
- Implement `/api/admin/bookings/[id]/payment/refresh` for provider-side status refresh.
- **No webhook routes yet.** All sync is admin-driven in this PR.

### 16B.4 — Guest payment view

- Add the payment-link CTA + status rendering on `/booking/view/[token]` (§6.2).
- Update `lib/send-booking-payment-email.ts` to include the link when present and active.
- Add a new `lib/send-booking-payment-link-email.ts` triggered when admin generates a fresh link (separate from "payment received").

### 16B.5 — WhatsApp payment lookup / response

- Add `lib/payments/whatsapp-reply.ts` with the deterministic strings from §4.
- Add `POST /api/butler/payment-status` (Butler-secret-guarded) — input: WhatsApp number → match to booking via lead linkage; output: deterministic response string + booking summary fields.
- Add a Vercel Cron job (`0 */6 * * *`, hourly grace) under `/api/cron/payment-link-expiry` to flip stale links to `expired`. Honor `CRON_SECRET` like the existing `/api/cron/calendar-sync`.
- Document the WhatChimp side-mapping (`oraya_payment_response` → outbound WhatsApp message) in `BUTLER_PLAYBOOK.md`.

### 16B.6 — Refund handling + Stripe (optional)

- Implement the refund-completed email (§7.1).
- (Optional, gated on Stripe approval) Add `lib/payments/stripe.ts` and `/api/payments/webhook/stripe`.
- Add a `payment_event_log` table for audit history.
- Add admin "refund" action that wraps the manual flow today and the provider API later.

---

## 9. Risks

### 9.1 Security

- **Webhook signature verification is mandatory.** Any route that trusts an unverified webhook payload is a remote code path that mutates `bookings.payment_status` — high-impact. Must use `crypto.timingSafeEqual` for shared secrets and provider SDK verification for HMAC/JWT.
- **Payment link in URL.** The current plan keeps the link inside the signed-token guest view, so the link itself is not exposed publicly. Phase 16B.4 must not regress this.
- **Idempotency.** Webhook retries are normal. Every state transition must be idempotent on `payment_provider_session_id` to avoid double-crediting `amount_paid`.
- **Replay protection.** Provider webhooks include a timestamp + signature. The webhook route must reject events older than the provider's stated drift window (typically ≤5 minutes).
- **No client-side payment.** No `NEXT_PUBLIC_PAYMENT_*` env vars. Provider keys are server-only and stored sensitive in Vercel.

### 9.2 Payment correctness

- **Currency mismatch.** The Lebanese market uses both USD (stay) and LBP (cash) regularly. The provider interface must keep currency explicit on every operation.
- **Partial payment race.** Two simultaneous webhook deliveries for the same session must not double-write `amount_paid`. The idempotency guard on `payment_provider_session_id` resolves this.
- **Deposit vs full payment.** The `purpose` field (`deposit` / `balance` / `full`) must be persisted on the link record so the webhook handler can correctly compute `payment_status`.

### 9.3 Booking authority

- **The locked `/api/bookings` POST contract must not change.** Phase 16B does not modify booking insertion, overlap protection, pricing, addon audit, or the email triggers. Payment columns default to null on insert and are populated later.
- **Calendar sync.** Refunded / cancelled bookings continue to behave the same in iCal export. No change to `lib/calendar/*`.
- **Tokens.** No change to `lib/booking-action-token.ts`. The guest view token continues to authorize the payment-link view; no new token type is introduced.

### 9.4 Schema migration

- All new columns are additive and nullable. No `not null` defaults that would break existing rows.
- The `check` constraint on `payment_link_status` must allow `null` so unmigrated bookings keep working.
- The migration is reversible: `drop column if exists` works for every new column.

### 9.5 WhatsApp privacy

- **Single-booking match required** before any payment link is sent on WhatsApp. Ambiguous matches → escalate to human, never show a link.
- **Link expiry visible** in the WhatsApp message, in Asia/Beirut formatting.
- **No payment intent leak** outside the matched booking. The Butler never names other guests, never confirms whether another booking exists, never echoes balances for any phone number that doesn't match a single linked booking.

---

## 10. Operational checklist before 16B.2 lands

Human action items:

1. Provider list approved (manual + Whish at minimum).
2. Schema decision approved (additive columns confirmed).
3. `STRIPE_WEBHOOK_SECRET` / Whish webhook secret (if any) reserved in [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md) but not consumed yet.
4. `NEXT_PUBLIC_SITE_URL` confirmed in production + preview (Phase 16A pre-req that becomes urgent in 16B for payment return URLs).
5. `BUTLER_PREFILL_SECRET` confirmed in production (Phase 16A pre-req — without it, the lead → booking linkage that 16B.5's WhatsApp lookup depends on is degraded).

---

## 11. Cross-references

- Phase 16A foundation: [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) "Butler flow".
- Phase 16A decisions: [/docs/system/DECISIONS_LOG.md](../system/DECISIONS_LOG.md) — 2026-05-12 architecture freeze, 2026-05-15 lead persistence, 2026-05-18 prefill handoff, 2026-05-18 booking provenance writer.
- Existing payment foundation: [lib/payment-foundation.ts](../../lib/payment-foundation.ts), [app/api/admin/bookings/[id]/route.ts](../../app/api/admin/bookings/%5Bid%5D/route.ts), [app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx).
- Existing payment email: [lib/send-booking-payment-email.ts](../../lib/send-booking-payment-email.ts).
- Butler operational rules (where payment messaging tone is constrained): [/docs/system/BUTLER_PLAYBOOK.md](../system/BUTLER_PLAYBOOK.md).
- Locked surfaces: [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4.

---

<!-- New 16B sub-phase notes: append below the roadmap, never delete a past sub-phase entry. -->
