import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";

export interface Addon {
  id:            string;
  label:         string;
  enabled:       boolean;
  currency:      string;
  price:         number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
}

// Single source of truth: the `addons` table.
// No fallback defaults — if the table is empty the response is an empty array.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("addons")
    .select("id, label, enabled, currency, price, pricing_model")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/addons] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { addons: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
