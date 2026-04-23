import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { escapeIcalText, formatIcalDate, formatIcalTimestamp } from "@/lib/calendar/ical";
import { getVillaSlug, resolveVillaFromSlug } from "@/lib/calendar/villas";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { villa: string } }
) {
  const villa = resolveVillaFromSlug(params.villa);
  if (!villa) {
    return NextResponse.json({ error: "Unknown villa." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, check_in, check_out, created_at")
    .eq("villa", villa)
    .eq("status", "confirmed")
    .order("check_in", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nowStamp = formatIcalTimestamp();
  const events = (data ?? []).map((booking) => [
    "BEGIN:VEVENT",
    `UID:${escapeIcalText(`booking-${booking.id}@oraya.calendar`)}`,
    `DTSTAMP:${formatIcalTimestamp(booking.created_at ? new Date(booking.created_at) : new Date())}`,
    `DTSTART;VALUE=DATE:${formatIcalDate(booking.check_in)}`,
    `DTEND;VALUE=DATE:${formatIcalDate(booking.check_out)}`,
    "SUMMARY:Reserved",
    "END:VEVENT",
  ].join("\r\n"));

  const slug = getVillaSlug(villa) ?? params.villa;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oraya//Availability Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcalText(`Oraya ${villa}`)}`,
    `X-WR-TIMEZONE:UTC`,
    `X-PUBLISHED-TTL:PT1H`,
    `LAST-MODIFIED:${nowStamp}`,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
