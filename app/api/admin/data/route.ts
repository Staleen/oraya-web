import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";  // prevent Next.js Data Cache on internal fetches

export async function GET(request: Request) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  console.log("[api/admin/data] GET called");

  // ── Bookings ──────────────────────────────────────────────────────────────
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, member_id, villa, check_in, check_out, sleeping_guests, day_visitors, event_type, message, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, status, created_at, guest_name, guest_email, guest_phone, guest_country, payment_status, payment_method, deposit_amount, amount_paid, payment_reference, payment_notes, payment_requested_at, payment_received_at, payment_due_at, payment_marked_by, refund_status, refund_amount, refunded_at, proposal_status, proposal_total_amount, proposal_deposit_amount, proposal_included_services, proposal_excluded_services, proposal_optional_services, proposal_notes, proposal_valid_until, proposal_payment_methods, proposal_sent_at, proposal_responded_at"
    )
    .order("created_at", { ascending: false });

  if (bookingsError) {
    console.error("[api/admin/data] bookings query error:", JSON.stringify(bookingsError));
    return NextResponse.json({ error: bookingsError.message }, { status: 500 });
  }
  console.log(`[api/admin/data] bookings fetched: ${bookings?.length ?? 0} rows`);

  // ── Members ───────────────────────────────────────────────────────────────
  const { data: members, error: membersError } = await supabaseAdmin
    .from("members")
    .select("id, full_name, phone, country, address, created_at")
    .order("created_at", { ascending: false });

  if (membersError) {
    console.error("[api/admin/data] members query error:", JSON.stringify(membersError));
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }
  console.log(`[api/admin/data] members fetched: ${members?.length ?? 0} rows`);

  // ── Auth emails (best-effort — don't let failures block the response) ─────
  const emailMap: Record<string, string> = {};
  try {
    let page    = 1;
    const perPage = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (authError) {
        console.error("[api/admin/data] listUsers error:", JSON.stringify(authError));
        break;
      }
      if (!authData?.users) break;
      for (const u of authData.users) {
        emailMap[u.id] = u.email ?? "";
      }
      if (authData.users.length < perPage) break;
      page++;
    }
  } catch (err) {
    console.error("[api/admin/data] listUsers threw:", err);
  }

  const membersWithEmail = (members ?? []).map((m) => ({
    ...m,
    email: emailMap[m.id] ?? "",
  }));

  const { data: calendarSources, error: calendarSourcesError } = await supabaseAdmin
    .from("external_calendar_sources")
    .select("id, villa, source_name, feed_url, is_enabled, last_synced_at, last_sync_status, last_error, created_at")
    .order("created_at", { ascending: false });

  if (calendarSourcesError) {
    console.error("[api/admin/data] external_calendar_sources query error:", JSON.stringify(calendarSourcesError));
    return NextResponse.json({ error: calendarSourcesError.message }, { status: 500 });
  }

  console.log(
    `[api/admin/data] returning ${bookings?.length ?? 0} bookings, ${membersWithEmail.length} members, ${calendarSources?.length ?? 0} calendar sources`
  );
  return NextResponse.json(
    { bookings: bookings ?? [], members: membersWithEmail, calendar_sources: calendarSources ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
