import type { AddonOperationalFields } from "@/lib/addon-operations";

export const MAX_EVENT_ATTENDEES = 30;

export type EventServicePricingRow = AddonOperationalFields & {
  label: string;
  price: number | null;
  currency?: string | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
};

export function isEventServiceQuantityTiedToAttendees(
  row: Pick<EventServicePricingRow, "pricing_model" | "pricing_unit" | "quantity_enabled">,
): boolean {
  if (!row.quantity_enabled) return false;
  return row.pricing_unit === "per_guest" || row.pricing_model === "per_person_per_day";
}

/**
 * Non-binding guest estimate: flat one-off = list price; quantity-priced rows = unit × quantity
 * (per-night rows multiply by nights when applicable).
 */
export function computeEventServiceLineSubtotal(
  row: EventServicePricingRow,
  quantity: number,
  nights: number,
): number {
  const price = typeof row.price === "number" && Number.isFinite(row.price) && row.price >= 0 ? row.price : 0;
  if (!row.quantity_enabled) {
    return price;
  }
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  if (row.pricing_model === "per_night") {
    const n = Number.isFinite(nights) && nights > 0 ? nights : 1;
    return price * q * n;
  }
  return price * q;
}

export function clampEventAttendees(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_EVENT_ATTENDEES, Math.max(1, Math.floor(value)));
}
