import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Permanently remove cancelled/expired/draft payment links that have no ledger
 * rows and no in-flight card attempts. Money history is never touched.
 */
export async function POST(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;

  const { data: closed, error: loadError } = await supabaseAdmin
    .from("payment_requests")
    .select("id")
    .in("status", ["cancelled", "expired", "draft"])
    .limit(200);
  if (loadError) {
    console.error("[ops/payment-requests] purge load failed", loadError.message);
    return NextResponse.json({ error: "Could not load closed payment links." }, { status: 503 });
  }

  const ids = (closed ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const [{ data: withMoney, error: moneyError }, { data: withAttempts, error: attemptError }] =
    await Promise.all([
      supabaseAdmin
        .from("payment_transactions")
        .select("payment_request_id")
        .in("payment_request_id", ids),
      supabaseAdmin
        .from("payment_attempts")
        .select("payment_request_id")
        .in("payment_request_id", ids)
        // `pending_authentication` (W7) counts as in-flight here, because it
        // is: the guest is mid 3-D Secure challenge. The enrolment call
        // authorises nothing, so such a request closes with zero transactions
        // and looks perfectly safe to delete — and the FK is
        // `on delete set null`, so deleting it would leave the attempt alive,
        // still blocking new payments on that booking, with nothing left in
        // Ops to identify it. KNOWN_BUGS #33.
        .in("status", ["claimed", "authorized", "ambiguous", "pending_authentication"]),
    ]);

  if (moneyError || attemptError) {
    console.error(
      "[ops/payment-requests] purge safety check failed",
      moneyError?.message,
      attemptError?.message,
    );
    return NextResponse.json({ error: "Could not check which closed links are safe to remove." }, { status: 503 });
  }

  const blocked = new Set<string>();
  for (const row of withMoney ?? []) {
    if (row.payment_request_id) blocked.add(row.payment_request_id);
  }
  for (const row of withAttempts ?? []) {
    if (row.payment_request_id) blocked.add(row.payment_request_id);
  }

  const deletable = ids.filter((id) => !blocked.has(id));
  if (deletable.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, kept: blocked.size });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("payment_requests")
    .delete()
    .in("id", deletable)
    .in("status", ["cancelled", "expired", "draft"]);
  if (deleteError) {
    console.error("[ops/payment-requests] purge delete failed", deleteError.message);
    return NextResponse.json({ error: "Could not remove unused closed links." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    deleted: deletable.length,
    kept: blocked.size,
  });
}
