import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { normalizeLeadInput } from "@/lib/butler/leads";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Phase 16A.2.e — WhatsApp / WhatChimp lead ingest endpoint.
 *
 * Accepts a JSON payload from the AI Butler (WhatChimp today; vendor-agnostic
 * by design) describing a guest who reached out over WhatsApp. Inserts one
 * row into `whatsapp_leads` and returns the new `lead_id`. The operator
 * then triages the lead from `/admin/leads`.
 *
 * Strictly out of scope here:
 *   - booking creation (the locked /api/bookings POST stays the authority)
 *   - availability checks (see /api/butler/availability)
 *   - natural-date parsing (see /api/butler/normalize-dates)
 *   - email, token, payment, access-code, smart-lock
 *
 * Auth contract reused from /docs/system/DECISIONS_LOG.md
 * (2026-05-12 Butler architecture freeze):
 *   - 503 if BUTLER_WEBHOOK_SECRET is unset.
 *   - 401 if X-Butler-Secret is missing or invalid.
 *
 * Response contract:
 *   - 200 { ok: true, lead_id, message }       — row inserted
 *   - 400 { ok: false, error: "invalid_request" } — bad JSON or unusable body
 *   - 500 { ok: false, error: "server_error" }    — Supabase failed
 * Raw Supabase / driver errors are logged server-side only, never echoed.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function invalidRequest() {
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

export async function POST(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidRequest();
  }

  const normalized = normalizeLeadInput(raw);
  if (!normalized) return invalidRequest();

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_leads")
      .insert(normalized)
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("[api/butler/lead] insert error:", error);
      return serverError();
    }

    return NextResponse.json(
      {
        ok: true,
        lead_id: data.id,
        message: "Lead received. The Oraya team will review it.",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[api/butler/lead] unexpected error:", error);
    return serverError();
  }
}
