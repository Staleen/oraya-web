import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { createActionToken } from "@/lib/booking-action-token";
import { SITE_URL } from "@/lib/brand";
import { checkOutExpiryUnix } from "@/lib/checkout-expiry";

/**
 * Ops mirror of the Phase 16C Stage 4A admin arrival-link mint — same rules,
 * same token, same refusals; only the guard differs (an ops session must
 * never pass an /api/admin guard). CONFIRMED bookings only; reuses the signed
 * booking-view "view" token with checkout-day expiry; returns nothing beyond
 * the minted URL. No PINs, access codes, or admin fields — Phase 16D intact.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("id, status, check_out")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[api/ops/bookings/:id/arrival-link] lookup error:", error);
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (data.status !== "confirmed") {
      return NextResponse.json({ ok: false, error: "booking_not_confirmed" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const checkOut = typeof data.check_out === "string" ? data.check_out.trim() : "";
    if (!DATE_RE.test(checkOut)) {
      return NextResponse.json({ ok: false, error: "invalid_check_out" }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const expiresAt = checkOutExpiryUnix(checkOut);
    if (!Number.isFinite(expiresAt)) {
      return NextResponse.json({ ok: false, error: "invalid_check_out" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
    const { token } = createActionToken(data.id, "view", { expiresAt });

    return NextResponse.json(
      { ok: true, arrival_guide_url: `${base}/arrival/${encodeURIComponent(token)}` },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[api/ops/bookings/:id/arrival-link] unexpected error:", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
