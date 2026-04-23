import { supabaseAdmin } from "@/lib/supabase-admin";

export interface AvailabilityRange {
  check_in: string;
  check_out: string;
  source: "native" | "external";
}

export async function getMergedAvailabilityRanges(villa: string): Promise<AvailabilityRange[]> {
  const [{ data: bookings, error: bookingsError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("check_in, check_out")
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
    ...((bookings ?? []).map((row) => ({
      check_in: row.check_in,
      check_out: row.check_out,
      source: "native" as const,
    }))),
    ...((blocks ?? []).map((row) => ({
      check_in: row.starts_on,
      check_out: row.ends_on,
      source: "external" as const,
    }))),
  ];
}

export async function findAvailabilityConflict(villa: string, checkIn: string, checkOut: string, excludeBookingId?: string) {
  const [bookingQuery, blockQuery] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("id, check_in, check_out")
      .eq("villa", villa)
      .eq("status", "confirmed")
      .lt("check_in", checkOut)
      .gt("check_out", checkIn),
    supabaseAdmin
      .from("external_blocks")
      .select("id, starts_on, ends_on")
      .eq("villa", villa)
      .eq("is_active", true)
      .lt("starts_on", checkOut)
      .gt("ends_on", checkIn),
  ]);

  if (bookingQuery.error) throw bookingQuery.error;
  if (blockQuery.error) throw blockQuery.error;

  const bookingConflict = (bookingQuery.data ?? []).find((row) => row.id !== excludeBookingId);
  if (bookingConflict) {
    return {
      check_in: bookingConflict.check_in,
      check_out: bookingConflict.check_out,
      source: "native" as const,
    };
  }

  const blockConflict = (blockQuery.data ?? [])[0];
  if (blockConflict) {
    return {
      check_in: blockConflict.starts_on,
      check_out: blockConflict.ends_on,
      source: "external" as const,
    };
  }

  return null;
}
