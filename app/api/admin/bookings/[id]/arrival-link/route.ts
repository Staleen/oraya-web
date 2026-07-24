import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createActionToken } from "@/lib/booking-action-token";
import { SITE_URL } from "@/lib/brand";
import { checkOutExpiryUnix } from "@/lib/checkout-expiry";

/**
 * Phase 16C Stage 4A — admin "Copy Arrival Guide link" support.
 *
 * GET /api/admin/bookings/[id]/arrival-link
 *   Mints the personalized Arrival Guide URL for a CONFIRMED booking so the
 *   operator can paste it to the guest manually (WhatsApp). Reuses the
 *   existing signed booking-view "view" token with checkout-day expiry —
 *   exactly the token/expiry the confirmed booking email already mints
 *   (lib/send-booking-email.ts). No new token type; villa is resolved from
 *   the booking row by /arrival/[token] itself, never from the URL.
 *
 *   Returns:
 *     200 { ok: true, arrival_guide_url }
 *     400 { ok: false, error: "invalid_request" }        — bad uuid
 *     400 { ok: false, error: "invalid_check_out" }      — missing/invalid check_out; no link minted
 *     403 { ok: false, error: "booking_not_confirmed" }  — pending/cancelled; no link minted
 *     404 { ok: false, error: "not_found" }
 *     401 / 503 from requireAdminAuth on auth/env failure
 *     500 { ok: false, error: "server_error" }
 *
 *   Never returns PINs, access codes, admin notes, payment links, or any
 *   booking field beyond the minted URL. Access-code delivery stays Phase 16D.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same checkout-day expiry every transactional view-token mint uses
// (see lib/send-booking-email.ts / app/api/bookings POST).

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const id = params?.id?.trim() ?? "";
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("id, status, check_out")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[api/admin/bookings/:id/arrival-link] lookup error:", error);
      return NextResponse.json(
        { ok: false, error: "server_error" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    if (data.status !== "confirmed") {
      return NextResponse.json(
        { ok: false, error: "booking_not_confirmed" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const checkOut = typeof data.check_out === "string" ? data.check_out.trim() : "";
    if (!DATE_RE.test(checkOut)) {
      return NextResponse.json(
        { ok: false, error: "invalid_check_out" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const expiresAt = checkOutExpiryUnix(checkOut);
    if (!Number.isFinite(expiresAt)) {
      return NextResponse.json(
        { ok: false, error: "invalid_check_out" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
    const { token } = createActionToken(data.id, "view", { expiresAt });

    return NextResponse.json(
      { ok: true, arrival_guide_url: `${base}/arrival/${encodeURIComponent(token)}` },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    // createActionToken throws when BOOKING_ACTION_SECRET is unset — collapse
    // to a safe server_error without echoing internals.
    console.error("[api/admin/bookings/:id/arrival-link] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
