const VILLA_SLUGS: Record<string, string> = {
  "Villa Mechmech": "mechmech",
  "Villa Byblos": "byblos",
};

const SLUG_TO_VILLA: Record<string, string> = Object.fromEntries(
  Object.entries(VILLA_SLUGS).flatMap(([villa, slug]) => [
    [slug, villa],
    [`villa-${slug}`, villa],
  ])
);

export const KNOWN_VILLAS = Object.keys(VILLA_SLUGS);

export function getVillaSlug(villa: string): string | null {
  return VILLA_SLUGS[villa] ?? null;
}

export function resolveVillaFromSlug(slug: string): string | null {
  return SLUG_TO_VILLA[slug.toLowerCase()] ?? null;
}
