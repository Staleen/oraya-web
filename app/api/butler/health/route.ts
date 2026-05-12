import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";

/**
 * Phase 16A.1 — read-only Butler liveness + secret check.
 *
 * - 503 if BUTLER_WEBHOOK_SECRET is unset.
 * - 401 if the X-Butler-Secret header is missing or invalid.
 * - 200 with { ok: true, service: "oraya-butler", mode: "read-only" } on success.
 *
 * No domain data, no Supabase calls.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  return NextResponse.json(
    { ok: true, service: "oraya-butler", mode: "read-only" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
