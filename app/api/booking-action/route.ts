import { NextRequest, NextResponse } from "next/server";
import { verifyActionToken } from "@/lib/booking-action-token";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingEmail } from "@/lib/send-booking-email";

function redirect(request: NextRequest, state: string) {
  return NextResponse.redirect(new URL(`/booking-action/result?state=${state}`, request.url));
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return redirect(request, "invalid");

  const result = verifyActionToken(token);
  if (!result.ok) return redirect(request, result.reason);

  const { booking_id, action } = result;

  // Fetch the booking
  const { data: booking, error: fetchErr } = await supabaseAdmin
    .from("bookings")
    .select("villa, check_in, check_out, status, member_id, guest_name, guest_email")
    .eq("id", booking_id)
    .single();

  if (fetchErr || !booking) return redirect(request, "invalid");

  // Guard: only act on pending bookings
  if (booking.status !== "pending") return redirect(request, "already_processed");

  // Overlap check when confirming
  if (action === "confirmed") {
    const { data: conflicts, error: conflictErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("villa", booking.villa)
      .eq("status", "confirmed")
      .neq("id", booking_id)
      .lt("check_in", booking.check_out)
      .gt("check_out", booking.check_in);

    if (conflictErr) {
      console.error("[api/booking-action] conflict check error:", conflictErr);
      return redirect(request, "invalid");
    }

    if (conflicts && conflicts.length > 0) return redirect(request, "overlap_conflict");
  }

  // Update status — idempotency guard via .eq("status","pending")
  const { error: updateErr } = await supabaseAdmin
    .from("bookings")
    .update({ status: action })
    .eq("id", booking_id)
    .eq("status", "pending");

  if (updateErr) {
    console.error("[api/booking-action] update error:", updateErr);
    return redirect(request, "invalid");
  }

  // Send guest notification email — awaited so it completes before redirect
  try {
    let recipientEmail: string | null = null;
    let recipientName:  string        = "Guest";

    if (booking.member_id) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(booking.member_id);
      if (user?.email) {
        recipientEmail = user.email;
        const { data: member } = await supabaseAdmin
          .from("members")
          .select("full_name")
          .eq("id", booking.member_id)
          .single();
        if (member?.full_name) recipientName = member.full_name;
      }
    } else if (booking.guest_email) {
      recipientEmail = booking.guest_email;
      if (booking.guest_name) recipientName = booking.guest_name;
    }

    if (recipientEmail) {
      await sendBookingEmail({
        to:         recipientEmail,
        name:       recipientName,
        status:     action,
        villa:      booking.villa,
        check_in:   booking.check_in,
        check_out:  booking.check_out,
        booking_id,
      });
    } else {
      console.warn(`[api/booking-action] no email address for booking ${booking_id} — skipping guest notification`);
    }
  } catch (emailErr) {
    console.error("[api/booking-action] guest email error:", emailErr);
  }

  return redirect(request, action);
}
