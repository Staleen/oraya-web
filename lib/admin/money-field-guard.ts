/**
 * Phase 16B W2 — the legacy admin route may no longer record money.
 *
 * `PATCH /api/admin/bookings/[id]` used to write `amount_paid`,
 * `payment_status`, `payment_received_at`, `refund_amount`, `refund_status`
 * and the rest straight onto the bookings row: no `payment_transactions` row,
 * no idempotency key, no RPC, no deduplication. On 2026-08-11 that wrote a
 * duplicate $240 receipt on booking 53896156 with a `legacy-…` key and no
 * `payment_request_id`.
 *
 * W2's acceptance is that **no path can record money twice against one booking
 * without an explicit override**. Ops → Payments already records money through
 * `oraya_record_manual_payment` with an idempotency key and a compare-and-set
 * on the expected balance, and records refunds with a compare-and-set on
 * `refund_amount` plus a required Business Center reference. So the legacy
 * writer is removed rather than re-plumbed — taking the ability away is less
 * risk than teaching a second surface to write money correctly.
 *
 * This guard rejects the *incoming payload*. It never touches stored history:
 * every existing booking money column and every ledger row is left exactly as
 * it is. This is about what can be written from now on.
 *
 * Pure — no imports, so node:test can load it (repo test convention).
 */

/**
 * Every money-bearing field the legacy PATCH route used to accept. Kept as one
 * list so a field cannot be re-enabled by accident: if it is in here, the route
 * refuses the request outright rather than writing part of it.
 */
export const ADMIN_MONEY_FIELDS = [
  "payment_status",
  "payment_stage",
  "payment_method",
  "deposit_amount",
  "amount_paid",
  "amount_total",
  "amount_due",
  "payment_last_at",
  "payment_reference",
  "payment_notes",
  "payment_requested_at",
  "payment_received_at",
  "payment_due_at",
  "payment_marked_by",
  "payment_link_url",
  "payment_link_provider",
  "payment_link_expires_at",
  "payment_link_issued_at",
  "payment_link_status",
  "payment_provider_session_id",
  "refund_status",
  "refund_amount",
  "refunded_at",
  "refund_provider_reference",
] as const;

export type AdminMoneyField = (typeof ADMIN_MONEY_FIELDS)[number];

/** Points the operator at the surface that records money safely. */
export const ADMIN_MONEY_REJECTION_MESSAGE =
  "Money is no longer recorded here. Use Ops → Payments: it records through the payment ledger with deduplication, so the same payment cannot be counted twice.";

/**
 * Which money-bearing fields a PATCH payload is trying to write.
 *
 * Presence is what counts, not the value: sending `amount_paid: null` is still
 * an attempt to write the money column, and a partial write is exactly how the
 * duplicate receipt happened.
 */
export function findAdminMoneyFields(payload: unknown): AdminMoneyField[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return ADMIN_MONEY_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  );
}

/** True when the payload would have written money through the legacy route. */
export function payloadRecordsMoney(payload: unknown): boolean {
  return findAdminMoneyFields(payload).length > 0;
}
