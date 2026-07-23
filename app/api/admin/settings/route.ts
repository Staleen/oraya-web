import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { ADMIN_RECOVERY_JTI_SETTINGS_KEY } from "@/lib/admin-recovery";

export const dynamic = "force-dynamic";

/** Auth-sensitive rows: never exposed by GET, never writable via generic POST. */
const PROTECTED_KEYS = new Set(["admin_password", ADMIN_RECOVERY_JTI_SETTINGS_KEY]);

// GET — return all settings rows (never exposes auth-sensitive keys)
export async function GET(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("key, value");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).filter((row: { key: string }) => !PROTECTED_KEYS.has(row.key));
  return NextResponse.json({ settings: rows });
}

// POST — upsert a single setting { key, value }
export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const { key, value } = await request.json();

  if (!key) return NextResponse.json({ error: "key is required." }, { status: 400 });

  // Remediation 2 (A.1/A.2): auth-sensitive rows can only change through
  // their dedicated endpoints (change-password with current-password check;
  // the recovery jti is server-managed). The generic upsert refuses them so
  // those checks cannot be bypassed.
  if (PROTECTED_KEYS.has(key)) {
    return NextResponse.json(
      { error: "This setting can only be changed through its dedicated flow." },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
