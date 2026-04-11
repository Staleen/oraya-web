import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function getAuthUser(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// PATCH: cancel or modify a booking (member's own only)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { id } = params;
    const body = await request.json();

    // Verify booking belongs to this user
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("id, member_id, status")
      .eq("id", id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (booking.member_id !== user.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Only pending bookings can be cancelled or modified
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending bookings can be modified or cancelled." },
        { status: 400 }
      );
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (body.status === "cancelled") {
      updates.status = "cancelled";
    } else {
      if (body.check_in      !== undefined) updates.check_in      = body.check_in;
      if (body.check_out     !== undefined) updates.check_out     = body.check_out;
      if (body.sleeping_guests !== undefined) updates.sleeping_guests = body.sleeping_guests;
      if (body.day_visitors  !== undefined) updates.day_visitors  = body.day_visitors;
      if (body.event_type    !== undefined) updates.event_type    = body.event_type;
      if (body.message       !== undefined) updates.message       = body.message;
    }

    const { error } = await supabaseAdmin
      .from("bookings")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("[api/bookings] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/bookings] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
