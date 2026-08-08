import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { manualRailToLedger, PAYMENT_CURRENCIES } from "@/lib/payments/ledger";
import { roundMoney } from "@/lib/money";
import { sendLedgerBookingReceipt } from "@/lib/payments/ledger-receipt";

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? roundMoney(parsed) : null;
}

function nullableId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : null;
}

function rpcError(message: string, code?: string) {
  const known: Record<string, [string, number]> = {
    invalid_amount: ["Enter a valid amount.", 400], invalid_currency: ["Choose USD or LBP.", 400],
    invalid_manual_method: ["Choose a supported payment method.", 400], reference_required: ["A receipt or transfer reference is required.", 400],
    request_not_found: ["That payment request no longer exists.", 404], booking_not_found: ["That booking no longer exists.", 404],
    request_not_payable: ["That request is no longer payable.", 409], request_expired: ["That payment request has expired.", 409],
    overpayment: ["That is more than the payment request still needs.", 409], booking_mismatch: ["The payment request belongs to a different booking.", 409],
    changed_elsewhere: ["Someone else changed this booking's payments. Refresh and check it again.", 409],
    booking_request_currency_must_be_usd: ["Booking-linked requests must use USD.", 400],
  };
  for (const [needle, result] of Object.entries(known)) if (message.includes(needle)) return result;
  if (code === "23505") return ["This payment was already recorded.", 409] as [string, number];
  return ["Could not record that payment.", 503] as [string, number];
}

export async function POST(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const paymentRequestId = nullableId(body.payment_request_id);
  const bookingId = nullableId(body.booking_id);
  if (!paymentRequestId && !bookingId) return NextResponse.json({ error: "Choose a payment request or booking." }, { status: 400 });
  const received = amount(body.amount);
  const applied = amount(body.applied_amount ?? body.amount);
  const currency = typeof body.currency === "string" && PAYMENT_CURRENCIES.includes(body.currency as "USD" | "LBP") ? body.currency : null;
  const rail = typeof body.method === "string" ? manualRailToLedger(body.method) : null;
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 240) : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const effectiveAt = typeof body.effective_at === "string" && !Number.isNaN(Date.parse(body.effective_at))
    ? new Date(body.effective_at).toISOString() : new Date().toISOString();
  const expected = body.expected_booking_amount_paid === null || body.expected_booking_amount_paid === undefined
    ? null : Number(body.expected_booking_amount_paid);
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim().slice(0, 160) : "";

  if (!received || !applied || !currency) return NextResponse.json({ error: "Enter a valid amount and currency." }, { status: 400 });
  if (!rail) return NextResponse.json({ error: "Choose cash, bank transfer, Whish, OMT, Western Union, or Suyool." }, { status: 400 });
  if (!reference) return NextResponse.json({ error: "A receipt or transfer reference is required." }, { status: 400 });
  if (!idempotencyKey) return NextResponse.json({ error: "Refresh this form and try again." }, { status: 400 });
  if (expected !== null && (!Number.isFinite(expected) || expected < 0)) return NextResponse.json({ error: "Invalid booking balance." }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("oraya_record_manual_payment", {
    p_request_id: paymentRequestId, p_booking_id: bookingId, p_amount: received, p_currency: currency,
    p_applied_amount: applied, p_method: rail.method, p_provider: rail.provider, p_reference: reference,
    p_notes: notes || null, p_effective_at: effectiveAt, p_staff_id: auth.staff.id,
    p_expected_booking_amount_paid: expected, p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.error("[ops/payment-transactions] record failed", error.message);
    if (error.code === "23505") {
      const { data: existing } = await supabaseAdmin.from("payment_transactions")
        .select("id, payment_request_id, booking_id, status")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ ok: true, idempotent: true, result: { transaction_id: existing.id }, email_sent: false });
      }
    }
    const [friendly, status] = rpcError(error.message, error.code);
    return NextResponse.json({ error: friendly }, { status });
  }

  const result = Array.isArray(data) ? data[0] : data;
  let emailSent = false;
  if (bookingId) {
    try { emailSent = await sendLedgerBookingReceipt(bookingId); }
    catch (emailError) { console.error("[ops/payment-transactions] receipt email failed", emailError); }
  }
  return NextResponse.json({ ok: true, result, recorded_by: auth.staff.full_name, email_sent: emailSent });
}
