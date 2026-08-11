import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findAvailabilityConflict } from "@/lib/calendar/availability";
import { isExclusionViolation } from "@/lib/db-errors";
import {
  dispatchBookingStatusGuestMessages,
  type GuestDispatchBookingRow,
} from "@/lib/booking-guest-dispatch";
import {
  INSTANT_BOOKING_SETTING_KEYS,
  parseInstantBookingSetting,
} from "@/lib/instant-booking-settings";
import {
  INSTANT_AUTO_CONFIRM_SETTING_KEY,
  decideInstantConfirmation,
  describeInstantConfirmSkip,
  type InstantConfirmBooking,
} from "@/lib/bookings/instant-confirm";

/**
 * Instant booking auto-confirmation, invoked after money is recorded.
 *
 * Safety, in order:
 *  1. Pure eligibility decision (lib/bookings/instant-confirm.ts) — OFF by
 *     default, full payment only, no add-ons, no special request.
 *  2. Availability re-checked at payment time, exactly as the human approve
 *     path does — two guests paying for the same nights must not both win.
 *  3. Row-count-verified conditional update `.eq("status","pending")`. Zero
 *     rows means someone else already decided; we stop silently.
 *  4. The existing shared dispatcher sends the confirmation email and the
 *     Arrival Guide — no separate copy, no second message path.
 *
 * Never throws: a failure here leaves the booking pending for a human, which
 * is the same state it would have been in without instant booking at all.
 */

const LOG_TAG = "[bookings/instant-confirm]";

const BOOKING_COLUMNS =
  "id, status, villa, check_in, check_out, event_type, message, guest_name, guest_email, guest_phone, member_id, sleeping_guests, day_visitors, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, proposal_total_amount, amount_paid, amount_total";

export type InstantConfirmOutcome =
  | { confirmed: true }
  | { confirmed: false; reason: string };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readSetting(key: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle<{ value: unknown }>();
  if (error) {
    console.error(`${LOG_TAG} setting lookup failed`, { key, message: error.message });
    return null;
  }
  return data?.value ?? null;
}

export async function maybeInstantConfirmBooking(
  bookingId: string | null | undefined,
): Promise<InstantConfirmOutcome> {
  if (!bookingId) return { confirmed: false, reason: "no_booking" };
  try {
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !booking) {
      return { confirmed: false, reason: "booking_unavailable" };
    }

    const row = booking as unknown as InstantConfirmBooking & { id: string; check_in: string | null };
    const villa = row.villa ?? "";
    const villaKey =
      INSTANT_BOOKING_SETTING_KEYS[villa as keyof typeof INSTANT_BOOKING_SETTING_KEYS];

    const [autoConfirmRaw, villaRaw] = await Promise.all([
      readSetting(INSTANT_AUTO_CONFIRM_SETTING_KEY),
      villaKey ? readSetting(villaKey) : Promise.resolve(null),
    ]);

    const decision = decideInstantConfirmation({
      booking: row,
      settings: {
        auto_confirm_enabled: parseInstantBookingSetting(autoConfirmRaw),
        villa_instant_enabled: villaKey ? parseInstantBookingSetting(villaRaw) : false,
      },
      today_utc: todayUtc(),
    });
    if (!decision.confirm) {
      // Not an error — most bookings legitimately need a human.
      return { confirmed: false, reason: decision.reason };
    }

    // Availability is decided at payment time, never at booking time.
    try {
      const conflict = await findAvailabilityConflict(
        villa,
        row.check_in ?? "",
        row.check_out ?? "",
        bookingId,
        false,
      );
      if (conflict) {
        console.error(`${LOG_TAG} paid booking overlaps a blocked stay — left pending`, {
          booking_id: bookingId,
        });
        return { confirmed: false, reason: "availability_conflict" };
      }
    } catch (conflictError) {
      console.error(`${LOG_TAG} availability check failed — left pending`, conflictError);
      return { confirmed: false, reason: "availability_unverified" };
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId)
      .eq("status", "pending")
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    if (updateError) {
      if (isExclusionViolation(updateError)) {
        console.error(`${LOG_TAG} lost the overlap race — booking stays pending`, {
          booking_id: bookingId,
        });
        return { confirmed: false, reason: "availability_conflict" };
      }
      console.error(`${LOG_TAG} confirm update failed`, updateError.message);
      return { confirmed: false, reason: "confirm_failed" };
    }
    if (!updated) {
      // Zero rows: someone else already approved or cancelled it.
      return { confirmed: false, reason: "not_pending" };
    }

    // Same dispatcher the human approve path uses: confirmation email +
    // Phase 16C Arrival Guide, each with its own at-most-once guard.
    try {
      await dispatchBookingStatusGuestMessages(
        supabaseAdmin,
        bookingId,
        "confirmed",
        updated as unknown as GuestDispatchBookingRow,
        { logTag: LOG_TAG },
      );
    } catch (dispatchError) {
      console.error(`${LOG_TAG} guest dispatch failed after confirming`, dispatchError);
    }
    return { confirmed: true };
  } catch (error) {
    console.error(`${LOG_TAG} unexpected failure — booking left pending`, error);
    return { confirmed: false, reason: "unexpected_error" };
  }
}

export { describeInstantConfirmSkip };
