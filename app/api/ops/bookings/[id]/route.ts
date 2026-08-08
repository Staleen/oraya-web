import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { roundMoney } from "@/lib/money";
import {
  dispatchBookingStatusGuestMessages,
  isEventInquiryBooking,
  type GuestDispatchBookingRow,
} from "@/lib/booking-guest-dispatch";
import { findAvailabilityConflict } from "@/lib/calendar/availability";
import { isExclusionViolation } from "@/lib/db-errors";
import { resolveBookingRecipient } from "@/lib/booking-recipient";
import {
  sendBookingPaymentReceivedEmail,
  sendBookingPaymentReminderEmail,
  sendBookingPaymentRequestedEmail,
} from "@/lib/send-booking-payment-email";
import { appendPaymentReminderNote } from "@/lib/payment-reminders";
import { sendEventProposalEmail } from "@/lib/send-event-proposal-email";
import { sendFeedbackRequestEmail } from "@/lib/send-feedback-request-email";
import { isFeedbackEmailCooldownActive, isPastCheckoutForFeedbackEmail } from "@/lib/booking-feedback-eligibility";
import { parseEventSetupEstimateFromMessage } from "@/lib/event-inquiry-message";
import { buildProposalEmailLineItems } from "@/lib/event-proposal-line-items";
import {
  computeFoundationAmountDue,
  derivePaymentFoundationStage,
  getFoundationAmountTotal,
} from "@/lib/payment-foundation";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/bookings/[id]]";

const RETURN_COLUMNS =
  "id, status, amount_total, amount_paid, amount_due, payment_status, payment_method, payment_reference, payment_received_at, payment_marked_by, payment_notes, refund_status, refund_amount, refunded_at, refund_provider_reference";

/** Everything the shared guest dispatch reads, plus the lifecycle fields. */
const DISPATCH_COLUMNS =
  "id, status, villa, check_in, check_out, event_type, message, guest_name, guest_email, guest_phone, member_id, sleeping_guests, day_visitors, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, proposal_total_amount";

/** DISPATCH_COLUMNS plus what the 16B payment emails and ledger math read. */
const PAYMENT_COLUMNS =
  `${DISPATCH_COLUMNS}, payment_status, payment_stage, payment_method, payment_reference, payment_notes, deposit_amount, amount_paid, amount_total, amount_due, payment_due_at, payment_requested_at, proposal_deposit_amount`;

interface PaymentRow {
  id: string;
  status: string | null;
  villa: string;
  check_in: string;
  check_out: string;
  event_type: string | null;
  message: string | null;
  guest_name: string | null;
  guest_email: string | null;
  member_id: string | null;
  addons_snapshot: unknown;
  pricing_subtotal: number | string | null;
  pricing_snapshot: Record<string, unknown> | null;
  proposal_total_amount: number | null;
  proposal_deposit_amount: number | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  deposit_amount: number | null;
  amount_paid: number | null;
  amount_total: number | null;
  payment_due_at: string | null;
}

/** Same payload shape the admin PATCH route hands the 16B payment senders. */
function paymentEmailPayload(row: PaymentRow, to: string, name: string) {
  return {
    to,
    name,
    villa: row.villa,
    check_in: row.check_in,
    check_out: row.check_out,
    booking_id: row.id,
    payment_status: row.payment_status ?? null,
    deposit_amount: row.deposit_amount ?? null,
    amount_paid: row.amount_paid ?? null,
    payment_due_at: row.payment_due_at ?? null,
    payment_method: row.payment_method ?? null,
    payment_reference: row.payment_reference ?? null,
    pricing_subtotal: row.pricing_subtotal ?? null,
    pricing_snapshot: row.pricing_snapshot ?? null,
    addons_snapshot: Array.isArray(row.addons_snapshot) ? (row.addons_snapshot as never[]) : null,
    event_type: row.event_type ?? null,
    proposal_total_amount: row.proposal_total_amount ?? null,
    is_event_inquiry: isEventInquiryBooking(row),
  };
}

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

    // 16B continuity: recording money moves the SAME lifecycle the payment
    // system reads — payment_status, payment_stage, amount_total/amount_due
    // via the shared foundation helpers — and sends the same receipt email
    // the legacy admin sends. Not a parallel ledger.
    const { data: rowData, error: rowError } = await supabaseAdmin
      .from("bookings")
      .select(PAYMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (rowError) {
      console.error(`${LOG_TAG} record_payment load failed:`, rowError.message);
      return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
    }
    if (!rowData) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }
    const row = rowData as unknown as PaymentRow;

    const next = roundMoney(expected + amount);
    const foundationTotal = row.amount_total ?? getFoundationAmountTotal(row as never);
    const nextStatus =
      typeof foundationTotal === "number" && next >= foundationTotal ? "paid_in_full" : "deposit_paid";

    let q = supabaseAdmin
      .from("bookings")
      .update({
        amount_paid: next,
        payment_method: method || undefined,
        payment_reference: reference,
        payment_received_at: now,
        payment_last_at: now,
        payment_status: nextStatus,
        payment_stage: derivePaymentFoundationStage(next, foundationTotal),
        amount_total: foundationTotal,
        amount_due: computeFoundationAmountDue(foundationTotal, next),
        // Live-verified 2026-08-07: payment_marked_by is a uuid column — writing
        // the person's NAME made every /ops payment recording fail with 503.
        // The id is the attribution; the response carries the name for display.
        payment_marked_by: auth.staff.id,
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

    // Same receipt email the admin record-payment sends (B-10 lesson: the UI
    // discloses this before the click). Never blocks the recording.
    let emailSent = false;
    try {
      const recipient = await resolveBookingRecipient(supabaseAdmin, row);
      if (recipient.email) {
        await sendBookingPaymentReceivedEmail(
          paymentEmailPayload(
            { ...row, payment_status: nextStatus, amount_paid: next, payment_method: method || row.payment_method, payment_reference: reference },
            recipient.email,
            recipient.name,
          ),
        );
        emailSent = true;
      }
    } catch (emailErr) {
      console.error(`${LOG_TAG} receipt email failed:`, emailErr);
    }

    return NextResponse.json({ ok: true, booking: data, recorded_by: who, email_sent: emailSent });
  }

  // ── Request payment / reminder — the 16B ask-for-money flow ───────────────

  if (action === "request_deposit") {
    const deposit = nonNegative(body.deposit_amount);
    const total = body.amount_total === null || body.amount_total === undefined ? null : nonNegative(body.amount_total);
    const dueAt = typeof body.due_at === "string" && body.due_at.trim() ? body.due_at.trim() : null;
    if (deposit === null || deposit <= 0) {
      return NextResponse.json({ error: "Enter the deposit to request." }, { status: 400 });
    }
    if (dueAt !== null && Number.isNaN(Date.parse(dueAt))) {
      return NextResponse.json({ error: "That due date doesn't parse." }, { status: 400 });
    }

    const { data: rowData, error: rowError } = await supabaseAdmin
      .from("bookings")
      .select(PAYMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (rowError) {
      console.error(`${LOG_TAG} request_deposit load failed:`, rowError.message);
      return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
    }
    if (!rowData) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }
    const row = rowData as unknown as PaymentRow;

    // Events use the SAME payment lifecycle once confirmed — their contract
    // total is the accepted proposal rather than the stay estimate.
    if ((row.status ?? "").toLowerCase() !== "confirmed") {
      return NextResponse.json(
        { error: "Approve the stay before asking for money." },
        { status: 400 },
      );
    }
    if (row.payment_status === "paid_in_full") {
      return NextResponse.json({ error: "This stay is already fully paid." }, { status: 400 });
    }

    const paid = row.amount_paid ?? 0;
    const amountTotal = total ?? row.amount_total ?? getFoundationAmountTotal(row as never);
    if (typeof amountTotal === "number" && deposit > Math.max(0, amountTotal - paid)) {
      return NextResponse.json(
        { error: "That deposit is more than what's left to pay." },
        { status: 400 },
      );
    }

    // Race guard on the lifecycle value the operator was shown.
    const expectedStatus =
      typeof body.expected_payment_status === "string" && body.expected_payment_status
        ? body.expected_payment_status
        : null;
    let q = supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "payment_requested",
        payment_requested_at: now,
        deposit_amount: deposit,
        payment_due_at: dueAt,
        amount_total: amountTotal,
        amount_due: computeFoundationAmountDue(amountTotal, paid),
        payment_stage: derivePaymentFoundationStage(paid, amountTotal),
      })
      .eq("id", id)
      .eq("status", "confirmed");
    q = expectedStatus === null
      ? q.or("payment_status.is.null,payment_status.eq.unpaid")
      : q.eq("payment_status", expectedStatus);

    const { data, error } = await q.select(RETURN_COLUMNS).maybeSingle();
    if (error) {
      console.error(`${LOG_TAG} request_deposit failed:`, error.message);
      return NextResponse.json({ error: "Could not request the payment." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        {
          error: "This booking's payment state changed while you were looking at it. Open it again first.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }

    let emailSent = false;
    try {
      const recipient = await resolveBookingRecipient(supabaseAdmin, row);
      if (recipient.email) {
        await sendBookingPaymentRequestedEmail(
          paymentEmailPayload(
            { ...row, payment_status: "payment_requested", deposit_amount: deposit, payment_due_at: dueAt, amount_total: amountTotal },
            recipient.email,
            recipient.name,
          ),
        );
        emailSent = true;
      }
    } catch (emailErr) {
      console.error(`${LOG_TAG} request email failed:`, emailErr);
    }

    return NextResponse.json({ ok: true, booking: data, acted_by: who, email_sent: emailSent });
  }

  if (action === "send_reminder") {
    const { data: rowData, error: rowError } = await supabaseAdmin
      .from("bookings")
      .select(PAYMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (rowError) {
      console.error(`${LOG_TAG} send_reminder load failed:`, rowError.message);
      return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
    }
    if (!rowData) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }
    const row = rowData as unknown as PaymentRow;

    // Same preconditions as the admin reminder (16B rules, not new ones).
    if ((row.status ?? "").toLowerCase() !== "confirmed") {
      return NextResponse.json({ error: "Reminders are only for approved stays." }, { status: 400 });
    }
    if ((row.payment_status?.trim() || "unpaid") !== "payment_requested") {
      return NextResponse.json(
        { error: "Reminders only make sense while a payment request is open." },
        { status: 400 },
      );
    }

    let emailSent = false;
    try {
      const recipient = await resolveBookingRecipient(supabaseAdmin, row);
      if (!recipient.email) {
        return NextResponse.json({ error: "This booking has no email address to remind." }, { status: 400 });
      }
      await sendBookingPaymentReminderEmail(paymentEmailPayload(row, recipient.email, recipient.name));
      emailSent = true;
    } catch (emailErr) {
      console.error(`${LOG_TAG} reminder email failed:`, emailErr);
      return NextResponse.json({ error: "The reminder email could not be sent." }, { status: 503 });
    }

    // Same bookkeeping the admin path keeps: the reminder trail in the notes.
    const reminderNotes = appendPaymentReminderNote(row.payment_notes ?? null, now);
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ payment_notes: reminderNotes })
      .eq("id", id)
      .select(RETURN_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      console.error(`${LOG_TAG} reminder note update failed:`, error?.message);
      // The email went out; the note is bookkeeping — report honestly.
      return NextResponse.json({ ok: true, booking: null, acted_by: who, email_sent: emailSent, note_saved: false });
    }

    return NextResponse.json({ ok: true, booking: data, acted_by: who, email_sent: emailSent, note_saved: true });
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
        // uuid column — see record_payment above.
        payment_marked_by: auth.staff.id,
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

  // ── Feedback request — mirror of the admin send-feedback rules ────────────

  if (action === "request_feedback") {
    const { data: rowData, error: rowError } = await supabaseAdmin
      .from("bookings")
      .select("id, status, check_out, member_id, guest_email, guest_name, event_type, message, feedback_requested_at, feedback_requested_channel, feedback_request_count")
      .eq("id", id)
      .maybeSingle();
    if (rowError) {
      console.error(`${LOG_TAG} request_feedback load failed:`, rowError.message);
      return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
    }
    if (!rowData) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }
    const row = rowData as unknown as {
      id: string; status: string | null; check_out: string | null;
      member_id: string | null; guest_email: string | null; guest_name: string | null;
      event_type: string | null; message: string | null;
      feedback_requested_at: string | null; feedback_request_count: number | null;
    };

    if (row.status !== "confirmed") {
      return NextResponse.json({ error: "Feedback is only asked after a confirmed stay." }, { status: 400 });
    }
    if (!isPastCheckoutForFeedbackEmail(row.check_out)) {
      return NextResponse.json({ error: "Wait until the stay has ended before asking for feedback." }, { status: 400 });
    }
    if (isFeedbackEmailCooldownActive(row.feedback_requested_at)) {
      return NextResponse.json({ error: "Feedback was already requested recently." }, { status: 409 });
    }

    const recipient = await resolveBookingRecipient(supabaseAdmin, row);
    if (!recipient.email) {
      return NextResponse.json({ error: "This booking has no email address." }, { status: 400 });
    }

    try {
      await sendFeedbackRequestEmail({
        to: recipient.email,
        guestName: recipient.name,
        isEvent: isEventInquiryBooking(row),
      });
    } catch (emailErr) {
      console.error(`${LOG_TAG} feedback email failed:`, emailErr);
      return NextResponse.json({ error: "The feedback email could not be sent." }, { status: 503 });
    }

    const prevCount = typeof row.feedback_request_count === "number" && Number.isFinite(row.feedback_request_count)
      ? row.feedback_request_count
      : 0;
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        feedback_requested_at: now,
        feedback_requested_channel: "email",
        feedback_request_count: prevCount + 1,
      })
      .eq("id", id)
      .select(RETURN_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      console.error(`${LOG_TAG} feedback bookkeeping failed:`, error?.message);
      return NextResponse.json({ ok: true, booking: null, acted_by: who, email_sent: true, note_saved: false });
    }

    return NextResponse.json({ ok: true, booking: data, acted_by: who, email_sent: true });
  }

  // ── Event proposal — draft and send (Phase 15H contract, unchanged) ───────

  if (action === "save_proposal" || action === "send_proposal") {
    const sending = action === "send_proposal";
    const totalAmount = nonNegative(body.total_amount);
    const depositAmount =
      body.deposit_amount === null || body.deposit_amount === undefined
        ? null
        : nonNegative(body.deposit_amount);
    const validUntil = typeof body.valid_until === "string" && body.valid_until.trim() ? body.valid_until.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes : null;
    const methods = Array.isArray(body.payment_methods)
      ? body.payment_methods.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      : [];

    // Line items — what the guest is actually being offered. Same shape the
    // locked admin route stores and the proposal email renders (Phase 15H).
    let includedServices: Array<Record<string, unknown>> | null = null;
    if (Object.prototype.hasOwnProperty.call(body, "included_services")) {
      if (!Array.isArray(body.included_services)) {
        return NextResponse.json({ error: "Invalid line items." }, { status: 400 });
      }
      try {
        includedServices = body.included_services.map((item) => {
          if (!item || typeof item !== "object") throw new Error("Invalid line item.");
          const s = item as Record<string, unknown>;
          const label = typeof s.label === "string" ? s.label.trim() : "";
          if (!label) throw new Error("Every line needs a name.");
          const num = (v: unknown, field: string): number | null => {
            if (v === null || v === undefined || v === "") return null;
            if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`"${label}" has an invalid ${field}.`);
            return v;
          };
          return {
            ...(typeof s.id === "string" && s.id.trim() ? { id: s.id.trim() } : {}),
            label,
            unit_label: typeof s.unit_label === "string" && s.unit_label.trim() ? s.unit_label.trim() : null,
            quantity: num(s.quantity, "quantity"),
            unit_price: num(s.unit_price, "unit price"),
            line_total: num(s.line_total, "line total"),
            admin_status: s.admin_status === "approved" || s.admin_status === "declined" ? s.admin_status : null,
            source: s.source === "requested" || s.source === "custom" ? s.source : null,
            notes: typeof s.notes === "string" && s.notes.trim() ? s.notes.trim() : null,
          };
        });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid line items." },
          { status: 400 },
        );
      }
    }

    const { data: rowData, error: rowError } = await supabaseAdmin
      .from("bookings")
      .select(`${PAYMENT_COLUMNS}, proposal_status, proposal_valid_until, proposal_included_services, proposal_payment_methods, proposal_notes`)
      .eq("id", id)
      .maybeSingle();
    if (rowError) {
      console.error(`${LOG_TAG} proposal load failed:`, rowError.message);
      return NextResponse.json({ error: "Could not load this enquiry." }, { status: 503 });
    }
    if (!rowData) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }
    const row = rowData as unknown as PaymentRow & {
      proposal_status: string | null;
      proposal_included_services: unknown;
      proposal_payment_methods: unknown;
    };

    if (!isEventInquiryBooking(row)) {
      return NextResponse.json({ error: "Proposals are for event enquiries." }, { status: 400 });
    }
    // A guest has already accepted this contract — changing its totals is the
    // audit B-11 hazard, so /ops refuses rather than confirming.
    if (row.proposal_status === "accepted") {
      return NextResponse.json(
        { error: "The guest already accepted this proposal. Changing it needs the legacy admin." },
        { status: 409 },
      );
    }

    if (sending) {
      if (totalAmount === null || totalAmount <= 0) {
        return NextResponse.json({ error: "Set the total before sending." }, { status: 400 });
      }
      if (!validUntil || Number.isNaN(Date.parse(validUntil))) {
        return NextResponse.json({ error: "Set a date the proposal is valid until." }, { status: 400 });
      }
      // Audit B-12: never send a proposal that is already expired.
      if (Date.parse(validUntil) <= Date.now()) {
        return NextResponse.json({ error: "That validity date has already passed." }, { status: 400 });
      }
      if (methods.length === 0) {
        return NextResponse.json({ error: "Choose at least one way they can pay." }, { status: 400 });
      }
    }

    const patch: Record<string, unknown> = {
      proposal_total_amount: totalAmount,
      proposal_deposit_amount: depositAmount,
      proposal_valid_until: validUntil,
      proposal_payment_methods: methods,
      proposal_notes: notes,
      ...(includedServices ? { proposal_included_services: includedServices } : {}),
    };
    if (sending) {
      patch.proposal_status = "sent";
      patch.proposal_sent_at = now;
    } else if (!row.proposal_status || row.proposal_status === "draft") {
      patch.proposal_status = "draft";
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update(patch)
      .eq("id", id)
      .neq("proposal_status", "accepted")
      .select(RETURN_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_TAG} proposal save failed:`, error.message);
      return NextResponse.json({ error: "Could not save the proposal." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "This proposal changed while you were editing it. Open it again.", code: "changed_elsewhere" },
        { status: 409 },
      );
    }

    if (!sending) {
      return NextResponse.json({ ok: true, booking: data, acted_by: who, email_sent: false });
    }

    let emailSent = false;
    try {
      const recipient = await resolveBookingRecipient(supabaseAdmin, row);
      if (recipient.email) {
        const estimate = parseEventSetupEstimateFromMessage(typeof row.message === "string" ? row.message : "");
        const includedRaw = Array.isArray(row.proposal_included_services) ? row.proposal_included_services : [];
        await sendEventProposalEmail({
          to: recipient.email,
          name: recipient.name,
          booking_id: id,
          villa: row.villa,
          check_in: row.check_in,
          check_out: row.check_out,
          event_type: row.event_type ?? null,
          proposal_total_amount: totalAmount,
          proposal_deposit_amount: depositAmount,
          proposal_valid_until: validUntil,
          proposal_payment_methods: methods,
          service_lines: buildProposalEmailLineItems(includedRaw as never, estimate),
        });
        emailSent = true;
      }
    } catch (emailErr) {
      console.error(`${LOG_TAG} proposal email failed:`, emailErr);
    }

    return NextResponse.json({ ok: true, booking: data, acted_by: who, email_sent: emailSent });
  }

  // ── Approve / decline ──────────────────────────────────────────────────────
  //
  // Both write the SAME status values the legacy admin writes, and both hand
  // guest messaging to lib/booking-guest-dispatch.ts — the one shared copy —
  // so a guest approved from /ops receives exactly what /admin sends.
  //
  // Both are also raced-guarded the same way as the money actions: the update
  // only applies while the booking still holds the status the operator was
  // LOOKING AT when they pressed the button, else 409.

  if (action === "approve" || action === "decline") {
    const { data: booking, error: loadError } = await supabaseAdmin
      .from("bookings")
      .select(`${DISPATCH_COLUMNS}, proposal_status`)
      .eq("id", id)
      .maybeSingle();

    if (loadError) {
      console.error(`${LOG_TAG} ${action} load failed:`, loadError.message);
      return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
    }
    if (!booking) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }

    const bookingRow = booking as unknown as {
      status: string | null;
      villa: string;
      check_in: string;
      check_out: string;
      event_type: string | null;
      message: string | null;
      proposal_status: string | null;
    };
    const currentStatus = (bookingRow.status ?? "").trim().toLowerCase();
    const isEvent = isEventInquiryBooking(bookingRow);

    // Same rule the locked admin route enforces: an event is only confirmed
    // after the GUEST accepted its proposal. Declining an event is allowed at
    // any stage (it is a cancellation, not a contract change).
    if (isEvent && action === "approve" && bookingRow.proposal_status !== "accepted") {
      return NextResponse.json(
        { error: "Wait for the guest to accept the proposal before confirming this event." },
        { status: 400 },
      );
    }

    if (action === "approve") {
      if (currentStatus !== "pending") {
        return NextResponse.json(
          {
            error:
              currentStatus === "confirmed"
                ? "This stay is already approved."
                : "This booking is no longer awaiting approval. Open it again to see where it stands.",
            code: "changed_elsewhere",
          },
          { status: 409 },
        );
      }

      // Same pre-write availability check the legacy admin confirm runs.
      try {
        const conflict = await findAvailabilityConflict(
          bookingRow.villa,
          bookingRow.check_in,
          bookingRow.check_out,
          id,
          // Phase 14J: a confirmed event also blocks its setup day, so the
          // overlap test must widen for events exactly as the admin does.
          isEvent,
        );
        if (conflict) {
          return NextResponse.json(
            {
              error: `Cannot approve — ${bookingRow.villa} already has a blocked stay from ${conflict.check_in} to ${conflict.check_out} that overlaps these dates.`,
            },
            { status: 409 },
          );
        }
      } catch (conflictErr) {
        console.error(`${LOG_TAG} approve conflict check error:`, conflictErr);
        return NextResponse.json(
          { error: "Could not verify availability. Please try again." },
          { status: 500 },
        );
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", id)
        .eq("status", "pending")
        .select(DISPATCH_COLUMNS)
        .maybeSingle();

      if (updateError) {
        // Losing the race against the DB overlap constraint keeps the booking
        // pending — same outcome as the legacy admin confirm.
        if (isExclusionViolation(updateError)) {
          return NextResponse.json(
            {
              error: `Cannot approve — ${bookingRow.villa} already has a confirmed stay overlapping these dates. The booking remains pending.`,
            },
            { status: 409 },
          );
        }
        console.error(`${LOG_TAG} approve update failed:`, updateError.message);
        return NextResponse.json({ error: "Could not approve this stay." }, { status: 503 });
      }
      if (!updated) {
        return NextResponse.json(
          {
            error: "Someone else changed this booking while you were looking at it. Open it again to see where it stands.",
            code: "changed_elsewhere",
          },
          { status: 409 },
        );
      }

      const dispatch = await dispatchBookingStatusGuestMessages(
        supabaseAdmin,
        id,
        "confirmed",
        updated as unknown as GuestDispatchBookingRow,
        { logTag: LOG_TAG },
      );

      return NextResponse.json({
        ok: true,
        booking: updated,
        email_sent: dispatch.emailSent,
        whatsapp: dispatch.whatsapp,
        acted_by: who,
      });
    }

    // decline — pending → cancelled, or cancelling an already-confirmed stay.
    const expectedStatus =
      typeof body.expected_status === "string" ? body.expected_status.trim().toLowerCase() : "";
    if (expectedStatus !== "pending" && expectedStatus !== "confirmed") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (currentStatus !== expectedStatus) {
      return NextResponse.json(
        {
          error:
            currentStatus === "cancelled"
              ? "This booking is already cancelled."
              : "This booking changed while you were looking at it. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", expectedStatus)
      .select(DISPATCH_COLUMNS)
      .maybeSingle();

    if (updateError) {
      console.error(`${LOG_TAG} decline update failed:`, updateError.message);
      return NextResponse.json({ error: "Could not cancel this booking." }, { status: 503 });
    }
    if (!updated) {
      return NextResponse.json(
        {
          error: "Someone else changed this booking while you were looking at it. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }

    const dispatch = await dispatchBookingStatusGuestMessages(
      supabaseAdmin,
      id,
      "cancelled",
      updated as unknown as GuestDispatchBookingRow,
      { logTag: LOG_TAG },
    );

    return NextResponse.json({
      ok: true,
      booking: updated,
      email_sent: dispatch.emailSent,
      whatsapp: dispatch.whatsapp,
      acted_by: who,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
