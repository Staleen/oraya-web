import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { VILLA_BASE_PRICING_KEY, parseVillaPricingSetting } from "@/lib/admin-pricing";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", VILLA_BASE_PRICING_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { pricing: parseVillaPricingSetting(data?.value) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
