import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { attachAdminSessionCookie } from "@/lib/admin-auth";
import { decideAdminLogin } from "@/lib/admin-password";

export const dynamic = "force-dynamic";

function getAdminSecretOrNull(): string | null {
  const s = process.env.ADMIN_SECRET;
  return s?.trim() ? s.trim() : null;
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

  const decision = decideAdminLogin({
    password,
    storedValue: error ? null : (data?.value as string | null | undefined),
    lookupFailed: Boolean(error),
  });

  if (decision.outcome === "unavailable") {
    console.error(
      "[api/admin/verify-password] admin auth unavailable:",
      decision.reason,
      error ?? "",
    );
    return NextResponse.json({ ok: false, error: "admin_auth_unavailable" }, { status: 503 });
  }

  if (decision.outcome === "unauthorized") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  attachAdminSessionCookie(res, adminSecret);
  return res;
}
