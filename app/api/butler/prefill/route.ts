import { NextResponse } from "next/server";
import { verifyPrefillToken } from "@/lib/butler/prefill-token";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function invalidToken() {
  return NextResponse.json(
    { ok: false, error: "invalid_token" },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

function gone(error: "expired_token" | "lead_unavailable") {
  return NextResponse.json(
    { ok: false, error },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}

function serverError() {
  return NextResponse.json(
    { ok: false, error: "server_error" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("h");
  if (!token) return invalidToken();

  let verified: ReturnType<typeof verifyPrefillToken>;
  try {
    verified = verifyPrefillToken(token);
  } catch (error) {
    console.error("[api/butler/prefill] token verification error:", error);
    return serverError();
  }

  if (!verified.ok) {
    return verified.reason === "expired" ? gone("expired_token") : invalidToken();
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_leads")
      .select("villa, normalized_check_in, normalized_check_out, guest_count, name, source")
      .eq("id", verified.payload.lead_id)
      .maybeSingle();

    if (error) {
      console.error("[api/butler/prefill] lead lookup error:", error);
      return serverError();
    }

    if (!data) {
      return gone("lead_unavailable");
    }

    return NextResponse.json(
      {
        villa: data.villa,
        check_in: data.normalized_check_in,
        check_out: data.normalized_check_out,
        sleeping_guests: data.guest_count,
        full_name: data.name,
        source: data.source,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[api/butler/prefill] unexpected error:", error);
    return serverError();
  }
}
