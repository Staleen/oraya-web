/**
 * Phase 16B.1 — payment-provider abstraction (types + allow-lists only).
 *
 * This file is the architecture scaffold for Phase 16B. It is intentionally
 * **type-only** — no runtime behavior, no Supabase imports, no provider SDKs,
 * no I/O. The first concrete provider implementations land in Phase 16B.3
 * (manual + Whish) and 16B.5+ (Stripe).
 *
 * The single live payment link per booking lives directly on the `bookings`
 * row in the columns added by [sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql):
 *
 *   - `payment_link_url`            text          null
 *   - `payment_link_provider`       text          null   — allow-list mirrored below
 *   - `payment_link_expires_at`     timestamptz   null
 *   - `payment_link_issued_at`      timestamptz   null
 *   - `payment_link_status`         text          null   — allow-list mirrored below
 *   - `payment_provider_session_id` text          null   — idempotency anchor
 *
 * See /docs/phases/PHASE_16B_PLAN.md §1–§3 for full architecture context, and
 * /docs/system/DECISIONS_LOG.md "2026-05-18 — Phase 16B.1 architecture freeze".
 *
 * Discipline reminders for future implementers:
 *
 *   1. **Idempotency.** Every write to bookings.payment_* triggered by a webhook
 *      MUST be guarded by `eq("payment_provider_session_id", session_id)` so a
 *      retried webhook delivery cannot double-credit `amount_paid`.
 *   2. **Signature verification.** Webhook handlers MUST verify signatures with
 *      `crypto.timingSafeEqual` (shared-secret providers) or the provider SDK
 *      (HMAC / JWT providers) before any DB write.
 *   3. **Currency is explicit.** The Lebanese market mixes USD-priced stays with
 *      LBP-cash payments. Never assume currency.
 *   4. **The locked `/api/bookings` POST does not change.** Payment columns
 *      default to null on insert; they are populated later by admin payment
 *      routes (16B.3) or webhooks (16B.5+).
 */

/**
 * Allow-listed payment link lifecycle states. Mirrors the
 * `bookings_payment_link_status_check` constraint in
 * `sql/phase-16b1-payment-link-foundation.sql`. NULL on the row means
 * "no link has ever been issued for this booking" — semantically equivalent
 * to "none" for read purposes but represented as NULL on disk so the
 * additive migration does not touch any existing row.
 */
export const PAYMENT_LINK_STATUSES = [
  "none",
  "active",
  "paid",
  "expired",
  "cancelled",
  "failed",
] as const;

export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

export function isPaymentLinkStatus(value: unknown): value is PaymentLinkStatus {
  return typeof value === "string" && (PAYMENT_LINK_STATUSES as readonly string[]).includes(value);
}

/**
 * Allow-listed payment providers for the v1 floor. Mirrors the
 * `bookings_payment_link_provider_check` constraint.
 *
 *   - `manual` — admin records a cash / bank-transfer / off-platform payment.
 *               No URL is issued; `payment_link_url` stays null.
 *   - `whish`  — admin enters a Whish web-link by hand (no public Whish API
 *               today). The URL and expiration come from the Whish merchant
 *               dashboard; Oraya only stores them.
 *   - `stripe` — programmatic Checkout session. Phase 16B.5+; optional.
 */
export const PAYMENT_LINK_PROVIDERS = ["manual", "whish", "stripe"] as const;

export type PaymentLinkProvider = (typeof PAYMENT_LINK_PROVIDERS)[number];

export function isPaymentLinkProvider(value: unknown): value is PaymentLinkProvider {
  return typeof value === "string" && (PAYMENT_LINK_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Allow-listed currencies. USD is the stay-pricing currency; LBP is allowed
 * because Whish receipts and cash payments in Lebanon routinely settle in LBP.
 * Adding a new currency requires a new entry here AND any provider that
 * supports it.
 */
export const PAYMENT_CURRENCIES = ["USD", "LBP"] as const;

export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export function isPaymentCurrency(value: unknown): value is PaymentCurrency {
  return typeof value === "string" && (PAYMENT_CURRENCIES as readonly string[]).includes(value);
}

/**
 * What the admin is asking the guest to pay. The provider stores this on the
 * session so the webhook handler can correctly compute the resulting
 * `payment_status` (`deposit_paid` vs `paid_in_full`).
 */
export const PAYMENT_LINK_PURPOSES = ["deposit", "balance", "full"] as const;

export type PaymentLinkPurpose = (typeof PAYMENT_LINK_PURPOSES)[number];

export function isPaymentLinkPurpose(value: unknown): value is PaymentLinkPurpose {
  return typeof value === "string" && (PAYMENT_LINK_PURPOSES as readonly string[]).includes(value);
}

/**
 * Input shape for `PaymentProvider.createPaymentLink`. Every field is
 * required so a provider implementation cannot accidentally generate a link
 * with implicit currency or amount.
 */
export interface CreatePaymentLinkInput {
  /** The booking the link is for. */
  booking_id: string;
  /** Amount the link should charge. Always non-negative; provider may reject zero. */
  amount_due: number;
  /** Settlement currency. */
  currency: PaymentCurrency;
  /** Whether this link covers a deposit, the remaining balance, or the full total. */
  purpose: PaymentLinkPurpose;
  /** Where the provider should redirect the guest after success. Always the booking-view page. */
  return_url: string;
  /** Where the provider should redirect on guest cancel. */
  cancel_url: string;
}

/**
 * Result of `PaymentProvider.createPaymentLink`. The returned shape maps
 * 1:1 to the new `bookings.payment_link_*` columns.
 */
export interface CreatePaymentLinkResult {
  payment_link_url: string;
  /** ISO timestamp string. The caller writes this to `payment_link_expires_at`. */
  expires_at: string;
  /** Provider's session/receipt identifier. Used as the idempotency anchor on webhook writes. */
  provider_session_id: string;
}

/**
 * Webhook event shapes the provider produces after `verifyWebhook` returns
 * `{ ok: true }`. Every variant carries the `provider_session_id` so the
 * route can locate the booking via
 * `eq("payment_provider_session_id", provider_session_id)`.
 */
export type PaymentProviderEvent =
  | {
      kind: "session.completed";
      provider_session_id: string;
      /** Amount actually settled, in the original `CreatePaymentLinkInput.currency`. */
      amount_paid: number;
      /** ISO timestamp string. */
      paid_at: string;
    }
  | {
      kind: "session.expired";
      provider_session_id: string;
    }
  | {
      kind: "session.cancelled";
      provider_session_id: string;
    }
  | {
      kind: "session.failed";
      provider_session_id: string;
      /** Free-form provider-supplied reason; never echoed to the guest. */
      reason: string;
    };

/**
 * The translated booking delta that the webhook route applies to the
 * `bookings` row. The provider owns the translation so the webhook handler
 * never needs to understand provider-specific event shapes.
 *
 * The webhook route applies these as a single PATCH with explicit
 * idempotency:
 *
 *   1. Look up the booking by `payment_provider_session_id`.
 *   2. If the existing `payment_link_status` already equals the target state
 *      AND `amount_paid` is unchanged, skip the write (idempotent no-op).
 *   3. Otherwise, write the delta. Always update `payment_last_at` to now.
 */
export type PaymentBookingDelta =
  | {
      kind: "set_paid";
      /** Computed by the provider from the purpose + amount_due math. */
      payment_status: "deposit_paid" | "paid_in_full";
      amount_paid: number;
      /** ISO timestamp string. */
      payment_received_at: string;
    }
  | { kind: "set_expired" }
  | { kind: "set_cancelled" }
  | {
      kind: "set_failed";
      /** Logged server-side only; never echoed in any HTTP response or email. */
      reason: string;
    };

/**
 * The provider-agnostic interface every concrete provider implements.
 *
 * Concrete implementations (16B.3+) live alongside this file:
 *
 *   - `lib/payments/manual.ts`  — admin-recorded cash/bank-transfer (no URL)
 *   - `lib/payments/whish.ts`   — admin pastes a Whish web-link (manual create)
 *   - `lib/payments/stripe.ts`  — programmatic Stripe Checkout (16B.5+)
 *
 * The registry that resolves the active provider for a given booking lives
 * in `lib/payments/index.ts` (added in 16B.3, not in this 16B.1 scaffold).
 */
export interface PaymentProvider {
  readonly id: PaymentLinkProvider;

  /**
   * Create (or retrieve / reissue) a payment link for the given booking.
   *
   * Idempotency: a provider implementation MAY return the same URL +
   * `provider_session_id` on a retry within the same logical issuance window.
   * The admin route guards reissue by calling `cancelPaymentLink` first or by
   * resetting `payment_link_status` to a non-active value.
   */
  createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>;

  /**
   * Verify a webhook payload. Implementations MUST use a constant-time
   * comparison for shared-secret HMAC and MUST enforce a freshness window
   * (typically ≤5 minutes) to mitigate replay.
   */
  verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<{ ok: true; event: PaymentProviderEvent } | { ok: false }>;

  /** Translate a verified provider event into the booking-row delta. */
  toBookingDelta(event: PaymentProviderEvent): PaymentBookingDelta;
}
