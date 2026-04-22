import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  return NextResponse.json({ ok: true });
}
