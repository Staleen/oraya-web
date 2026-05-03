import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { attachAdminSessionCookie } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function getAdminSecretOrNull(): string | null {
  const s = process.env.ADMIN_SECRET;
  return s?.trim() ? s.trim() : null;
}

/** Compare UTF-8 strings in near-constant time (length still observable). */
function timingSafePasswordMatch(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const adminSecret = getAdminSecretOrNull();
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_SECRET is not set." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "admin_password")
    .maybeSingle();

  if (error) {
    console.error("[api/admin/verify-password] settings error:", error);
    return NextResponse.json({ ok: false, error: "Could not verify password." }, { status: 500 });
  }

  const stored = data?.value ?? "Oraya2026";
  if (!timingSafePasswordMatch(password, stored)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  attachAdminSessionCookie(res, adminSecret);
  return res;
}
