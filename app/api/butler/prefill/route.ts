import { NextResponse } from "next/server";
import { verifyPrefillToken } from "@/lib/butler/prefill-token";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type LeadPrefillRow = {
  villa: string | null;
  normalized_check_in: string | null;
  normalized_check_out: string | null;
  guest_count: string | null;
  name: string | null;
  source: string | null;
};

function invalidToken() {
  return NextResponse.json(
    { ok: false, error: "invalid_token" },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

function expiredToken() {
  return NextResponse.json(
    { ok: false, error: "prefill_unavailable" },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}

function serverError() {
  return NextResponse.json(
    { ok: false, error: "server_error" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

function sanitizeDateRange(
  checkIn: string | null,
  checkOut: string | null,
): { check_in: string | null; check_out: string | null } {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return { check_in: null, check_out: null };
  }
  if (checkOut <= checkIn) {
    return { check_in: null, check_out: null };
  }
  return { check_in: checkIn, check_out: checkOut };
}

function sanitizeSleepingGuests(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("h");
  if (!token) return invalidToken();

  const verification = verifyPrefillToken(token);
  if (!verification.ok) {
    return verification.reason === "expired" ? expiredToken() : invalidToken();
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_leads")
      .select("villa, normalized_check_in, normalized_check_out, guest_count, name, source")
      .eq("id", verification.claims.lead_id)
      .maybeSingle<LeadPrefillRow>();

    if (error) {
      console.error("[api/butler/prefill] lead lookup error:", error);
      return serverError();
    }

    if (!data) {
      return expiredToken();
    }

    const dates = sanitizeDateRange(data.normalized_check_in, data.normalized_check_out);

    return NextResponse.json(
      {
        ok: true,
        prefill: {
          villa: data.villa ?? null,
          check_in: dates.check_in,
          check_out: dates.check_out,
          sleeping_guests: sanitizeSleepingGuests(data.guest_count),
          full_name: data.name ?? null,
          source: data.source ?? null,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[api/butler/prefill] unexpected error:", error);
    return serverError();
  }
}
