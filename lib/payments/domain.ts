/**
 * Phase 16B PR-1 — canonical payment domain model.
 *
 * This module is intentionally additive and runtime-neutral: it defines the
 * shared payment vocabulary future 16B work will consume, without changing any
 * existing admin, guest, booking, or WhatsApp behavior.
 */

export const MANUAL_PAYMENT_RAILS = [
  "whish",
  "omt",
  "western_union",
  "bob_finance",
  "bank_transfer",
  "cash",
] as const;

export type ManualPaymentRail = (typeof MANUAL_PAYMENT_RAILS)[number];

export const HOSTED_CHECKOUT_RAILS = ["card_gateway"] as const;

export type HostedCheckoutRail = (typeof HOSTED_CHECKOUT_RAILS)[number];

export type PaymentRail = ManualPaymentRail | HostedCheckoutRail;

export const WALLET_PRESENTATIONS = ["apple_pay", "google_pay"] as const;

export type WalletPresentation = (typeof WALLET_PRESENTATIONS)[number];

export const PAYMENT_REQUEST_PURPOSES = ["deposit", "balance", "full"] as const;

export type PaymentRequestPurpose = (typeof PAYMENT_REQUEST_PURPOSES)[number];

export const BOOKING_PAYMENT_LIFECYCLE_STATUSES = [
  "unpaid",
  "payment_requested",
  "deposit_paid",
  "paid_in_full",
] as const;

export type BookingPaymentLifecycleStatus =
  (typeof BOOKING_PAYMENT_LIFECYCLE_STATUSES)[number];

export const REFUND_LIFECYCLE_STATUSES = [
  "refund_pending",
  "partial_refund",
  "refunded",
] as const;

export type RefundLifecycleStatus = (typeof REFUND_LIFECYCLE_STATUSES)[number];

export const HOSTED_SESSION_LIFECYCLE_STATUSES = [
  "none",
  "active",
  "paid",
  "expired",
  "cancelled",
  "failed",
] as const;

export type HostedSessionLifecycleStatus =
  (typeof HOSTED_SESSION_LIFECYCLE_STATUSES)[number];
