import { NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Ops session — the identity-carrying replacement for the shared admin login.
 *
 * The legacy `oraya_admin` cookie (lib/admin-auth.ts) signs a payload of
 * `{ exp }`: an expiry and nothing else. It cannot say who is acting, so no
 * admin action is attributable and no route can be restricted by role. This
 * cookie carries `{ sub, role, exp }` instead.
 *
 * Both cookies coexist deliberately. /admin keeps using the old one so the
 * production admin is untouched while /ops is built alongside it.
 */
export const OPS_SESSION_COOKIE = "oraya_ops";

const SESSION_TTL_SEC = 12 * 60 * 60; // a working day, not a week
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StaffRole = "owner" | "operator";

export interface StaffRecord {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
}

interface OpsSessionPayload {
  sub: string;
  role: StaffRole;
  exp: number;
}

function secret(): string | null {
  const s = process.env.ADMIN_SECRET;
  return s?.trim() ? s.trim() : null;
}

function sign(payloadB64: string, key: string): string {
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

export function createOpsSession(staff: Pick<StaffRecord, "id" | "role">, key: string): {
  token: string;
  maxAge: number;
} {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload: OpsSessionPayload = { sub: staff.id, role: staff.role, exp };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${b64}.${sign(b64, key)}`, maxAge: SESSION_TTL_SEC };
}

export function readOpsSessionToken(token: string, key: string): OpsSessionPayload | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const b64 = token.slice(0, dot);
    const got = Buffer.from(token.slice(dot + 1), "base64url");
    const want = Buffer.from(sign(b64, key), "base64url");
    if (got.length !== want.length) return null;
    if (!timingSafeEqual(got, want)) return null;
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as Partial<OpsSessionPayload>;
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (parsed.role !== "owner" && parsed.role !== "operator") return null;
    if (typeof parsed.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
    return { sub: parsed.sub, role: parsed.role, exp: parsed.exp };
  } catch {
    return null;
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() !== name) continue;
    return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export type OpsAuthResult =
  | { ok: true; staff: StaffRecord }
  | { ok: false; response: NextResponse };

/**
 * Guard for every /api/ops/* route.
 *
 * The role in the cookie is only a hint — the staff row is re-read on each
 * request so deactivating someone, or changing their role, takes effect
 * immediately rather than at the end of their 12-hour session.
 *
 * `requiredRole: "owner"` is what makes the operator restriction real. Hiding a
 * button in the UI restricts an honest person; this restricts the request.
 */
export async function requireOps(
  request: Request,
  options?: { requiredRole?: StaffRole },
): Promise<OpsAuthResult> {
  const key = secret();
  if (!key) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server misconfiguration: ADMIN_SECRET is not set." },
        { status: 503 },
      ),
    };
  }

  const raw = readCookie(request.headers.get("cookie"), OPS_SESSION_COOKIE);
  const payload = raw ? readOpsSessionToken(raw, key) : null;
  if (!payload) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, email, full_name, role, is_active")
    .eq("id", payload.sub)
    .maybeSingle();

  if (error) {
    // Fail closed: an unverifiable identity is not an authorised one.
    console.error("[ops-auth] staff lookup failed:", error.message);
    return {
      ok: false,
      response: NextResponse.json({ error: "Could not verify your account." }, { status: 503 }),
    };
  }
  if (!data || !data.is_active) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  const staff = data as StaffRecord;

  if (options?.requiredRole === "owner" && staff.role !== "owner") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only an owner can do this.", code: "owner_only" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, staff };
}

export function attachOpsSessionCookie(
  response: NextResponse,
  staff: Pick<StaffRecord, "id" | "role">,
  key: string,
): void {
  const { token, maxAge } = createOpsSession(staff, key);
  response.cookies.set({
    name: OPS_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearOpsSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: OPS_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Invite tokens are random, single-use, and stored only as a hash. */
export function createInviteToken(): { token: string; expiresAt: string } {
  return {
    token: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  };
}

export function opsApiFetchInit(): RequestInit {
  return { credentials: "include", cache: "no-store" };
}
