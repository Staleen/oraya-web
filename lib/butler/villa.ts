/**
 * Phase 16A.1.x — shared villa slug resolver for `/api/butler/*`.
 *
 * The Butler accepts URL-safe villa slugs ("mechmech", "byblos") and
 * resolves them to the canonical names used everywhere else in the
 * repo ("Villa Mechmech", "Villa Byblos"). Centralizing the map
 * prevents drift between the addons and availability routes (and any
 * future Butler endpoints that need the same mapping).
 *
 * Server-only — only imported from `/api/butler/*` routes.
 */

/** Canonical villa names as stored in `bookings.villa`, `addons.applicable_villas`, etc. */
export const KNOWN_BUTLER_VILLAS = ["Villa Mechmech", "Villa Byblos"] as const;
export type ButlerVillaName = (typeof KNOWN_BUTLER_VILLAS)[number];

/**
 * Accepts URL-safe slugs (`mechmech`, `byblos`) for the existing GET
 * `/api/butler/availability` query-string surface AND canonical names
 * (`Villa Mechmech`, `Villa Byblos`) for the JSON body of Butler POST
 * endpoints that echo the canonical form WhatChimp sees elsewhere.
 *
 * Matching is case-insensitive and collapses internal whitespace so
 * `"  villa  byblos  "` resolves to `"Villa Byblos"`. We intentionally
 * stop short of typo tolerance / fuzzy matching — unknown values must
 * surface as a 400 from the caller, not be silently corrected.
 */
const VILLA_LOOKUP: Record<string, ButlerVillaName> = {
  mechmech:         "Villa Mechmech",
  byblos:           "Villa Byblos",
  "villa mechmech": "Villa Mechmech",
  "villa byblos":   "Villa Byblos",
};

/**
 * Resolve a Butler-supplied villa identifier to the canonical villa name.
 * Returns null if the input is missing, empty, or unknown — the caller is
 * responsible for surfacing the error (typically a 400 with a stable,
 * human-readable message).
 */
export function resolveButlerVilla(raw: string | null | undefined): ButlerVillaName | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return VILLA_LOOKUP[key] ?? null;
}
