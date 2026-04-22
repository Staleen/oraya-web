import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET /api/bookings/availability?villa=Villa+Mechmech
// Returns confirmed booking date ranges for a villa — no PII exposed.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const villa = searchParams.get("villa");

  if (!villa) {
    return NextResponse.json({ error: "villa is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("check_in, check_out")
    .eq("villa", villa)
    .eq("status", "confirmed");

  if (error) {
    console.error("[api/bookings/availability] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ranges: data ?? [] });
}
