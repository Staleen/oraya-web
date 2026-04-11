import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET — return all settings rows
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("key, value");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? [] });
}

// POST — upsert a single setting { key, value }
export async function POST(request: NextRequest) {
  const { key, value } = await request.json();

  if (!key) return NextResponse.json({ error: "key is required." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
