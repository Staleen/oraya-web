import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
// Remediation 2.4: shared service-role client (carries the Data-Cache
// no-store workaround) instead of a route-local createClient.
import { supabaseAdmin } from "@/lib/supabase-admin";

// PATCH — resolve a single add-on approval item within the booking's addons_snapshot.
// Defaults to approve for backward compatibility, and can also mark the item declined.
// No booking status, pricing, email, calendar, or overlap logic is touched.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const denied = requireAdminAuth(request);
  if (denied) return denied;

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

  // Fetch only the snapshot column — we need nothing else.
  const { data: booking, error: fetchErr } = await supabaseAdmin
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

  // Remediation 2.4: optimistic-concurrency guard — the write only applies if
  // the snapshot is still exactly what we read (jsonb equality is semantic),
  // so two concurrent approvals cannot silently drop each other's change.
  const { data: updatedRows, error: updateErr } = await supabaseAdmin
    .from("bookings")
    .update({ addons_snapshot: updatedSnapshot })
    .eq("id", params.id)
    .eq("addons_snapshot", JSON.stringify(snapshot))
    .select("id");

  if (updateErr) {
    console.error("[api/admin/bookings/approve-addon] update error:", updateErr);
    return NextResponse.json({ error: "Could not update the add-on." }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      { error: "This booking's add-ons changed while you were editing. Reload and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, addons_snapshot: updatedSnapshot });
}
