import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { resolveButlerVilla } from "@/lib/butler/villa";
import { findAvailabilityConflict, getMergedAvailabilityRanges } from "@/lib/calendar/availability";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { heatedPoolCarryoverFromPriorBooking } from "@/lib/heated-pool-carryover";
import {
  buildAvailableResponse,
  buildUnavailableResponse,
  buildUnclearResponse,
} from "@/lib/butler/availability-formatter";

/**
 * Phase 16A.1 / 16A.2.d — read-only availability surface for the WhatsApp AI Butler.
 *
 * GET — Phase 16A.1.
 *   Query params:
 *     - villa:    "mechmech" | "byblos"   (required)
 *     - check_in: YYYY-MM-DD              (optional; enables heated_pool_carryover)
 *   Returns the merged unavailable date-range list for the villa, plus the
 *   heated-pool carryover flag. Caller is responsible for range-vs-range
 *   overlap. Used by the website's calendar-style consumers.
 *
 * POST — Phase 16A.2.d (additive).
 *   JSON body:
 *     - villa:        "Villa Byblos" | "Villa Mechmech" | slug   (required)
 *     - check_in:     YYYY-MM-DD                                 (required)
 *     - check_out:    YYYY-MM-DD                                 (required, > check_in)
 *     - request_type: "stay" | "event"                           (optional informational)
 *     - event:        boolean                                    (optional explicit flag)
 *   Returns a yes/no `{ status: "available" | "unavailable" | "unclear",
 *   safe_message, … }` shape WhatChimp can repeat to the guest. Treated as
 *   an event when `event === true` or `request_type === "event"`.
 *
 * Both methods are thin wrappers around the same library functions the locked
 * `/api/bookings/availability` route uses. The locked route itself is not
 * modified or called from here — both routes share the underlying lib code:
 *   - lib/calendar/availability.ts → getMergedAvailabilityRanges, findAvailabilityConflict
 *   - lib/heated-pool-carryover.ts → heatedPoolCarryoverFromPriorBooking
 *
 * The AI Butler must phrase the POST result advisorily ("appear available;
 * Oraya will confirm") — overlap enforcement is still the locked booking
 * endpoint's job.
 */

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  const url     = new URL(request.url);
  const villa   = resolveButlerVilla(url.searchParams.get("villa"));
  const checkIn = url.searchParams.get("check_in");

  if (!villa) {
    return NextResponse.json(
      { error: "villa must be 'mechmech' or 'byblos'." },
      { status: 400 },
    );
  }

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

function invalidRequest() {
  return NextResponse.json(
    { ok: false, error: "invalid_request" },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidRequest();
  }
  if (!isObject(raw)) return invalidRequest();

  const villaRaw   = raw.villa;
  const checkIn    = raw.check_in;
  const checkOut   = raw.check_out;
  const eventFlag  = raw.event;
  const requestTyp = raw.request_type;

  if (typeof villaRaw !== "string") return invalidRequest();
  const villa = resolveButlerVilla(villaRaw);
  if (!villa) return invalidRequest();

  if (typeof checkIn  !== "string" || !ISO_DATE_RE.test(checkIn))  return invalidRequest();
  if (typeof checkOut !== "string" || !ISO_DATE_RE.test(checkOut)) return invalidRequest();
  // Lexicographic compare is safe for ISO `YYYY-MM-DD`.
  if (checkOut <= checkIn) return invalidRequest();

  const isEvent =
    eventFlag === true ||
    (typeof requestTyp === "string" && requestTyp.trim().toLowerCase() === "event");

  try {
    const conflict = await findAvailabilityConflict(
      villa,
      checkIn,
      checkOut,
      undefined,
      isEvent,
    );
    const echo = { villa, check_in: checkIn, check_out: checkOut };
    const body = conflict
      ? buildUnavailableResponse(echo)
      : buildAvailableResponse(echo);
    return NextResponse.json(body, { headers: NO_STORE_HEADERS });
  } catch (error) {
    // Never echo the raw Supabase / driver message — log server-side only.
    console.error("[api/butler/availability POST] query error:", error);
    return NextResponse.json(buildUnclearResponse(), { headers: NO_STORE_HEADERS });
  }
}
