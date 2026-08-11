import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  runPaymentAttemptReconciliation,
  runProviderDriftSweep,
} from "@/lib/payments/reconcile-sweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily floor for polled payment reconciliation.
 *
 * Vercel Hobby allows a cron to run at most once per day — a more frequent
 * expression fails deployment outright. So this is the guaranteed floor, and
 * the same sweep also runs opportunistically whenever an operator opens the
 * payments desk, which in practice reconciles within seconds of anyone looking.
 */

function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(auth, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runPaymentAttemptReconciliation({ limit: 25 });
  // Second pass: money the provider says is gone that Oraya still counts —
  // a void performed directly in Business Center is invisible otherwise.
  const drift = await runProviderDriftSweep({ limit: 25, sinceDays: 30 });
  return NextResponse.json({ ok: true, ...summary, drift });
}
