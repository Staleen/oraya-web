import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// POST — create a new booking (member or guest)
// Uses service role to bypass RLS entirely — avoids anon-client policy issues
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      villa,
      check_in,
      check_out,
      sleeping_guests,
      day_visitors,
      event_type,
      message,
      // member fields
      member_id,
      // guest fields
      guest_name,
      guest_email,
      guest_phone,
      guest_country,
    } = body;

    // Basic server-side validation
    if (!villa || !check_in || !check_out) {
      return NextResponse.json({ error: "villa, check_in, and check_out are required." }, { status: 400 });
    }
    if (check_out <= check_in) {
      return NextResponse.json({ error: "check_out must be after check_in." }, { status: 400 });
    }

    // If a member_id is supplied, verify it matches the auth token
    if (member_id) {
      const token = request.headers.get("Authorization")?.replace("Bearer ", "");
      if (token) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (!user || user.id !== member_id) {
          return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
        }
      }
    }

    const insertData: Record<string, unknown> = {
      villa,
      check_in,
      check_out,
      sleeping_guests: parseInt(sleeping_guests, 10) || 0,
      day_visitors:    parseInt(day_visitors,    10) || 0,
      event_type:      event_type  || null,
      message:         message     || null,
      status:          "pending",
      member_id:       member_id   || null,
      guest_name:      guest_name  || null,
      guest_email:     guest_email || null,
      guest_phone:     guest_phone || null,
      guest_country:   guest_country || null,
    };

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[api/bookings] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ booking: data });
  } catch (err) {
    console.error("[api/bookings] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
