import { NextResponse } from "next/server";
import { resolveMemberBookingViewPath } from "@/lib/profile/member-booking-view";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function getAuthUser(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * POST /api/profile/booking-view
 *
 * Member-authenticated mint of a fresh relative `/booking/view/[token]` path
 * for a booking owned by the caller. Token signing stays server-only.
 *
 * Body: { booking_id: string }
 * 200: { path: "/booking/view/<encoded-token>" }
 * 401: missing/invalid auth
 * 404: booking missing or not owned by the authenticated member (non-disclosing)
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const bookingId =
      body && typeof body === "object" && "booking_id" in body
        ? (body as { booking_id?: unknown }).booking_id
        : undefined;

    if (typeof bookingId !== "string" || bookingId.trim().length === 0) {
      return NextResponse.json({ error: "booking_id is required." }, { status: 400 });
    }

    const trimmedId = bookingId.trim();

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("id, member_id")
      .eq("id", trimmedId)
      .maybeSingle();

    if (fetchError) {
      console.error("[api/profile/booking-view] lookup error:", fetchError);
      return NextResponse.json({ error: "Server error." }, { status: 500 });
    }

    const result = resolveMemberBookingViewPath(user.id, trimmedId, booking);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ path: result.path });
  } catch (err) {
    console.error("[api/profile/booking-view] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
