import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS, admin-only route.
function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[api/admin/bookings/approve-addon] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// PATCH — resolve a single add-on approval item within the booking's addons_snapshot.
// Defaults to approve for backward compatibility, and can also mark the item declined.
// No booking status, pricing, email, calendar, or overlap logic is touched.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let addon_id: string;
  let decision: "approve" | "decline" = "approve";
  try {
    const body = await request.json();
    if (!body.addon_id || typeof body.addon_id !== "string") {
      return NextResponse.json({ error: "addon_id is required and must be a string." }, { status: 400 });
    }
    addon_id = body.addon_id;
    if (body.decision !== undefined) {
      if (body.decision !== "approve" && body.decision !== "decline") {
        return NextResponse.json({ error: "decision must be 'approve' or 'decline'." }, { status: 400 });
      }
      decision = body.decision;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const db = makeAdminClient();

  // Fetch only the snapshot column — we need nothing else.
  const { data: booking, error: fetchErr } = await db
    .from("bookings")
    .select("addons_snapshot")
    .eq("id", params.id)
    .single();

  if (fetchErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const snapshot = booking.addons_snapshot as Array<Record<string, unknown>> | null;

  if (!snapshot || !Array.isArray(snapshot) || snapshot.length === 0) {
    return NextResponse.json({ error: "No add-on snapshot found for this booking." }, { status: 404 });
  }

  const addonIndex = snapshot.findIndex((item) => item.id === addon_id);
  if (addonIndex === -1) {
    return NextResponse.json({ error: "Add-on not found in snapshot." }, { status: 404 });
  }

  const resolvedAt = new Date().toISOString();

  // Clone snapshot array, update only the matched item.
  const updatedSnapshot = snapshot.map((item, i) =>
    i === addonIndex
      ? {
          ...item,
          status: decision === "approve" ? "approved" : "declined",
          admin_approved: decision === "approve",
          admin_approved_at: decision === "approve" ? resolvedAt : null,
        }
      : item
  );

  const { error: updateErr } = await db
    .from("bookings")
    .update({ addons_snapshot: updatedSnapshot })
    .eq("id", params.id);

  if (updateErr) {
    console.error("[api/admin/bookings/approve-addon] update error:", updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, addons_snapshot: updatedSnapshot });
}
