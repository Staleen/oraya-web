import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

/** HttpOnly session cookie — value is base64url(payload).hmac, payload = { exp } */
export const ADMIN_SESSION_COOKIE = "oraya_admin";

const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

function getConfiguredAdminSecret(): string | null {
  const s = process.env.ADMIN_SECRET;
  return s?.trim() ? s.trim() : null;
}

export function createSignedAdminSession(adminSecret: string): { token: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", adminSecret).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, maxAge: SESSION_TTL_SEC };
}

export function verifyAdminSessionToken(token: string, adminSecret: string): boolean {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return false;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", adminSecret).update(payload).digest("base64url");
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    if (typeof parsed.exp !== "number") return false;
    if (Math.floor(Date.now() / 1000) > parsed.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function extractCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function timingSafeBearerEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Server-side guard for /api/admin/* routes (except verify-password / logout).
 * Accepts Authorization: Bearer <ADMIN_SECRET> OR valid signed HttpOnly session cookie.
 * @returns null if authorized, otherwise a NextResponse to return immediately.
 */
export function requireAdminAuth(request: Request): NextResponse | null {
  const secret = getConfiguredAdminSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_SECRET is not set." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer && timingSafeBearerEqual(bearer, secret)) {
    return null;
  }

  const cookie = extractCookie(request.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  if (cookie && verifyAdminSessionToken(cookie, secret)) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function attachAdminSessionCookie(response: NextResponse, adminSecret: string): void {
  const { token, maxAge } = createSignedAdminSession(adminSecret);
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Use on all browser-initiated admin API fetches so the session cookie is sent. */
export const adminApiFetchInit: RequestInit = {
  credentials: "include",
  cache: "no-store",
};
