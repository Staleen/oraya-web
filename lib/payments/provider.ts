/**
 * Phase 16B hosted-checkout provider contract.
 *
 * This file keeps two layers distinct:
 *
 * 1. The persisted `bookings.payment_link_provider` allow-list that must stay
 *    in sync with the current database constraint.
 * 2. The runtime hosted-checkout provider key selected via `PAYMENT_PROVIDER`.
 *
 * Today those layers are still intentionally distinct: the runtime hosted
 * adapter surface may be broader than the persisted DB allow-list, but the
 * persisted values must only include providers that the schema explicitly
 * permits.
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
 * Persisted provider values stored on `bookings.payment_link_provider`.
 *
 * `stripe` remains allowed for backward compatibility with older dev/test rows.
 * `credit_libanais` is now included so the production-target bank gateway can
 * persist its provider key once the official contract is implemented.
 */
export const PAYMENT_LINK_PROVIDERS = ["manual", "whish", "stripe", "credit_libanais"] as const;

export type PaymentLinkProvider = (typeof PAYMENT_LINK_PROVIDERS)[number];

export function isPaymentLinkProvider(value: unknown): value is PaymentLinkProvider {
  return typeof value === "string" && (PAYMENT_LINK_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Runtime hosted-checkout providers. This list can be broader than the
 * persisted DB allow-list because some adapters may exist before the schema is
 * widened to store their provider key directly.
 */
export const HOSTED_CHECKOUT_PROVIDER_KEYS = ["credit_libanais", "stripe"] as const;

export type HostedCheckoutProviderKey = (typeof HOSTED_CHECKOUT_PROVIDER_KEYS)[number];

export function isHostedCheckoutProviderKey(value: unknown): value is HostedCheckoutProviderKey {
  return typeof value === "string" && (HOSTED_CHECKOUT_PROVIDER_KEYS as readonly string[]).includes(value);
}

export const HOSTED_CHECKOUT_ENVIRONMENTS = ["sandbox", "live", "unknown"] as const;

export type HostedCheckoutEnvironment = (typeof HOSTED_CHECKOUT_ENVIRONMENTS)[number];

export const PAYMENT_CURRENCIES = ["USD", "LBP"] as const;

export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export function isPaymentCurrency(value: unknown): value is PaymentCurrency {
  return typeof value === "string" && (PAYMENT_CURRENCIES as readonly string[]).includes(value);
}

export const PAYMENT_LINK_PURPOSES = ["deposit", "balance", "full"] as const;

export type PaymentLinkPurpose = (typeof PAYMENT_LINK_PURPOSES)[number];

export function isPaymentLinkPurpose(value: unknown): value is PaymentLinkPurpose {
  return typeof value === "string" && (PAYMENT_LINK_PURPOSES as readonly string[]).includes(value);
}

export interface CreateCheckoutSessionInput {
  booking_id: string;
  amount_due: number;
  currency: PaymentCurrency;
  purpose: PaymentLinkPurpose;
  return_url: string;
  cancel_url: string;
  payment_page_url?: string;
  expires_at?: string;
  /** Online methods that this canonical request is allowed to present. */
  allowed_payment_methods?: readonly ("card" | "apple_pay" | "google_pay" | "click_to_pay")[];
}

export interface CreateCheckoutSessionResult {
  payment_link_url: string;
  expires_at: string;
  provider_session_id: string;
}

export type PaymentProviderEvent =
  | {
      kind: "session.completed";
      provider_session_id: string;
      amount_paid: number;
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
      reason: string;
    };

export type PaymentBookingDelta =
  | {
      kind: "set_paid";
      amount_paid: number;
      payment_received_at: string;
      payment_reference: string;
    }
  | { kind: "set_expired" }
  | { kind: "set_cancelled" }
  | {
      kind: "set_failed";
      reason: string;
    };

export interface WebhookVerificationInput {
  rawBody: string;
  headers: Record<string, string>;
}

export type WebhookVerificationResult =
  | { ok: true; event: PaymentProviderEvent }
  | { ok: false };

export interface HostedCheckoutProviderReadiness {
  configured: boolean;
  implemented: boolean;
  checkout_ready: boolean;
  environment: HostedCheckoutEnvironment;
  guest_message: string;
  admin_message: string;
  missing_requirements: string[];
}

export class PaymentProviderConfigurationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 503) {
    super(message);
    this.name = "PaymentProviderConfigurationError";
    this.statusCode = statusCode;
  }
}

export interface HostedCheckoutProvider {
  /**
   * Runtime provider key selected via `PAYMENT_PROVIDER`.
   */
  readonly key: HostedCheckoutProviderKey;
  /**
   * Human-readable provider label for logs and operator-facing setup errors.
   */
  readonly display_name: string;
  /**
   * Whether this adapter is ready to start a real hosted checkout session in
   * the current implementation.
   */
  readonly checkout_ready: boolean;
  /**
   * Guest-safe setup status for public UI when checkout is not yet available.
   */
  readonly guest_setup_message: string | null;
  /**
   * Value safe to persist into `bookings.payment_link_provider` under the
   * current schema.
   */
  readonly persisted_link_provider: PaymentLinkProvider | null;
  /**
   * Safe runtime readiness summary for guest/admin UI. Never include raw
   * secret values here. Async since Plan 4 Phase 3: production readiness
   * consults the server-side `payments_live_enabled` rollout switch.
   */
  getReadiness(): Promise<HostedCheckoutProviderReadiness>;

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult>;
  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult>;
  mapProviderEventToBookingUpdate(event: PaymentProviderEvent): PaymentBookingDelta;
}
