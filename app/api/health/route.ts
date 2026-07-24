import { NextResponse } from "next/server";
import { evaluateHealth } from "@/lib/health";
import { countStuckPaymentAttempts } from "@/lib/payments/payment-attempts-store";

// Plan 3 Phase 4 (KNOWN_BUGS #2): unauthenticated config health check for
// uptime monitoring. Returns key NAMES only — never values, never anything
// derived from a value. Must be evaluated per request, not at build time.
//
// Plan 4 Phase 2 (2.3): also reports reconciliation visibility — counts of
// payment_attempts rows stuck in claimed/ambiguous older than 1 hour. Counts
// ONLY (no amounts, no guest data); does not affect the ok/503 verdict.
export const dynamic = "force-dynamic";

const STUCK_ATTEMPT_THRESHOLD_HOURS = 1;

async function readPaymentAttemptVisibility() {
  const cutoff = new Date(
    Date.now() - STUCK_ATTEMPT_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const stuck = await countStuckPaymentAttempts(cutoff);
  if (!stuck) {
    return { available: false as const };
  }
  return {
    available: true as const,
    threshold_hours: STUCK_ATTEMPT_THRESHOLD_HOURS,
    ...stuck,
  };
}

export async function GET() {
  const decision = evaluateHealth(process.env);
  const paymentAttempts = await readPaymentAttemptVisibility();
  if (decision.ok) {
    return NextResponse.json({ ok: true, payment_attempts: paymentAttempts });
  }
  return NextResponse.json(
    { ok: false, missing: decision.missing, payment_attempts: paymentAttempts },
    { status: 503 },
  );
}
