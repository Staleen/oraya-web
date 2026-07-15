/**
 * Client-safe booking-view path helpers.
 *
 * Intentionally free of token signing, crypto, and server-only env reads so
 * it may be imported from `"use client"` surfaces such as /profile.
 */

/**
 * Accept only a same-origin relative `/booking/view/<token>` path.
 * Rejects absolute URLs, traversal, and other surfaces.
 */
export function isSafeRelativeBookingViewPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/booking/view/")) return false;
  if (path.includes("://") || path.includes("..") || path.includes("\\")) return false;
  const tokenPart = path.slice("/booking/view/".length);
  return tokenPart.length > 0 && !tokenPart.includes("/");
}

/** Build a same-origin relative booking-view path from a signed token. */
export function buildRelativeBookingViewPath(token: string): string {
  return `/booking/view/${encodeURIComponent(token)}`;
}
