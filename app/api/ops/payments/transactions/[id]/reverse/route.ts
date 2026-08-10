import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let body: { reason?: unknown };
  try {
    body = await request.json() as { reason?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!reason) {
    return NextResponse.json({ error: "Explain why this receipt is being reversed." }, { status: 400 });
  }

  const { data: txn, error: loadError } = await supabaseAdmin
    .from("payment_transactions")
    .select("id, provider, transaction_type, status")
    .eq("id", id)
    .maybeSingle<{ id: string; provider: string; transaction_type: string; status: string }>();
  if (loadError) {
    console.error("[ops/payments/reverse] load failed", loadError.message);
    return NextResponse.json({ error: "Could not load that receipt." }, { status: 503 });
  }
  if (!txn) {
    return NextResponse.json({ error: "That transaction no longer exists." }, { status: 404 });
  }
  if (txn.provider !== "manual") {
    return NextResponse.json(
      {
        error:
          "Reverse is only for cash or manual receipts. For a card charge, use Refund card — Reverse does not return money to a guest card.",
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("oraya_reverse_manual_payment", {
    p_transaction_id: id,
    p_reason: reason,
    p_staff_id: auth.staff.id,
  });
  if (error) {
    if (error.message.includes("card_use_refund_not_reverse")) {
      return NextResponse.json(
        {
          error:
            "Reverse is only for cash or manual receipts. For a card charge, use Refund card.",
        },
        { status: 409 },
      );
    }
    const status = error.message.includes("transaction_not_found") ? 404 : 409;
    const message = error.message.includes("transaction_not_reversible")
      ? "That transaction cannot be reversed, or was already reversed."
      : error.message.includes("transaction_not_found")
        ? "That transaction no longer exists."
        : "Could not reverse that transaction.";
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ ok: true, result: Array.isArray(data) ? data[0] : data });
}
