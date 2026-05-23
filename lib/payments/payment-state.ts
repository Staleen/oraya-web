/**
 * Provider-neutral payment lifecycle vocabulary for the Credit Libanais / MPGS
 * production path.
 *
 * These states describe the target payment domain. Existing booking rows still
 * use the legacy `payment_status` / `payment_link_status` columns until a
 * human-approved schema change widens the database contract.
 */
export const PAYMENT_LIFECYCLE_STATES = [
  "unpaid",
  "pending_payment",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "addon_payment_pending",
] as const;

export type PaymentLifecycleState = (typeof PAYMENT_LIFECYCLE_STATES)[number];

export function isPaymentLifecycleState(value: unknown): value is PaymentLifecycleState {
  return typeof value === "string" && (PAYMENT_LIFECYCLE_STATES as readonly string[]).includes(value);
}
