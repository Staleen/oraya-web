import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Phase 16A.1 — server-only guard for `/api/butler/*` routes.
 *
 * Validates a shared-secret header (`X-Butler-Secret`) against
 * `process.env.BUTLER_WEBHOOK_SECRET`. Fails closed:
 *
 *   - missing/empty `BUTLER_WEBHOOK_SECRET` env → 503 (server misconfiguration)
 *   - missing or wrong `X-Butler-Secret` header → 401 (unauthorized)
 *   - match → null (caller proceeds)
 *
 * Header name and check shape are intentionally minimal. HMAC + timestamp
 * upgrade is a 16A.1.x follow-on once WhatChimp's outbound-signing posture
 * is confirmed — see /docs/system/DECISIONS_LOG.md (2026-05-12 entry).
 *
 * Server-only. Do not import from a "use client" component or any
 * NEXT_PUBLIC_* surface.
 */

/** Canonical inbound header carrying the shared secret. */
export const BUTLER_SECRET_HEADER = "x-butler-secret";

function getConfiguredButlerSecret(): string | null {
  const s = process.env.BUTLER_WEBHOOK_SECRET;
  return s?.trim() ? s.trim() : null;
}

function timingSafeStringEqual(a: string, b: string): boolean {
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
 * @returns null when the request is authorized; otherwise the NextResponse
 *          the caller should return immediately.
 */
export function requireButlerAuth(request: Request): NextResponse | null {
  const expected = getConfiguredButlerSecret();
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfiguration: BUTLER_WEBHOOK_SECRET is not set." },
      { status: 503 },
    );
  }

  const provided = request.headers.get(BUTLER_SECRET_HEADER);
  if (!provided) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!timingSafeStringEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
