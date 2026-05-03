import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendFeedbackRequestEmail } from "@/lib/send-feedback-request-email";
import { isFeedbackEmailCooldownActive, isPastCheckoutForFeedbackEmail } from "@/lib/booking-feedback-eligibility";

export const dynamic = "force-dynamic";

function isEventInquiryRow(row: { event_type?: string | null; message?: string | null }): boolean {
  return Boolean(
    row.event_type && typeof row.message === "string" && row.message.includes("[Event Inquiry]"),
  );
}

async function resolveRecipientEmail(booking: {
  member_id?: string | null;
  guest_email?: string | null;
}): Promise<string | null> {
  if (booking.member_id) {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(booking.member_id);
    if (user?.email?.trim()) return user.email.trim();
  }
  const g = booking.guest_email?.trim();
  return g || null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const bookingId = params.id;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const { data: booking, error: fetchError } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, status, check_out, member_id, guest_email, guest_name, event_type, message, feedback_requested_at, feedback_requested_channel, feedback_request_count",
    )
    .eq("id", bookingId)
    .single();

  if (fetchError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "Feedback email is only available for confirmed bookings." }, { status: 400 });
  }

  if (!isPastCheckoutForFeedbackEmail(booking.check_out)) {
    return NextResponse.json(
      { error: "Feedback email is only available after the stay or event window has ended." },
      { status: 400 },
    );
  }

  if (isFeedbackEmailCooldownActive(booking.feedback_requested_at)) {
    return NextResponse.json({ error: "Feedback already requested recently" }, { status: 409 });
  }

  const to = await resolveRecipientEmail(booking);
  if (!to) {
    return NextResponse.json({ error: "No guest email on file for this booking." }, { status: 400 });
  }

  let guestName =
    typeof booking.guest_name === "string" && booking.guest_name.trim()
      ? booking.guest_name.trim()
      : "Guest";
  if (booking.member_id) {
    const { data: member } = await supabaseAdmin
      .from("members")
      .select("full_name")
      .eq("id", booking.member_id)
      .single();
    if (member?.full_name?.trim()) guestName = member.full_name.trim();
  }
  const isEvent = isEventInquiryRow(booking);

  try {
    await sendFeedbackRequestEmail({ to, guestName, isEvent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed.";
    console.error("[api/admin/bookings/send-feedback] send error:", e);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const prevCount =
    typeof booking.feedback_request_count === "number" && Number.isFinite(booking.feedback_request_count)
      ? booking.feedback_request_count
      : 0;
  const nowIso = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("bookings")
    .update({
      feedback_requested_at: nowIso,
      feedback_requested_channel: "email",
      feedback_request_count: prevCount + 1,
    })
    .eq("id", bookingId)
    .select()
    .single();

  if (updateError || !updated) {
    console.error("[api/admin/bookings/send-feedback] update error after send:", updateError);
    return NextResponse.json(
      { error: updateError?.message ?? "Email may have been sent but the booking could not be updated." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, booking: updated });
}
