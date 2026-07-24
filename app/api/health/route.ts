import { NextResponse } from "next/server";
import { evaluateHealth } from "@/lib/health";

// Plan 3 Phase 4 (KNOWN_BUGS #2): unauthenticated config health check for
// uptime monitoring. Returns key NAMES only — never values, never anything
// derived from a value. Must be evaluated per request, not at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const decision = evaluateHealth(process.env);
  if (decision.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, missing: decision.missing },
    { status: 503 },
  );
}
