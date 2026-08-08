import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let body: { reason?: unknown };
  try { body = await request.json() as { reason?: unknown }; } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!reason) return NextResponse.json({ error: "Explain why this receipt is being reversed." }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("oraya_reverse_manual_payment", {
    p_transaction_id: id, p_reason: reason, p_staff_id: auth.staff.id,
  });
  if (error) {
    const status = error.message.includes("transaction_not_found") ? 404 : 409;
    const message = error.message.includes("transaction_not_reversible")
      ? "That transaction cannot be reversed, or was already reversed."
      : error.message.includes("transaction_not_found") ? "That transaction no longer exists." : "Could not reverse that transaction.";
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ ok: true, result: Array.isArray(data) ? data[0] : data });
}
