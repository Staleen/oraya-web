import { NextRequest, NextResponse } from "next/server";
import { verifyViewToken } from "@/lib/booking-action-token";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEventProposalResponseEmail } from "@/lib/send-event-proposal-response-email";

function buildViewRedirect(request: NextRequest, token: string, state: string) {
  return NextResponse.redirect(
    new URL(`/booking/view/${encodeURIComponent(token)}?proposal=${encodeURIComponent(state)}`, request.url)
  );
}

function isEventInquiryBooking(booking: { event_type?: string | null; message?: string | null }) {
  return Boolean(booking.event_type) && typeof booking.message === "string" && booking.message.includes("[Event Inquiry]");
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = formData.get("token");
  const responseValue = formData.get("response");

  if (typeof token !== "string" || !token) {
    return NextResponse.redirect(new URL("/booking-action/result?state=invalid", request.url));
  }

  if (responseValue !== "accepted" && responseValue !== "declined") {
    return buildViewRedirect(request, token, "invalid");
  }

  const verified = verifyViewToken(token);
  if (!verified.ok) {
    return buildViewRedirect(request, token, verified.reason);
  }

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, check_in, check_out, event_type, message, guest_name, proposal_status, proposal_valid_until, proposal_total_amount, proposal_responded_at")
    .eq("id", verified.booking_id)
    .single();

  if (error || !booking) {
    return buildViewRedirect(request, token, "invalid");
  }

  if (!isEventInquiryBooking(booking)) {
    return buildViewRedirect(request, token, "invalid");
  }

  const proposalExpired =
    booking.proposal_status === "sent" &&
    typeof booking.proposal_valid_until === "string" &&
    !Number.isNaN(new Date(booking.proposal_valid_until).getTime()) &&
    new Date(booking.proposal_valid_until).getTime() < Date.now();

  if (proposalExpired) {
    return buildViewRedirect(request, token, "expired");
  }

  if (booking.proposal_status !== "sent") {
    return buildViewRedirect(request, token, booking.proposal_status ?? "unavailable");
  }

  const responseTimestamp = new Date().toISOString();
  const { data: updatedBooking, error: updateError } = await supabaseAdmin
    .from("bookings")
    .update({
      proposal_status: responseValue,
      proposal_responded_at: responseTimestamp,
    })
    .eq("id", verified.booking_id)
    .eq("proposal_status", "sent")
    .select("id, check_in, check_out, event_type, message, guest_name, proposal_status, proposal_total_amount, proposal_responded_at")
    .single();

  if (updateError || !updatedBooking) {
    return buildViewRedirect(request, token, "unavailable");
  }

  try {
    await sendEventProposalResponseEmail({
      status: responseValue,
      guest_name: updatedBooking.guest_name || "Guest",
      event_type: updatedBooking.event_type ?? null,
      check_in: updatedBooking.check_in,
      check_out: updatedBooking.check_out,
      proposal_total_amount: updatedBooking.proposal_total_amount ?? null,
    });
  } catch (emailError) {
    console.error("[api/booking-action/proposal] response email error:", emailError);
  }

  return buildViewRedirect(request, token, responseValue);
}
