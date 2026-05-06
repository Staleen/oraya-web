import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, full_name, phone, country, address } = body;

    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    if (authData.user.id !== id) {
      return NextResponse.json({ error: "Cannot update another member profile." }, { status: 403 });
    }

    // Insert only — ignore if row already exists so login calls don't overwrite good data
    const { error } = await supabaseAdmin
      .from("members")
      .upsert({ id, full_name, phone, country, address }, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      console.error("[api/members] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/members] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
