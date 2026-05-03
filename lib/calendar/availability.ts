import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  addDaysToDateOnly,
  getOperationalRange,
  isEventBookingRow,
  rangesOverlap,
  type DateRange,
} from "@/lib/calendar/event-block";

export interface AvailabilityRange {
  check_in: string;
  check_out: string;
  source: "native" | "external";
}

/**
 * Phase 14J: confirmed events return their *operational* range
 * (block_start = check_in - 1 day, block_end = check_out).
 * Stays return their stored range unchanged. External blocks are unchanged.
 */
export async function getMergedAvailabilityRanges(villa: string): Promise<AvailabilityRange[]> {
  const [{ data: bookings, error: bookingsError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("check_in, check_out, event_type, message")
      .eq("villa", villa)
      .eq("status", "confirmed"),
    supabaseAdmin
      .from("external_blocks")
      .select("starts_on, ends_on")
      .eq("villa", villa)
      .eq("is_active", true),
  ]);

  if (bookingsError) throw bookingsError;
  if (blocksError) throw blocksError;

  return [
    ...((bookings ?? []).map((row) => {
      const op = getOperationalRange({
        check_in: row.check_in,
        check_out: row.check_out,
        event_type: row.event_type,
        message: row.message,
      });
      return {
        check_in: op.check_in,
        check_out: op.check_out,
        source: "native" as const,
      };
    })),
    ...((blocks ?? []).map((row) => ({
      check_in: row.starts_on,
      check_out: row.ends_on,
      source: "external" as const,
    }))),
  ];
}

/**
 * Phase 14J: event-aware conflict detection.
 *
 * - Incoming booking is treated as an event when caller passes `incomingIsEvent: true`.
 *   When true, the requested [check_in, check_out) is expanded to [check_in - 1, check_out)
 *   for the overlap test (mirrors the operational rule applied to confirmed events).
 * - Existing confirmed bookings' ranges are also expanded if they themselves are events.
 * - Different villas remain independent (handled by the `eq("villa", villa)` filter).
 *
 * SQL filter is intentionally loose (we widen by 1 day on both sides) so that an event row
 * whose stored check_in equals the incoming check_in still gets fetched and re-tested in JS
 * with the expanded range. Final conflict decision is always made in JS using `rangesOverlap`
 * on the operational ranges.
 */
export async function findAvailabilityConflict(
  villa: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
  incomingIsEvent: boolean = false,
) {
  const incomingRange: DateRange = incomingIsEvent
    ? { check_in: addDaysToDateOnly(checkIn, -1), check_out: checkOut }
    : { check_in: checkIn, check_out: checkOut };

  // Loose SQL filter: widen by 1 day to safely catch any event row whose stored dates
  // would expand into the incoming range. Final precision is enforced in JS.
  const looseLowerBound = addDaysToDateOnly(incomingRange.check_in, -1);
  const looseUpperBound = addDaysToDateOnly(incomingRange.check_out, 1);

  const [bookingQuery, blockQuery] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("id, check_in, check_out, event_type, message")
      .eq("villa", villa)
      .eq("status", "confirmed")
      .lt("check_in", looseUpperBound)
      .gt("check_out", looseLowerBound),
    supabaseAdmin
      .from("external_blocks")
      .select("id, starts_on, ends_on")
      .eq("villa", villa)
      .eq("is_active", true)
      .lt("starts_on", incomingRange.check_out)
      .gt("ends_on", incomingRange.check_in),
  ]);

  if (bookingQuery.error) throw bookingQuery.error;
  if (blockQuery.error) throw blockQuery.error;

  for (const row of bookingQuery.data ?? []) {
    if (row.id === excludeBookingId) continue;
    const existingRange = getOperationalRange({
      check_in: row.check_in,
      check_out: row.check_out,
      event_type: row.event_type,
      message: row.message,
    });
    if (rangesOverlap(incomingRange, existingRange)) {
      return {
        check_in: existingRange.check_in,
        check_out: existingRange.check_out,
        source: "native" as const,
        is_event: isEventBookingRow({ event_type: row.event_type, message: row.message }),
      };
    }
  }

  const blockConflict = (blockQuery.data ?? [])[0];
  if (blockConflict) {
    return {
      check_in: blockConflict.starts_on,
      check_out: blockConflict.ends_on,
      source: "external" as const,
      is_event: false,
    };
  }

  return null;
}
