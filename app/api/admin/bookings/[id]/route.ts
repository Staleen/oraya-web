import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBookingEmail } from "@/lib/send-booking-email";
import { findAvailabilityConflict } from "@/lib/calendar/availability";

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[api/admin/bookings] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = makeAdminClient();
  const payload = await request.json();
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

  if (statusUpdateProvided) {
    const allowed = ["pending", "confirmed", "cancelled"];
    if (typeof status !== "string" || !allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }
  }

  if (status === "confirmed") {
    const { data: booking, error: fetchErr } = await db
      .from("bookings")
      .select("villa, check_in, check_out")
      .eq("id", params.id)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    try {
      const conflict = await findAvailabilityConflict(booking.villa, booking.check_in, booking.check_out, params.id);
      if (conflict) {
        return NextResponse.json(
          { error: `Cannot confirm — ${booking.villa} already has a blocked stay from ${conflict.check_in} to ${conflict.check_out} that overlaps these dates.` },
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
    .eq("id", params.id)
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
  if (statusUpdateProvided && (status === "confirmed" || status === "cancelled")) {
    try {
      const { data: bk } = await db
        .from("bookings")
        .select("villa, check_in, check_out, sleeping_guests, day_visitors, event_type, message, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, member_id, guest_name, guest_email")
        .eq("id", params.id)
        .single();

      if (!bk) {
        console.warn(`[api/admin/bookings] booking ${params.id} not found for email — skipping`);
      } else {
        let recipientEmail: string | null = null;
        let recipientName = "Member";

        if (bk.member_id) {
          const { data: { user } } = await db.auth.admin.getUserById(bk.member_id);
          if (user?.email) {
            recipientEmail = user.email;
            const { data: member } = await db
              .from("members")
              .select("full_name")
              .eq("id", bk.member_id)
              .single();
            if (member?.full_name) recipientName = member.full_name;
          }
        } else if (bk.guest_email) {
          recipientEmail = bk.guest_email;
          if (bk.guest_name) recipientName = bk.guest_name;
        }

        if (!recipientEmail) {
          console.warn(`[api/admin/bookings] no email address for booking ${params.id} — skipping notification`);
        } else {
          await sendBookingEmail({
            to: recipientEmail,
            name: recipientName,
            status: status as "confirmed" | "cancelled",
            villa: bk.villa,
            check_in: bk.check_in,
            check_out: bk.check_out,
            booking_id: params.id,
            sleeping_guests: bk.sleeping_guests,
            day_visitors: bk.day_visitors,
            event_type: bk.event_type ?? null,
            message: bk.message ?? null,
            addons: Array.isArray(bk.addons) ? bk.addons : [],
            addons_snapshot: Array.isArray(bk.addons_snapshot) ? bk.addons_snapshot : null,
            pricing_subtotal: bk.pricing_subtotal ?? null,
            pricing_snapshot: bk.pricing_snapshot ?? null,
          });
          emailSent = true;
        }
      }
    } catch (emailErr) {
      console.error("[api/admin/bookings] email notification error:", emailErr);
    }
  }

  return NextResponse.json({ ok: true, booking: updated, email_sent: emailSent });
}
