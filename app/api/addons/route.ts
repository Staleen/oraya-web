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

// Shipped defaults — used when no admin overrides are saved yet.
// Prices are intentionally null until set by the admin.
const DEFAULT_ADDONS: Addon[] = [
  { id: "heated_pool",      label: "Heated Pool",      enabled: true, currency: "USD", price: null, pricing_model: "flat_fee"           },
  { id: "breakfast",        label: "Breakfast",        enabled: true, currency: "USD", price: null, pricing_model: "per_person_per_day" },
  { id: "fireplace_diesel", label: "Fireplace Diesel", enabled: true, currency: "USD", price: null, pricing_model: "per_unit"           },
  { id: "extra_bedding",    label: "Extra Bedding",    enabled: true, currency: "USD", price: null, pricing_model: "per_unit"           },
];

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "addons")
    .single();

  if (error || !data?.value) {
    return NextResponse.json({ addons: DEFAULT_ADDONS });
  }

  try {
    const addons = JSON.parse(data.value) as Addon[];
    return NextResponse.json({ addons });
  } catch {
    return NextResponse.json({ addons: DEFAULT_ADDONS });
  }
}
