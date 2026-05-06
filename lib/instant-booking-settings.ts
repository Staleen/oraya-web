/**
 * Villa-level instant booking flags in `settings` (no schema change).
 * Phase 15I.10 — admin control only; payment execution remains Phase 16.
 */

export const INSTANT_BOOKING_SETTING_KEYS = {
  "Villa Mechmech": "instant_booking_villa_mechmech",
  "Villa Byblos": "instant_booking_villa_byblos",
} as const;

export type InstantBookingFlags = Record<keyof typeof INSTANT_BOOKING_SETTING_KEYS, boolean>;

/** Explicit true-ish values enable; missing/unknown values stay conservative. */
export function parseInstantBookingSetting(value: unknown): boolean {
  if (value == null || String(value).trim() === "") return false;
  const v = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(v)) return false;
  return ["true", "1", "yes", "on"].includes(v);
}

export function instantBookingEnabledForVilla(villa: string, flags: InstantBookingFlags): boolean {
  if (villa === "Villa Mechmech") return flags["Villa Mechmech"];
  if (villa === "Villa Byblos") return flags["Villa Byblos"];
  return false;
}

/** Public guest pages — same keys as `/book` (no auth). */
export async function fetchInstantBookingFlagsPublic(): Promise<InstantBookingFlags> {
  async function loadFlag(key: string): Promise<boolean> {
    const response = await fetch(`/api/settings?key=${encodeURIComponent(key)}`);
    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({}))) as { value?: unknown };
    return parseInstantBookingSetting(data.value);
  }

  const [mech, byl] = await Promise.all([
    loadFlag(INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"]),
    loadFlag(INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"]),
  ]);
  return { "Villa Mechmech": mech, "Villa Byblos": byl };
}
