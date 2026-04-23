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
  const { status } = await request.json();

  const allowed = ["pending", "confirmed", "cancelled"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
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

  let emailSent = false;
  if (status === "confirmed" || status === "cancelled") {
    try {
      const { data: bk } = await db
        .from("bookings")
        .select("villa, check_in, check_out, member_id, guest_name, guest_email")
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
