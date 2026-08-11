import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { dispatchConfirmedStayWhatsAppNotification } from "@/lib/whatsapp/confirmed-stay-notification";
import {
  ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY,
  decideArrivalGuideRelease,
} from "@/lib/whatsapp/arrival-guide-gate";
import {
  appendArrivalGuideOverrideNote,
  assessArrivalGuideOverride,
  OVERRIDE_REFUSAL_COPY,
  validateOverrideReason,
} from "@/lib/whatsapp/arrival-guide-override";

/**
 * Release an arrival guide the payment gate is holding.
 *
 * The gate protects the reason to pay; this is the operator's deliberate
 * exception to it. GET reports whether an override is available and why not.
 * POST performs it, and refuses without a written reason — an override is a
 * decision about money, and one nobody wrote down did not happen.
 *
 * The override never marks the booking paid and never touches a ledger row.
 * It releases one message.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOG_TAG = "[api/ops/bookings/:id/arrival-guide/send-anyway]";

const COLUMNS =
  "id, status, villa, check_in, check_out, event_type, message, guest_name, guest_phone, member_id, amount_paid, amount_total, deposit_amount, whatsapp_confirmation_sent_at, payment_notes";

async function gateEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY)
    .maybeSingle<{ value: unknown }>();
  return String(data?.value ?? "").trim().toLowerCase() === "true";
}

type BookingRow = Record<string, unknown>;

async function loadBooking(id: string): Promise<BookingRow | null> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`${LOG_TAG} lookup error:`, error.message);
    return null;
  }
  return (data as BookingRow | null) ?? null;
}

function assess(row: BookingRow, enabled: boolean) {
  return assessArrivalGuideOverride(
    {
      status: row.status as string | null,
      gateEnabled: enabled,
      whatsappConfirmationSentAt: row.whatsapp_confirmation_sent_at as string | null,
      amountPaid: row.amount_paid == null ? null : Number(row.amount_paid),
      amountTotal: row.amount_total == null ? null : Number(row.amount_total),
      depositAmount: row.deposit_amount == null ? null : Number(row.deposit_amount),
    },
    decideArrivalGuideRelease,
  );
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const row = await loadBooking(id);
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
  }
  const availability = assess(row, await gateEnabled());
  return NextResponse.json(
    availability.available
      ? { ok: true, available: true }
      : { ok: true, available: false, reason: availability.reason, explanation: OVERRIDE_REFUSAL_COPY[availability.reason] },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const reasonCheck = validateOverrideReason(
    body && typeof body === "object" ? (body as Record<string, unknown>).reason : null,
  );
  if (!reasonCheck.ok) {
    return NextResponse.json(
      { ok: false, error: "reason_required", explanation: "Write why this guide is going out before the deposit." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const row = await loadBooking(id);
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  // Re-check at the moment of action, not from what the button saw.
  const availability = assess(row, await gateEnabled());
  if (!availability.available) {
    return NextResponse.json(
      { ok: false, error: availability.reason, explanation: OVERRIDE_REFUSAL_COPY[availability.reason] },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const result = await dispatchConfirmedStayWhatsAppNotification(
    {
      booking_id: String(row.id),
      status: "confirmed",
      villa: (row.villa as string | null) ?? null,
      check_in: (row.check_in as string | null) ?? null,
      check_out: (row.check_out as string | null) ?? null,
      event_type: (row.event_type as string | null) ?? null,
      message: (row.message as string | null) ?? null,
      guest_name: (row.guest_name as string | null) ?? null,
      guest_phone: (row.guest_phone as string | null) ?? null,
      member_id: (row.member_id as string | null) ?? null,
      amount_paid: row.amount_paid == null ? null : Number(row.amount_paid),
      amount_total: row.amount_total == null ? null : Number(row.amount_total),
      deposit_amount: row.deposit_amount == null ? null : Number(row.deposit_amount),
    },
    { arrivalGuidePaymentGateEnabled: true, overridePaymentGate: true },
  );

  // The reason is the point of the override. Record it whatever the send did,
  // appended to the same note history the operator already reads.
  const { error: noteError } = await supabaseAdmin
    .from("bookings")
    .update({
      payment_notes: appendArrivalGuideOverrideNote((row.payment_notes as string | null) ?? null, {
        reason: reasonCheck.reason,
        by: auth.staff.email,
        atIso: new Date().toISOString(),
      }),
    })
    .eq("id", String(row.id));
  if (noteError) {
    console.error(`${LOG_TAG} override reason could not be recorded:`, noteError.message);
  }

  console.warn(`${LOG_TAG} override used`, {
    booking_id: String(row.id),
    by: auth.staff.email,
    dispatched: result.dispatched,
  });

  return NextResponse.json(
    { ok: true, dispatched: result.dispatched, reason_recorded: !noteError },
    { headers: NO_STORE_HEADERS },
  );
}
