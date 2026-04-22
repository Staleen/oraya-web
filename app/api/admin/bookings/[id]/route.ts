import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingEmail } from "@/lib/send-booking-email";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { status } = await request.json();

  const allowed = ["pending", "confirmed", "cancelled"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
  }

  // Overlap guard — only runs when confirming a booking
  if (status === "confirmed") {
    // 1. Fetch the booking being confirmed
    const { data: booking, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select("villa, check_in, check_out")
      .eq("id", params.id)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // 2. Check for overlapping confirmed bookings on the same villa (exclude self)
    const { data: conflicts, error: conflictErr } = await supabaseAdmin
      .from("bookings")
      .select("id, check_in, check_out")
      .eq("villa", booking.villa)
      .eq("status", "confirmed")
      .neq("id", params.id)
      .lt("check_in", booking.check_out)
      .gt("check_out", booking.check_in);

    if (conflictErr) {
      console.error("[api/admin/bookings] conflict check error:", conflictErr);
      return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
    }

    if (conflicts && conflicts.length > 0) {
      const c = conflicts[0];
      return NextResponse.json(
        { error: `Cannot confirm — ${booking.villa} already has a confirmed booking from ${c.check_in} to ${c.check_out} that overlaps these dates.` },
        { status: 409 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("bookings")
    .update({ status })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send notification email on confirmed or cancelled — fire-and-forget, never blocks the response
  if (status === "confirmed" || status === "cancelled") {
    (async () => {
      try {
        // Fetch the full booking row
        const { data: bk } = await supabaseAdmin
          .from("bookings")
          .select("villa, check_in, check_out, member_id, guest_name, guest_email")
          .eq("id", params.id)
          .single();

        if (!bk) return;

        let recipientEmail: string | null = null;
        let recipientName:  string       = "Member";

        if (bk.member_id) {
          // Member booking — look up email from auth.users
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(bk.member_id);
          if (user?.email) {
            recipientEmail = user.email;
            // Also try to get their full name from members table
            const { data: member } = await supabaseAdmin
              .from("members")
              .select("full_name")
              .eq("id", bk.member_id)
              .single();
            if (member?.full_name) recipientName = member.full_name;
          }
        } else if (bk.guest_email) {
          // Guest booking
          recipientEmail = bk.guest_email;
          if (bk.guest_name) recipientName = bk.guest_name;
        }

        if (!recipientEmail) {
          console.warn(`[api/admin/bookings] no email address for booking ${params.id} — skipping notification`);
          return;
        }

        await sendBookingEmail({
          to:         recipientEmail,
          name:       recipientName,
          status:     status as "confirmed" | "cancelled",
          villa:      bk.villa,
          check_in:   bk.check_in,
          check_out:  bk.check_out,
          booking_id: params.id,
        });
      } catch (emailErr) {
        console.error("[api/admin/bookings] email notification error:", emailErr);
      }
    })();
  }

  return NextResponse.json({ ok: true });
}
