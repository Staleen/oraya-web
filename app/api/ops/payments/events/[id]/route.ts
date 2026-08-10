import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Owner/ops can dismiss a stuck provider event from Needs your attention after
 * reviewing Business Center. Sets processing_status = ignored (allowed by schema).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.action !== "ignore") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 4) {
    return NextResponse.json(
      { error: "Add a short note before dismissing this bank message." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("payment_provider_events")
    .update({
      processing_status: "ignored",
      processed_at: now,
      error_code: reason.slice(0, 120),
    })
    .eq("id", id)
    .in("processing_status", ["pending", "failed"])
    .select("id, processing_status")
    .maybeSingle();

  if (error) {
    console.error("[ops/payment-events] ignore failed", error.message);
    return NextResponse.json({ error: "Could not dismiss that bank message." }, { status: 503 });
  }
  if (!data) {
    // Also allow dismissing rejected/unverifiable events that are still pending-adjacent.
    const { data: retry, error: retryError } = await supabaseAdmin
      .from("payment_provider_events")
      .update({
        processing_status: "ignored",
        processed_at: now,
        error_code: reason.slice(0, 120),
      })
      .eq("id", id)
      .neq("processing_status", "ignored")
      .neq("processing_status", "processed")
      .select("id, processing_status")
      .maybeSingle();
    if (retryError) {
      console.error("[ops/payment-events] ignore retry failed", retryError.message);
      return NextResponse.json({ error: "Could not dismiss that bank message." }, { status: 503 });
    }
    if (!retry) {
      return NextResponse.json({ error: "That bank message is already finished." }, { status: 409 });
    }
    console.info("[ops/payment-events] ignored by ops", {
      event_id: id,
      staff_id: auth.staff.id,
      reason,
    });
    return NextResponse.json({ ok: true, event: retry });
  }

  console.info("[ops/payment-events] ignored by ops", {
    event_id: id,
    staff_id: auth.staff.id,
    reason,
  });
  return NextResponse.json({ ok: true, event: data });
}
