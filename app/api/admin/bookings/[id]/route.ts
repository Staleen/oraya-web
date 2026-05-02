import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBookingEmail } from "@/lib/send-booking-email";
import {
  sendBookingPaymentReceivedEmail,
  sendBookingPaymentRequestedEmail,
} from "@/lib/send-booking-payment-email";
import { findAvailabilityConflict } from "@/lib/calendar/availability";

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[api/admin/bookings] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveRecipient(db: ReturnType<typeof makeAdminClient>, booking: {
  member_id?: string | null;
  guest_email?: string | null;
  guest_name?: string | null;
}) {
  if (booking.member_id) {
    const { data: { user } } = await db.auth.admin.getUserById(booking.member_id);
    if (user?.email) {
      let memberName = "Member";
      const { data: member } = await db
        .from("members")
        .select("full_name")
        .eq("id", booking.member_id)
        .single();
      if (member?.full_name) memberName = member.full_name;
      return { email: user.email, name: memberName };
    }
  }

  return {
    email: booking.guest_email ?? null,
    name: booking.guest_name || "Guest",
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = makeAdminClient();
  const payload = await request.json();
  const bookingId = params.id;
  const status = payload.status as unknown;

  const statusUpdateProvided = Object.prototype.hasOwnProperty.call(payload, "status");
  const paymentFieldNames = [
    "payment_status",
    "payment_method",
    "deposit_amount",
    "amount_paid",
    "payment_reference",
    "payment_notes",
    "payment_requested_at",
    "payment_received_at",
    "payment_due_at",
    "payment_marked_by",
    "refund_status",
    "refund_amount",
    "refunded_at",
  ] as const;
  const paymentUpdateProvided = paymentFieldNames.some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );

  if (!statusUpdateProvided && !paymentUpdateProvided) {
    return NextResponse.json({ error: "No booking updates provided." }, { status: 400 });
  }

  const { data: existingBooking, error: existingBookingError } = await db
    .from("bookings")
    .select("id, villa, check_in, check_out, sleeping_guests, day_visitors, event_type, message, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, member_id, guest_name, guest_email, payment_status, payment_method, deposit_amount, amount_paid, payment_reference, payment_due_at, payment_requested_at, payment_received_at, refund_status, refund_amount, refunded_at")
    .eq("id", bookingId)
    .single();

  if (existingBookingError || !existingBooking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (statusUpdateProvided) {
    const allowed = ["pending", "confirmed", "cancelled"];
    if (typeof status !== "string" || !allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }
  }

  if (status === "confirmed") {
    try {
      const conflict = await findAvailabilityConflict(
        existingBooking.villa,
        existingBooking.check_in,
        existingBooking.check_out,
        bookingId
      );
      if (conflict) {
        return NextResponse.json(
          { error: `Cannot confirm — ${existingBooking.villa} already has a blocked stay from ${conflict.check_in} to ${conflict.check_out} that overlaps these dates.` },
          { status: 409 }
        );
      }
    } catch (conflictErr) {
      console.error("[api/admin/bookings] conflict check error:", conflictErr);
      return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
    }
  }

  const allowedPaymentStatuses = ["unpaid", "payment_requested", "deposit_paid", "paid_in_full"];
  const allowedPaymentMethods = ["whish", "cash", "bank_transfer", "card_manual", "other"];
  const allowedRefundStatuses = ["refund_pending", "partial_refund", "refunded"];
  const updatePayload: Record<string, unknown> = {};

  if (statusUpdateProvided) {
    updatePayload.status = status;
  }

  function readOptionalText(field: (typeof paymentFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "string") {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalNumber(field: (typeof paymentFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalTimestamp(field: (typeof paymentFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  try {
    if (Object.prototype.hasOwnProperty.call(payload, "payment_status")) {
      const paymentStatus = payload.payment_status;
      if (paymentStatus === null || paymentStatus === "") {
        updatePayload.payment_status = null;
      } else if (typeof paymentStatus === "string" && allowedPaymentStatuses.includes(paymentStatus)) {
        updatePayload.payment_status = paymentStatus;
      } else {
        return NextResponse.json({ error: "Invalid payment_status value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "payment_method")) {
      const paymentMethod = payload.payment_method;
      if (paymentMethod === null || paymentMethod === "") {
        updatePayload.payment_method = null;
      } else if (typeof paymentMethod === "string" && allowedPaymentMethods.includes(paymentMethod)) {
        updatePayload.payment_method = paymentMethod;
      } else {
        return NextResponse.json({ error: "Invalid payment_method value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "refund_status")) {
      const refundStatus = payload.refund_status;
      if (refundStatus === null || refundStatus === "") {
        updatePayload.refund_status = null;
      } else if (typeof refundStatus === "string" && allowedRefundStatuses.includes(refundStatus)) {
        updatePayload.refund_status = refundStatus;
      } else {
        return NextResponse.json({ error: "Invalid refund_status value." }, { status: 400 });
      }
    }

    readOptionalNumber("deposit_amount");
    readOptionalNumber("amount_paid");
    readOptionalNumber("refund_amount");
    readOptionalText("payment_reference");
    readOptionalText("payment_notes");
    readOptionalText("payment_marked_by");
    readOptionalTimestamp("payment_requested_at");
    readOptionalTimestamp("payment_received_at");
    readOptionalTimestamp("payment_due_at");
    readOptionalTimestamp("refunded_at");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid payment update." },
      { status: 400 }
    );
  }

  const { data: updated, error } = await db
    .from("bookings")
    .update(updatePayload)
    .eq("id", bookingId)
    .select()
    .single();

  if (error || !updated) {
    console.error("[api/admin/bookings] update error or no row matched:", error);
    return NextResponse.json(
      { error: error?.message ?? "Booking not found or could not be updated." },
      { status: error ? 500 : 404 }
    );
  }

  let emailSent = false;
  const isEventInquiry = Boolean(
    updated.event_type &&
    typeof updated.message === "string" &&
    updated.message.includes("[Event Inquiry]")
  );

  if (statusUpdateProvided && (status === "confirmed" || status === "cancelled")) {
    try {
      const { email: recipientEmail, name: recipientName } = await resolveRecipient(db, updated);

      if (!recipientEmail) {
        console.warn(`[api/admin/bookings] no email address for booking ${bookingId} — skipping notification`);
      } else {
        await sendBookingEmail({
          to: recipientEmail,
          name: recipientName,
          status: status as "confirmed" | "cancelled",
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          booking_id: bookingId,
          sleeping_guests: updated.sleeping_guests,
          day_visitors: updated.day_visitors,
          event_type: updated.event_type ?? null,
          message: updated.message ?? null,
          addons: Array.isArray(updated.addons) ? updated.addons : [],
          addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
          pricing_subtotal: updated.pricing_subtotal ?? null,
          pricing_snapshot: updated.pricing_snapshot ?? null,
        });
        emailSent = true;
      }
    } catch (emailErr) {
      console.error("[api/admin/bookings] email notification error:", emailErr);
    }
  }

  const paymentStatusChanged =
    typeof updated.payment_status === "string" &&
    updated.payment_status !== existingBooking.payment_status;

  if (paymentStatusChanged && !isEventInquiry) {
    try {
      const { email: recipientEmail, name: recipientName } = await resolveRecipient(db, updated);

      if (!recipientEmail) {
        console.warn(`[api/admin/bookings] no email address for booking ${bookingId} payment update — skipping notification`);
      } else if (updated.payment_status === "payment_requested") {
        await sendBookingPaymentRequestedEmail({
          to: recipientEmail,
          name: recipientName,
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          booking_id: bookingId,
          payment_status: updated.payment_status ?? null,
          deposit_amount: updated.deposit_amount ?? null,
          amount_paid: updated.amount_paid ?? null,
          payment_due_at: updated.payment_due_at ?? null,
          payment_method: updated.payment_method ?? null,
          payment_reference: updated.payment_reference ?? null,
          pricing_subtotal: updated.pricing_subtotal ?? null,
          pricing_snapshot: updated.pricing_snapshot ?? null,
          addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
        });
        emailSent = true;
      } else if (updated.payment_status === "deposit_paid" || updated.payment_status === "paid_in_full") {
        await sendBookingPaymentReceivedEmail({
          to: recipientEmail,
          name: recipientName,
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          booking_id: bookingId,
          payment_status: updated.payment_status ?? null,
          deposit_amount: updated.deposit_amount ?? null,
          amount_paid: updated.amount_paid ?? null,
          payment_due_at: updated.payment_due_at ?? null,
          payment_method: updated.payment_method ?? null,
          payment_reference: updated.payment_reference ?? null,
          pricing_subtotal: updated.pricing_subtotal ?? null,
          pricing_snapshot: updated.pricing_snapshot ?? null,
          addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
        });
        emailSent = true;
      }
    } catch (paymentEmailErr) {
      console.error("[api/admin/bookings] payment email notification error:", paymentEmailErr);
    }
  }

  return NextResponse.json({ ok: true, booking: updated, email_sent: emailSent });
}
