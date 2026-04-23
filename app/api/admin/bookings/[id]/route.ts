import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBookingEmail } from "@/lib/send-booking-email";

// Initialise service-role client directly so RLS is bypassed for every query in this route.
// Validated at call time so a missing key surfaces immediately in the logs.
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
  const { status } = await request.json();

  const allowed = ["pending", "confirmed", "cancelled"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
  }

  // Overlap guard — only runs when confirming a booking
  if (status === "confirmed") {
    // 1. Fetch the booking being confirmed
    const { data: booking, error: fetchErr } = await db
      .from("bookings")
      .select("villa, check_in, check_out")
      .eq("id", params.id)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // 2. Check for overlapping confirmed bookings on the same villa (exclude self)
    const { data: conflicts, error: conflictErr } = await db
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

  const { data: updated, error } = await db
    .from("bookings")
    .update({ status })
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

  // Send notification email on confirmed or cancelled — awaited before response
  if (status === "confirmed" || status === "cancelled") {
    try {
      // Fetch the full booking row
      const { data: bk } = await db
        .from("bookings")
        .select("villa, check_in, check_out, member_id, guest_name, guest_email")
        .eq("id", params.id)
        .single();

      if (!bk) {
        console.warn(`[api/admin/bookings] booking ${params.id} not found for email — skipping`);
      } else {
        let recipientEmail: string | null = null;
        let recipientName:  string       = "Member";

        if (bk.member_id) {
          // Member booking — look up email from auth.users
          const { data: { user } } = await db.auth.admin.getUserById(bk.member_id);
          if (user?.email) {
            recipientEmail = user.email;
            // Also try to get their full name from members table
            const { data: member } = await db
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
        } else {
          await sendBookingEmail({
            to:         recipientEmail,
            name:       recipientName,
            status:     status as "confirmed" | "cancelled",
            villa:      bk.villa,
            check_in:   bk.check_in,
            check_out:  bk.check_out,
            booking_id: params.id,
          });
        }
      }
    } catch (emailErr) {
      console.error("[api/admin/bookings] email notification error:", emailErr);
    }
  }

  return NextResponse.json({ ok: true, booking: updated });
}
