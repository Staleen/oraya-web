import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { todayIsoUtc, validateStayDateRules } from "@/lib/booking-date-rules";
import { findAvailabilityConflict } from "@/lib/calendar/availability";
import { VILLA_BASE_PRICING_KEY } from "@/lib/admin-pricing";
import { repriceBookingForDateChange } from "@/lib/pricing/reprice";

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
      .select("id, member_id, status, villa, check_in, check_out, sleeping_guests, event_type, message, addons_snapshot")
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

      const stayRuleError = validateStayDateRules({
        check_in: finalCheckIn,
        check_out: finalCheckOut,
        todayIso: todayIsoUtc(),
      });
      if (stayRuleError) {
        return NextResponse.json({ error: stayRuleError.error }, { status: stayRuleError.status });
      }

      // Remediation 2.1: shared conflict logic (calendar blocks + event
      // expansion) instead of the raw bookings-table overlap query.
      try {
        const bookingIsEvent =
          Boolean(booking.event_type) &&
          typeof booking.message === "string" &&
          booking.message.includes("[Event Inquiry]");
        const conflict = await findAvailabilityConflict(
          booking.villa,
          finalCheckIn,
          finalCheckOut,
          id,
          bookingIsEvent,
        );
        if (conflict) {
          return NextResponse.json(
            { error: `These dates are unavailable — ${booking.villa} is already blocked for ${conflict.check_in} to ${conflict.check_out}.` },
            { status: 409 }
          );
        }
      } catch (conflictErr) {
        console.error("[api/bookings] modify conflict check error:", conflictErr);
        return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
      }

      // Remediation 2.1: date changes reprice the stay through the same
      // audit/snapshot path the booking POST uses (Question 4 default).
      const datesChanged = finalCheckIn !== booking.check_in || finalCheckOut !== booking.check_out;
      if (datesChanged) {
        try {
          const { data: pricingRow, error: pricingRowError } = await supabaseAdmin
            .from("settings")
            .select("value")
            .eq("key", VILLA_BASE_PRICING_KEY)
            .maybeSingle();
          if (pricingRowError) throw pricingRowError;

          const nextSleepingGuests =
            body.sleeping_guests !== undefined
              ? parseInt(String(body.sleeping_guests), 10) || 0
              : booking.sleeping_guests ?? 0;
          const reprice = repriceBookingForDateChange({
            villa: booking.villa,
            check_in: finalCheckIn,
            check_out: finalCheckOut,
            message:
              body.message !== undefined
                ? typeof body.message === "string"
                  ? body.message
                  : null
                : booking.message ?? null,
            sleeping_guests: nextSleepingGuests,
            addons_snapshot: Array.isArray(booking.addons_snapshot) ? booking.addons_snapshot : null,
            pricing_setting_value: pricingRow?.value ?? null,
          });

          if (!reprice.ok) {
            return NextResponse.json({ error: reprice.error }, { status: reprice.status });
          }
          updates.pricing_subtotal = reprice.update.pricing_subtotal;
          updates.pricing_nights = reprice.update.pricing_nights;
          updates.pricing_warnings = reprice.update.pricing_warnings;
          updates.pricing_snapshot = reprice.update.pricing_snapshot;
        } catch (repriceErr) {
          console.error("[api/bookings] modify reprice error:", repriceErr);
          return NextResponse.json(
            { error: "Unable to validate pricing for the new dates. Please try again or contact us." },
            { status: 500 }
          );
        }
      }
    }

    // ── Guest count validation (Remediation 2.1: integers only) ──────────────
    if (updates.sleeping_guests !== undefined) {
      const n = Number(updates.sleeping_guests);
      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json({ error: "sleeping_guests must be a whole number of at least 1." }, { status: 400 });
      }
      updates.sleeping_guests = n;
    }
    if (updates.day_visitors !== undefined) {
      const n = Number(updates.day_visitors);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: "day_visitors must be a whole number of 0 or more." }, { status: 400 });
      }
      updates.day_visitors = n;
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
