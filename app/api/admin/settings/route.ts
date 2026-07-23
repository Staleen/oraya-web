import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { hashAdminPassword } from "@/lib/admin-password";

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

  // Remediation follow-up (1.1): the admin-password row stores a scrypt hash,
  // never plaintext — hash here so the Settings-page "Update password" button
  // keeps working with the fail-closed verify route (same rules as
  // scripts/hash-admin-password.mjs).
  let storedValue = value;
  if (key === "admin_password") {
    if (typeof value !== "string" || value.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    storedValue = hashAdminPassword(value);
  }

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key, value: storedValue }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
