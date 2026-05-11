import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { getMergedAvailabilityRanges } from "@/lib/calendar/availability";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { heatedPoolCarryoverFromPriorBooking } from "@/lib/heated-pool-carryover";

/**
 * Phase 16A.1 — read-only availability surface for the WhatsApp AI Butler.
 *
 * Query params:
 *   - villa:    "mechmech" | "byblos"      (required)
 *   - check_in: YYYY-MM-DD                 (optional; enables heated_pool_carryover)
 *
 * This is a thin wrapper around the same library functions the locked
 * `/api/bookings/availability` route uses. The locked route itself is not
 * modified or called from here — both routes share the underlying lib code:
 *   - lib/calendar/availability.ts → getMergedAvailabilityRanges
 *   - lib/heated-pool-carryover.ts → heatedPoolCarryoverFromPriorBooking
 *
 * Response shape mirrors `/api/bookings/availability` for caller symmetry,
 * with the resolved canonical villa name echoed for clarity.
 *
 * The AI Butler must phrase the result advisorily ("looks open; Oraya will
 * confirm") — overlap enforcement is still the locked booking endpoint's job.
 */

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VILLA_SLUG_MAP: Record<string, string> = {
  mechmech: "Villa Mechmech",
  byblos:   "Villa Byblos",
};

export async function GET(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  const url       = new URL(request.url);
  const villaSlug = (url.searchParams.get("villa") ?? "").trim().toLowerCase();
  const checkIn   = url.searchParams.get("check_in");

  if (!villaSlug || !(villaSlug in VILLA_SLUG_MAP)) {
    return NextResponse.json(
      { error: "villa must be 'mechmech' or 'byblos'." },
      { status: 400 },
    );
  }
  const villa = VILLA_SLUG_MAP[villaSlug];

  try {
    const ranges = await getMergedAvailabilityRanges(villa);
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
          newCheckIn:           checkIn,
          priorCheckOut:        priorStay.check_out,
          priorAddonsSnapshot:  priorStay.addons_snapshot,
        });
      }
    }

    return NextResponse.json(
      { villa, ranges: ranges ?? [], heated_pool_carryover },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/butler/availability] query error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
