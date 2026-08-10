/**
 * CyberSource Unified Checkout (v2 client) requires the capture context's
 * targetOrigins to contain EXACTLY the origins in use: a listed-but-unused
 * origin fails initialization with UNUSED_TARGET_ORIGINS, and a missing one
 * fails origin validation (both observed in production 2026-08-10; no charge
 * either way). The canonical configured origin is the bare
 * `https://stayoraya.com`, but guests reach checkout on
 * `https://www.stayoraya.com` after the bare-domain redirect — so the
 * context must be minted for the origin the guest is actually on.
 *
 * `resolveEffectiveCheckoutOrigin` trusts the live request origin ONLY when
 * it is the canonical origin or its exact www/bare sibling; anything else
 * (spoofed forwarded hosts included) falls back to the canonical origin.
 */
export function isCanonicalOriginFamily(candidateOrigin: string, canonicalOrigin: string): boolean {
  try {
    const candidate = new URL(candidateOrigin);
    const canonical = new URL(canonicalOrigin);
    if (candidate.protocol !== "https:" || candidate.port !== canonical.port) return false;
    const strip = (host: string) => (host.startsWith("www.") ? host.slice(4) : host);
    return strip(candidate.hostname) === strip(canonical.hostname);
  } catch {
    return false;
  }
}

export function resolveEffectiveCheckoutOrigin(
  requestOrigin: string | null,
  canonicalOrigin: string,
): string {
  if (requestOrigin && isCanonicalOriginFamily(requestOrigin, canonicalOrigin)) {
    return requestOrigin;
  }
  return canonicalOrigin;
}
