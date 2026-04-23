import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Addon } from "@/app/api/addons/route";

export const dynamic = "force-dynamic";

// POST — bulk upsert the full add-ons list into the addons table.
// Merges on `id` so rows that already exist are updated in-place.
export async function POST(request: NextRequest) {
  let addons: Addon[];
  try {
    const body = await request.json();
    if (!Array.isArray(body.addons)) {
      return NextResponse.json({ error: "addons must be an array." }, { status: 400 });
    }
    addons = body.addons;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const now  = new Date().toISOString();
  const rows = addons.map(a => ({
    id:            a.id,
    label:         a.label,
    enabled:       a.enabled,
    currency:      a.currency,
    price:         a.price ?? null,
    pricing_model: a.pricing_model,
    updated_at:    now,
  }));

  const { error } = await supabaseAdmin
    .from("addons")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("[api/admin/addons] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
