import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isFollowUpStatus, type WhatsappLeadAdminRow } from "@/lib/butler/leads";

/**
 * Phase 16A.2.e — admin list endpoint for WhatsApp leads.
 *
 * GET /api/admin/leads
 *   Query (all optional):
 *     - follow_up_status: one of new|contacted|needs_action|converted|lost|spam
 *     - request_type:     informational filter (stay|event|question|…)
 *     - villa:            informational filter (e.g. "Villa Byblos")
 *     - limit:            1..500, default 100
 *
 *   Returns:
 *     200 { ok: true, leads: WhatsappLeadAdminRow[] }
 *     401 / 503 from requireAdminAuth on auth/env failure.
 *
 * `raw_payload` is **not** selected here — operators can inspect it in
 * Supabase if they truly need it. Booking IDs of OTHER guests are not
 * exposed: this endpoint only returns rows from `whatsapp_leads`, and the
 * only booking ID a row carries is its own `linked_booking_id`.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 500;

const SELECT_COLUMNS =
  "id, created_at, updated_at, source, phone, name, request_type, villa, " +
  "check_in_text, check_out_text, normalized_check_in, normalized_check_out, " +
  "guest_count, addons_interest, special_requests, follow_up_status, labels, " +
  "linked_booking_id, admin_notes";

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return DEFAULT_LIMIT;
  if (n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(request: Request) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const url             = new URL(request.url);
  const statusFilter    = url.searchParams.get("follow_up_status");
  const requestTypeFilt = url.searchParams.get("request_type");
  const villaFilter     = url.searchParams.get("villa");
  const limit           = parseLimit(url.searchParams.get("limit"));

  try {
    let query = supabaseAdmin
      .from("whatsapp_leads")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusFilter && isFollowUpStatus(statusFilter)) {
      query = query.eq("follow_up_status", statusFilter);
    }
    if (requestTypeFilt) {
      query = query.eq("request_type", requestTypeFilt);
    }
    if (villaFilter) {
      query = query.eq("villa", villaFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/admin/leads] query error:", error);
      return NextResponse.json(
        { ok: false, error: "server_error" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, leads: (data ?? []) as unknown as WhatsappLeadAdminRow[] },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[api/admin/leads] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
