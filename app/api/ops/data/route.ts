import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/data]";

/**
 * Operator-safe read for the /ops interface.
 *
 * Deliberately NOT `/api/admin/data`. Letting an ops session through the admin
 * guard would have opened every /api/admin/* route to operators — including
 * rates and the live-payments switch — which is exactly the boundary the roles
 * exist to draw.
 */
export async function GET(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;

  const bookingColumns = [
    "id", "villa", "check_in", "check_out", "status", "created_at",
    "guest_name", "guest_email", "guest_phone", "guest_country",
    "sleeping_guests", "day_visitors", "message", "event_type",
    "addons_snapshot",
    "payment_status", "payment_method", "payment_due_at", "payment_reference",
    "deposit_amount", "amount_paid", "amount_total", "amount_due",
    "payment_received_at", "payment_marked_by",
    "refund_status", "refund_amount", "refunded_at", "refund_provider_reference",
    "whatsapp_confirmation_sent_at",
  ].join(", ");

  const [bookingsResult, leadsResult, sourcesResult] = await Promise.all([
    supabaseAdmin.from("bookings").select(bookingColumns).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("whatsapp_leads")
      // Column names verified against the live table — this is `name`, not
      // `guest_name`, and `follow_up_status`, not `status`.
      .select("id, name, phone, villa, request_type, follow_up_status, admin_notes, special_requests, normalized_check_in, normalized_check_out, check_in_text, check_out_text, guest_count, labels, linked_booking_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("external_calendar_sources")
      .select("id, villa, source_name, is_enabled, last_synced_at, last_sync_status, last_error"),
  ]);

  // D-4 lesson: a failed load must never be served as an empty one. Any failure
  // here returns an error status so the UI can say so, rather than rendering a
  // convincing "nothing needs you today".
  for (const [label, result] of [
    ["bookings", bookingsResult],
    ["leads", leadsResult],
    ["calendar sources", sourcesResult],
  ] as const) {
    if (result.error) {
      console.error(`${LOG_TAG} ${label} query failed:`, result.error.message);
      return NextResponse.json({ error: `Could not load ${label}.` }, { status: 503 });
    }
  }

  return NextResponse.json({
    bookings: bookingsResult.data ?? [],
    leads: leadsResult.data ?? [],
    calendar_sources: sourcesResult.data ?? [],
    me: auth.staff,
    fetched_at: new Date().toISOString(),
  });
}
