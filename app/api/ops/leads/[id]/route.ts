import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/leads/[id]]";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same whatsapp_leads columns GET /api/ops/data selects. */
const SELECT_COLUMNS =
  "id, name, phone, villa, request_type, follow_up_status, admin_notes, special_requests, addons_interest, normalized_check_in, normalized_check_out, check_in_text, check_out_text, guest_count, labels, linked_booking_id, created_at";

// Live values in use — see OPS_ADMIN_V2.md §7.
const FOLLOW_UP_STATUSES = ["new", "contacted", "converted"] as const;

/**
 * Operator updates on a WhatsApp lead: follow-up status, notes, and the
 * conversion link. Deliberately NOT the admin leads route — an ops session must
 * never pass an /api/admin/* guard.
 *
 * Audit L-6 guard: writing a non-null `linked_booking_id` only applies while
 * the current value is null. A zero-row result on a still-existing lead means
 * another session converted it first → 409 `already_linked`, so a retry can
 * never silently orphan the other session's booking.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, "follow_up_status")) {
    const value = typeof body.follow_up_status === "string" ? body.follow_up_status.trim().toLowerCase() : "";
    if (!(FOLLOW_UP_STATUSES as readonly string[]).includes(value)) {
      return NextResponse.json({ error: "Invalid follow-up status." }, { status: 400 });
    }
    update.follow_up_status = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "admin_notes")) {
    const value = body.admin_notes;
    if (value === null || value === "") update.admin_notes = null;
    else if (typeof value === "string") update.admin_notes = value;
    else return NextResponse.json({ error: "Invalid notes." }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(body, "labels")) {
    const value = body.labels;
    // The label vocabulary the legacy admin established (leadHelpers.ts):
    // free text is allowed, but everything must be a short plain string.
    if (
      !Array.isArray(value) ||
      !value.every((l) => typeof l === "string" && l.trim().length > 0 && l.length <= 40)
    ) {
      return NextResponse.json({ error: "Invalid labels." }, { status: 400 });
    }
    update.labels = value.map((l) => (l as string).trim());
  }

  let settingLink = false;
  if (Object.prototype.hasOwnProperty.call(body, "linked_booking_id")) {
    const value = body.linked_booking_id;
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      // Unlinking is deliberately not offered: a conversion link is provenance,
      // not a preference.
      return NextResponse.json({ error: "Invalid booking link." }, { status: 400 });
    }
    update.linked_booking_id = value;
    settingLink = true;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const base = supabaseAdmin.from("whatsapp_leads").update(update).eq("id", id);
  const guarded = settingLink ? base.is("linked_booking_id", null) : base;
  const { data, error } = await guarded.select(SELECT_COLUMNS).maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} update failed:`, error.message);
    return NextResponse.json({ error: "Could not save that change." }, { status: 503 });
  }

  if (!data) {
    if (settingLink) {
      // Does the lead still exist? If yes, someone else linked it first.
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_leads")
        .select("id, linked_booking_id")
        .eq("id", id)
        .maybeSingle<{ id: string; linked_booking_id: string | null }>();
      if (existing?.linked_booking_id) {
        return NextResponse.json(
          {
            error: "This enquiry was already converted by another session.",
            code: "already_linked",
            linked_booking_id: existing.linked_booking_id,
          },
          { status: 409 },
        );
      }
    }
    return NextResponse.json({ error: "This enquiry no longer exists." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, lead: data });
}
