/**
 * Unified Checkout validates the embedding page's origin against the capture
 * context's targetOrigins. The canonical configured origin is the bare
 * `https://stayoraya.com`, but production serves the checkout page on
 * `https://www.stayoraya.com` after the bare-domain redirect — a context
 * minted for only one variant fails client-side initialization with no
 * charge (observed in production 2026-08-10). Both host variants are
 * therefore allowed for ordinary web hosts; preview/local/IP hosts keep the
 * single exact origin, and deeper subdomains are never guessed.
 */
export function expandTargetOrigins(targetOrigin: string): string[] {
  try {
    const url = new URL(targetOrigin);
    const host = url.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ) {
      return [targetOrigin];
    }
    const sibling = host.startsWith("www.")
      ? host.slice(4)
      : host.split(".").length === 2
        ? `www.${host}`
        : null;
    if (!sibling) return [targetOrigin];
    const siblingUrl = new URL(targetOrigin);
    siblingUrl.hostname = sibling;
    return [targetOrigin, siblingUrl.origin];
  } catch {
    return [targetOrigin];
  }
}
