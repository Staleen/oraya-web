import { NextResponse } from "next/server";
import { getMergedAvailabilityRanges } from "@/lib/calendar/availability";

export const dynamic = "force-dynamic";

// GET /api/bookings/availability?villa=Villa+Mechmech
// Returns confirmed booking date ranges for a villa — no PII exposed.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const villa = searchParams.get("villa");

  if (!villa) {
    return NextResponse.json({ error: "villa is required." }, { status: 400 });
  }

  try {
    const data = await getMergedAvailabilityRanges(villa);
    return NextResponse.json({ ranges: data ?? [] });
  } catch (error) {
    console.error("[api/bookings/availability] query error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
