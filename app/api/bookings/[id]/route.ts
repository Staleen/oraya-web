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
      .select("id, member_id, status, villa, check_in, check_out")
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

    // ── Date + overlap validation when either date field changes ─────────────
    if (updates.check_in !== undefined || updates.check_out !== undefined) {
      const ISO_DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
      const finalCheckIn  = String(updates.check_in  ?? booking.check_in);
      const finalCheckOut = String(updates.check_out ?? booking.check_out);

      if (!ISO_DATE_RE.test(finalCheckIn) || !ISO_DATE_RE.test(finalCheckOut)) {
        return NextResponse.json({ error: "Dates must be in YYYY-MM-DD format." }, { status: 400 });
      }
      if (finalCheckOut <= finalCheckIn) {
        return NextResponse.json({ error: "check_out must be after check_in." }, { status: 400 });
      }

      // Reuse same overlap logic as admin PATCH — exclude self with .neq("id", id)
      const { data: conflicts, error: conflictErr } = await supabaseAdmin
        .from("bookings")
        .select("id, check_in, check_out")
        .eq("villa", booking.villa)
        .eq("status", "confirmed")
        .neq("id", id)
        .lt("check_in", finalCheckOut)
        .gt("check_out", finalCheckIn);

      if (conflictErr) {
        console.error("[api/bookings] modify conflict check error:", conflictErr);
        return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
      }
      if (conflicts && conflicts.length > 0) {
        const c = conflicts[0];
        return NextResponse.json(
          { error: `These dates are unavailable — ${booking.villa} is already confirmed for ${c.check_in} to ${c.check_out}.` },
          { status: 409 }
        );
      }
    }

    // ── Guest count validation ────────────────────────────────────────────────
    if (updates.sleeping_guests !== undefined && Number(updates.sleeping_guests) < 1) {
      return NextResponse.json({ error: "sleeping_guests must be at least 1." }, { status: 400 });
    }
    if (updates.day_visitors !== undefined && Number(updates.day_visitors) < 0) {
      return NextResponse.json({ error: "day_visitors must be 0 or more." }, { status: 400 });
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
