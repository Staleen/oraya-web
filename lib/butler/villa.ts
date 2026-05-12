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

const VILLA_SLUG_MAP: Record<string, ButlerVillaName> = {
  mechmech: "Villa Mechmech",
  byblos:   "Villa Byblos",
};

/**
 * Resolve a URL-supplied villa slug to the canonical villa name.
 * Returns null if the slug is missing, empty, or unknown — the caller
 * is responsible for surfacing the error (typically a 400 with a
 * stable, human-readable message).
 */
export function resolveButlerVilla(raw: string | null | undefined): ButlerVillaName | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  if (!slug) return null;
  return VILLA_SLUG_MAP[slug] ?? null;
}
