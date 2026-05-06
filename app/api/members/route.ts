import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { id, full_name, phone, country, address } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }
    if (id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
