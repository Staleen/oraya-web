/**
 * Villa-level instant booking flags in `settings` (no schema change).
 * Phase 15I.10 — admin control only; payment execution remains Phase 16.
 */

export const INSTANT_BOOKING_SETTING_KEYS = {
  "Villa Mechmech": "instant_booking_villa_mechmech",
  "Villa Byblos": "instant_booking_villa_byblos",
} as const;

export type InstantBookingFlags = Record<keyof typeof INSTANT_BOOKING_SETTING_KEYS, boolean>;

/** When unset or unknown → enabled (backward compatible). Explicit false/0/off disables. */
export function parseInstantBookingSetting(value: unknown): boolean {
  if (value == null || String(value).trim() === "") return true;
  const v = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(v)) return false;
  return true;
}

export function instantBookingEnabledForVilla(villa: string, flags: InstantBookingFlags): boolean {
  if (villa === "Villa Mechmech") return flags["Villa Mechmech"];
  if (villa === "Villa Byblos") return flags["Villa Byblos"];
  return true;
}
