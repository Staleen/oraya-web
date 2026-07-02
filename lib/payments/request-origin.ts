import { SITE_URL } from "@/lib/brand";

function normalizeOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function getRequestOrigin(request: Request) {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(request.headers.get("host"));
  if (!host) return normalizeOrigin(request.url);

  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const requestProtocol = normalizeOrigin(request.url)?.startsWith("https://") ? "https" : "http";
  const protocol = forwardedProto || requestProtocol;

  return normalizeOrigin(`${protocol}://${host}`);
}

function isVercelPreviewOrigin(origin: string) {
  try {
    return new URL(origin).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function resolvePaymentRequestOrigin(request: Request) {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const requestOrigin = getRequestOrigin(request);

  if (process.env.VERCEL_ENV === "preview" && requestOrigin && isVercelPreviewOrigin(requestOrigin)) {
    return requestOrigin;
  }

  if (process.env.NODE_ENV !== "production" && requestOrigin && isLocalOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return configuredOrigin ?? SITE_URL;
}
