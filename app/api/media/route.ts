import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Public read endpoint — used by homepage and villa pages
// GET ?villa=mechmech[&limit=1]
export async function GET(request: NextRequest) {
  const villa = request.nextUrl.searchParams.get("villa");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "0") || 0;

  if (!villa) return NextResponse.json({ error: "villa param required" }, { status: 400 });

  let query = supabaseAdmin
    .from("villa_media")
    .select("id, villa, category, file_url, display_order")
    .eq("villa", villa)
    .order("display_order", { ascending: true });

  if (limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}
