import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET — return all settings rows (never exposes admin_password)
export async function GET(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("key, value");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).filter((row: { key: string }) => row.key !== "admin_password");
  return NextResponse.json({ settings: rows });
}

// POST — upsert a single setting { key, value }
export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const { key, value } = await request.json();

  if (!key) return NextResponse.json({ error: "key is required." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
