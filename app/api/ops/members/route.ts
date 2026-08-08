import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/members]";

/**
 * Owner-only member list with the booking count each member carries.
 *
 * Audit M-5: the legacy delete never showed how many bookings would be
 * detached. The count is resolved here so the confirmation can name the
 * consequence instead of describing it vaguely.
 */
export async function GET(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const [membersResult, bookingsResult] = await Promise.all([
    supabaseAdmin
      .from("members")
      .select("id, full_name, phone, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("bookings").select("member_id").not("member_id", "is", null),
  ]);

  if (membersResult.error) {
    console.error(`${LOG_TAG} list failed:`, membersResult.error.message);
    return NextResponse.json({ error: "Could not load the members." }, { status: 503 });
  }
  if (bookingsResult.error) {
    console.error(`${LOG_TAG} booking counts failed:`, bookingsResult.error.message);
    return NextResponse.json({ error: "Could not load the members." }, { status: 503 });
  }

  const counts = new Map<string, number>();
  for (const row of bookingsResult.data ?? []) {
    const id = (row as { member_id: string | null }).member_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // Emails live in auth.users, not the members table.
  const members = await Promise.all(
    (membersResult.data ?? []).map(async (m) => {
      let email: string | null = null;
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(m.id as string);
        email = data?.user?.email ?? null;
      } catch {
        /* an unreadable auth record must not blank the whole list */
      }
      return {
        id: m.id as string,
        full_name: (m.full_name as string | null) ?? null,
        phone: (m.phone as string | null) ?? null,
        created_at: (m.created_at as string | null) ?? null,
        email,
        booking_count: counts.get(m.id as string) ?? 0,
      };
    }),
  );

  return NextResponse.json({ ok: true, members });
}
