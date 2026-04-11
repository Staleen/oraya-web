import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, full_name, phone, country, address } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    // Upsert so duplicate calls (e.g. double-submit) don't error
    const { error } = await supabaseAdmin
      .from("members")
      .upsert({ id, full_name, phone, country, address }, { onConflict: "id" });

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
