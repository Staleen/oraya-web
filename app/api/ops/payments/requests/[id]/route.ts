import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYMENT_REQUEST_COLUMNS } from "@/lib/payments/ledger-server";

/**
 * PATCH: cancel an active/partial link.
 * DELETE: permanently remove a cancelled/expired/draft link with no ledger
 * rows and no in-flight provider attempts.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let body: { action?: unknown };
  try {
    body = await request.json() as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("payment_requests")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", id)
    .in("status", ["active", "partially_paid"])
    .select(PAYMENT_REQUEST_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not cancel that payment request." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "That request is no longer active." }, { status: 409 });
  return NextResponse.json({ ok: true, request: { ...data, public_token_ciphertext: undefined } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(_request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const { data: existing, error: loadError } = await supabaseAdmin
    .from("payment_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (loadError) {
    console.error("[ops/payment-requests] delete load failed", loadError.message);
    return NextResponse.json({ error: "Could not load that payment link." }, { status: 503 });
  }
  if (!existing) {
    return NextResponse.json({ error: "That payment link no longer exists." }, { status: 404 });
  }
  if (!["cancelled", "expired", "draft"].includes(existing.status)) {
    return NextResponse.json(
      { error: "Cancel the link first, then you can remove it from the list." },
      { status: 409 },
    );
  }

  const { count, error: countError } = await supabaseAdmin
    .from("payment_transactions")
    .select("id", { count: "exact", head: true })
    .eq("payment_request_id", id);
  if (countError) {
    console.error("[ops/payment-requests] delete count failed", countError.message);
    return NextResponse.json({ error: "Could not check money history for that link." }, { status: 503 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This link has money history, so it cannot be deleted. It stays in Closed links for the audit trail.",
      },
      { status: 409 },
    );
  }

  const { count: openAttempts, error: attemptError } = await supabaseAdmin
    .from("payment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("payment_request_id", id)
    .in("status", ["claimed", "authorized", "ambiguous"]);
  if (attemptError) {
    console.error("[ops/payment-requests] open attempt count failed", attemptError.message);
    return NextResponse.json({ error: "Could not check open card attempts for that link." }, { status: 503 });
  }
  if ((openAttempts ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This link still has an unfinished card attempt. Resolve it under Needs your attention first.",
      },
      { status: 409 },
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("payment_requests")
    .delete()
    .eq("id", id)
    .in("status", ["cancelled", "expired", "draft"]);
  if (deleteError) {
    console.error("[ops/payment-requests] delete failed", deleteError.message);
    return NextResponse.json({ error: "Could not delete that payment link." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
