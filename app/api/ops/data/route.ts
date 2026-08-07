import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/data]";

/**
 * Member emails live in auth.users and cost one admin-API call each, so they
 * are cached for the process lifetime — a member's login email changing is
 * rare enough that a redeploy-freshness cache is honest. Names/phones come
 * from the members table in one query per request.
 */
const memberEmailCache = new Map<string, string | null>();

async function resolveMemberEmails(memberIds: string[]): Promise<Map<string, string | null>> {
  const missing = memberIds.filter((id) => !memberEmailCache.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        memberEmailCache.set(id, data?.user?.email ?? null);
      } catch {
        // Leave uncached so the next poll retries.
      }
    }),
  );
  return memberEmailCache;
}

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
    "id", "villa", "check_in", "check_out", "status", "created_at", "member_id",
    "guest_name", "guest_email", "guest_phone", "guest_country",
    "sleeping_guests", "day_visitors", "message", "event_type",
    "addons_snapshot", "pricing_subtotal", "pricing_snapshot",
    "payment_status", "payment_method", "payment_due_at", "payment_reference",
    "deposit_amount", "amount_paid", "amount_total", "amount_due",
    "payment_received_at", "payment_marked_by",
    "refund_status", "refund_amount", "refunded_at", "refund_provider_reference",
    "whatsapp_confirmation_sent_at",
    // Event proposals — the /ops event flow reads these.
    "proposal_status", "proposal_total_amount", "proposal_deposit_amount",
    "proposal_valid_until", "proposal_payment_methods", "proposal_notes",
  ].join(", ");

  // Blocks that ended more than a month ago are history, not availability.
  const blocksHorizon = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [bookingsResult, leadsResult, sourcesResult, blocksResult] = await Promise.all([
    supabaseAdmin.from("bookings").select(bookingColumns).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("whatsapp_leads")
      // Column names verified against the live table — this is `name`, not
      // `guest_name`, and `follow_up_status`, not `status`.
      .select("id, name, phone, villa, request_type, follow_up_status, admin_notes, special_requests, addons_interest, normalized_check_in, normalized_check_out, check_in_text, check_out_text, guest_count, labels, linked_booking_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("external_calendar_sources")
      .select("id, villa, source_name, is_enabled, last_synced_at, last_sync_status, last_error"),
    supabaseAdmin
      .from("external_blocks")
      .select("id, villa, source_id, starts_on, ends_on, summary")
      .eq("is_active", true)
      .gte("ends_on", blocksHorizon)
      .order("starts_on", { ascending: true }),
  ]);

  // D-4 lesson: a failed load must never be served as an empty one. Any failure
  // here returns an error status so the UI can say so, rather than rendering a
  // convincing "nothing needs you today".
  for (const [label, result] of [
    ["bookings", bookingsResult],
    ["leads", leadsResult],
    ["calendar sources", sourcesResult],
    ["external blocks", blocksResult],
  ] as const) {
    if (result.error) {
      console.error(`${LOG_TAG} ${label} query failed:`, result.error.message);
      return NextResponse.json({ error: `Could not load ${label}.` }, { status: 503 });
    }
  }

  // Member bookings carry no guest_* contact — the identity lives on the
  // member account. Resolve the bounded set of distinct member_ids so the
  // operator sees a person, not "Guest" with dashes (live evidence: 574D64A5).
  type BookingRow = { member_id: string | null; [key: string]: unknown };
  const bookingRows = (bookingsResult.data ?? []) as unknown as BookingRow[];
  const memberIds = [...new Set(bookingRows.map((b) => b.member_id).filter((v): v is string => Boolean(v)))];

  let memberContacts = new Map<string, { full_name: string | null; phone: string | null }>();
  if (memberIds.length > 0) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from("members")
      .select("id, full_name, phone")
      .in("id", memberIds);
    if (membersError) {
      // Enrichment is additive; a failed members read must not blank the console.
      console.error(`${LOG_TAG} members lookup failed:`, membersError.message);
    } else {
      memberContacts = new Map(
        (members ?? []).map((m) => [m.id as string, { full_name: m.full_name ?? null, phone: m.phone ?? null }]),
      );
    }
    await resolveMemberEmails(memberIds);
  }

  const bookings = bookingRows.map((b) => {
    if (!b.member_id) return { ...b, member_contact: null };
    const contact = memberContacts.get(b.member_id);
    const email = memberEmailCache.get(b.member_id) ?? null;
    return {
      ...b,
      member_contact: {
        full_name: contact?.full_name ?? null,
        email,
        phone: contact?.phone ?? null,
      },
    };
  });

  return NextResponse.json({
    bookings,
    leads: leadsResult.data ?? [],
    calendar_sources: sourcesResult.data ?? [],
    external_blocks: blocksResult.data ?? [],
    me: auth.staff,
    fetched_at: new Date().toISOString(),
  });
}
