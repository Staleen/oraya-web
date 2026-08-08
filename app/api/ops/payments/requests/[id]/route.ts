import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYMENT_REQUEST_COLUMNS } from "@/lib/payments/ledger-server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let body: { action?: unknown };
  try { body = await request.json() as { action?: unknown }; } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.action !== "cancel") return NextResponse.json({ error: "Invalid action." }, { status: 400 });

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
