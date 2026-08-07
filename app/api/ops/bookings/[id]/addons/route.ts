import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/bookings/[id]/addons]";

/**
 * Resolve one add-on approval from /ops.
 *
 * Deliberately its own ops-guarded route — an ops session must never pass an
 * /api/admin guard. The write mirrors the admin approve-addon route's
 * optimistic-concurrency pattern exactly: the snapshot update only applies if
 * the snapshot is still what was read, so two people resolving add-ons at the
 * same time cannot silently drop each other's decision (audit B-13 class).
 *
 * Re-resolving an already-resolved add-on is allowed on purpose (audit B-14:
 * a mis-click decline must be reversible from the UI). No booking status,
 * pricing, email, or guest messaging is touched.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let addonId = "";
  let decision: "approve" | "decline" | null = null;
  try {
    const body = (await request.json()) as { addon_id?: string; decision?: string };
    addonId = typeof body.addon_id === "string" ? body.addon_id : "";
    if (body.decision === "approve" || body.decision === "decline") decision = body.decision;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!addonId || !decision) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: booking, error: fetchErr } = await supabaseAdmin
    .from("bookings")
    .select("addons_snapshot")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error(`${LOG_TAG} load failed:`, fetchErr.message);
    return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
  }
  if (!booking) {
    return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
  }

  const snapshot = booking.addons_snapshot as Array<Record<string, unknown>> | null;
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return NextResponse.json({ error: "This booking has no add-ons." }, { status: 404 });
  }
  const index = snapshot.findIndex((item) => item.id === addonId);
  if (index === -1) {
    return NextResponse.json({ error: "That add-on is not on this booking." }, { status: 404 });
  }

  const resolvedAt = new Date().toISOString();
  const updatedSnapshot = snapshot.map((item, i) =>
    i === index
      ? {
          ...item,
          status: decision === "approve" ? "approved" : "declined",
          admin_approved: decision === "approve",
          admin_approved_at: decision === "approve" ? resolvedAt : null,
        }
      : item,
  );

  const { data: updatedRows, error: updateErr } = await supabaseAdmin
    .from("bookings")
    .update({ addons_snapshot: updatedSnapshot })
    .eq("id", id)
    .eq("addons_snapshot", JSON.stringify(snapshot))
    .select("id");

  if (updateErr) {
    console.error(`${LOG_TAG} update failed:`, updateErr.message);
    return NextResponse.json({ error: "Could not save that decision." }, { status: 503 });
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      {
        error: "This booking's add-ons changed while you were deciding. Look again before retrying.",
        code: "changed_elsewhere",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, addons_snapshot: updatedSnapshot, acted_by: auth.staff.full_name });
}
