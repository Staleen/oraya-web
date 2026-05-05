import { NextResponse } from "next/server";
import { getMergedAvailabilityRanges } from "@/lib/calendar/availability";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { heatedPoolCarryoverFromPriorBooking } from "@/lib/heated-pool-carryover";

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/bookings/availability?villa=Villa+Mechmech&check_in=YYYY-MM-DD (check_in optional)
// Returns confirmed booking date ranges for a villa — no PII exposed.
// When check_in is set, heated_pool_carryover is true iff Phase 15I.5 pool prep carry-over applies.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const villa = searchParams.get("villa");
  const checkIn = searchParams.get("check_in");

  if (!villa) {
    return NextResponse.json({ error: "villa is required." }, { status: 400 });
  }

  try {
    const data = await getMergedAvailabilityRanges(villa);
    let heated_pool_carryover = false;
    if (checkIn && ISO_DATE_RE.test(checkIn)) {
      const { data: priorStay, error: priorError } = await supabaseAdmin
        .from("bookings")
        .select("check_out, addons_snapshot")
        .eq("villa", villa)
        .eq("status", "confirmed")
        .lte("check_out", checkIn)
        .order("check_out", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!priorError && priorStay && typeof priorStay.check_out === "string") {
        heated_pool_carryover = heatedPoolCarryoverFromPriorBooking({
          newCheckIn: checkIn,
          priorCheckOut: priorStay.check_out,
          priorAddonsSnapshot: priorStay.addons_snapshot,
        });
      }
    }
    return NextResponse.json({ ranges: data ?? [], heated_pool_carryover });
  } catch (error) {
    console.error("[api/bookings/availability] query error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
