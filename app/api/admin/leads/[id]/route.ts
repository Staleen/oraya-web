import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { readLeadAdminPatch, type WhatsappLeadAdminRow } from "@/lib/butler/leads";

/**
 * Phase 16A.2.e — admin update endpoint for a single WhatsApp lead.
 * Phase 16A.2.h — adds DELETE for permanent removal of a single
 *   `whatsapp_leads` row. Guarded by `linked_booking_id`: a lead that has
 *   been linked to a real booking cannot be deleted from this endpoint.
 *   No other table is touched — bookings, members, settings, addons,
 *   booking_action_tokens, calendar data are all out of scope.
 *
 * PATCH /api/admin/leads/[id]
 *   Mutable fields (v1):
 *     - follow_up_status: one of new|contacted|needs_action|converted|lost|spam
 *     - labels:           string[] (replaces existing array)
 *     - admin_notes:      string | null
 *     - linked_booking_id: uuid | null
 *
 *   Intentionally NOT mutable from the admin UI in v1:
 *     - source, phone, name, dates, raw_payload, the underlying timestamps.
 *     - Those reflect what the Butler ingested; operators audit them, they
 *       don't rewrite them. A future phase can add explicit edit affordances
 *       if needed.
 *
 *   Returns:
 *     200 { ok: true, lead: WhatsappLeadAdminRow }
 *     400 invalid_request if the body is malformed or contains no mutable field
 *     404 not_found if the row does not exist
 *     401 / 503 from requireAdminAuth on auth/env failure
 *     500 server_error on Supabase failure
 *
 * DELETE /api/admin/leads/[id]
 *   Permanently removes a single `whatsapp_leads` row by id. Bookings and
 *   every other table are untouched.
 *
 *   Returns:
 *     200 { ok: true }
 *     400 { ok: false, error: "invalid_request" }      — bad uuid
 *     401 / 503 from requireAdminAuth on auth/env failure
 *     404 { ok: false, error: "not_found" }            — no row matched
 *     409 { ok: false, error: "linked_booking_exists" } — lead has linked_booking_id set
 *     500 { ok: false, error: "server_error" }         — Supabase failure
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SELECT_COLUMNS =
  "id, created_at, updated_at, source, phone, name, request_type, villa, " +
  "check_in_text, check_out_text, normalized_check_in, normalized_check_out, " +
  "guest_count, addons_interest, special_requests, follow_up_status, labels, " +
  "linked_booking_id, admin_notes";

function invalid() {
  return NextResponse.json(
    { ok: false, error: "invalid_request" },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

function serverError() {
  return NextResponse.json(
    { ok: false, error: "server_error" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const id = params?.id?.trim() ?? "";
  if (!id || !UUID_RE.test(id)) return invalid();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalid();
  }

  const parsed = readLeadAdminPatch(raw);
  if (parsed === "invalid" || parsed === "empty") return invalid();

  // updated_at is also maintained by the DB trigger, but set it explicitly
  // here so the response reflects the post-update value without a re-read.
  const update: Record<string, unknown> = { ...parsed, updated_at: new Date().toISOString() };

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_leads")
      .update(update)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error("[api/admin/leads/:id] update error:", error);
      return serverError();
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, lead: data as unknown as WhatsappLeadAdminRow },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[api/admin/leads/:id] unexpected error:", error);
    return serverError();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const id = params?.id?.trim() ?? "";
  if (!id || !UUID_RE.test(id)) return invalid();

  try {
    // Pre-flight: confirm the lead exists and is unlinked. A linked lead is
    // operationally significant — refuse to delete it from this endpoint and
    // require the operator to clear linked_booking_id via PATCH first.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("whatsapp_leads")
      .select("id, linked_booking_id")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("[api/admin/leads/:id] delete lookup error:", lookupError);
      return serverError();
    }
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    if (existing.linked_booking_id) {
      return NextResponse.json(
        { ok: false, error: "linked_booking_exists" },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    // Defense-in-depth: re-assert the linked_booking_id-is-null condition on
    // the DELETE itself so a concurrent PATCH cannot slip a link in between
    // the lookup and the delete.
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("whatsapp_leads")
      .delete()
      .eq("id", id)
      .is("linked_booking_id", null)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      console.error("[api/admin/leads/:id] delete error:", deleteError);
      return serverError();
    }
    if (!deleted) {
      // Either the row vanished between the two queries, or a concurrent
      // PATCH set linked_booking_id. Surface the second case explicitly so
      // the operator sees the correct reason.
      const { data: recheck } = await supabaseAdmin
        .from("whatsapp_leads")
        .select("id, linked_booking_id")
        .eq("id", id)
        .maybeSingle();
      if (recheck?.linked_booking_id) {
        return NextResponse.json(
          { ok: false, error: "linked_booking_exists" },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      }
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[api/admin/leads/:id] unexpected delete error:", error);
    return serverError();
  }
}
