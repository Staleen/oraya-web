import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { roundMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/bookings/[id]]";

const RETURN_COLUMNS =
  "id, status, amount_total, amount_paid, amount_due, payment_status, payment_method, payment_reference, payment_received_at, payment_marked_by, payment_notes, refund_status, refund_amount, refunded_at, refund_provider_reference";

function nonNegative(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

/**
 * Money actions for /ops.
 *
 * Both actions are guarded against the concurrent-overwrite bug (audit B-13):
 * the client sends the value it was shown, and the update only applies if the
 * database still holds it. With one shared login that race was theoretical;
 * with an operator and an owner both working, it is not. A losing write gets a
 * 409 and the operator is told to look again, rather than silently erasing the
 * other person's entry.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const who = auth.staff.full_name;
  const now = new Date().toISOString();

  if (action === "record_payment") {
    const amount = nonNegative(body.amount);
    const expected = nonNegative(body.expected_amount_paid ?? 0);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const method = typeof body.method === "string" ? body.method.trim() : "";

    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: "Enter how much came in." }, { status: 400 });
    }
    if (expected === null) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!reference) {
      return NextResponse.json({ error: "A bank or receipt reference is required." }, { status: 400 });
    }

    const next = roundMoney(expected + amount);
    let q = supabaseAdmin
      .from("bookings")
      .update({
        amount_paid: next,
        payment_method: method || undefined,
        payment_reference: reference,
        payment_received_at: now,
        payment_marked_by: who,
      })
      .eq("id", id);
    // PostgREST does not match NULL with .eq, so a first payment against a
    // null column has to be matched explicitly.
    q = expected === 0 ? q.or("amount_paid.is.null,amount_paid.eq.0") : q.eq("amount_paid", expected);

    const { data, error } = await q.select(RETURN_COLUMNS).maybeSingle();
    if (error) {
      console.error(`${LOG_TAG} record_payment failed:`, error.message);
      return NextResponse.json({ error: "Could not record that payment." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        {
          error: "Someone else changed this booking's payments while you were typing. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, booking: data, recorded_by: who });
  }

  if (action === "record_refund") {
    const amount = nonNegative(body.amount);
    const expected = nonNegative(body.expected_refund_amount ?? 0);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: "Enter how much you returned." }, { status: 400 });
    }
    if (expected === null) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!reference) {
      return NextResponse.json({ error: "A bank reference is required." }, { status: 400 });
    }

    const next = roundMoney(expected + amount);
    let q = supabaseAdmin
      .from("bookings")
      .update({
        refund_amount: next,
        refund_status: "refunded",
        refunded_at: now,
        refund_provider_reference: reference,
        payment_marked_by: who,
      })
      .eq("id", id);
    q = expected === 0 ? q.or("refund_amount.is.null,refund_amount.eq.0") : q.eq("refund_amount", expected);

    const { data, error } = await q.select(RETURN_COLUMNS).maybeSingle();
    if (error) {
      console.error(`${LOG_TAG} record_refund failed:`, error.message);
      return NextResponse.json({ error: "Could not record that refund." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        {
          error: "Someone else recorded a refund on this booking while you were typing. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, booking: data, recorded_by: who });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
