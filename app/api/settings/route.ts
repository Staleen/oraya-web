import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Public read-only endpoint for specific settings keys
// Usage: /api/settings?key=whatsapp_number
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key param required." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error) return NextResponse.json({ value: null });
  return NextResponse.json({ value: data?.value ?? null });
}
