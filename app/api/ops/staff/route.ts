import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashAdminPassword } from "@/lib/admin-password";
import { createInviteToken, requireOps, type StaffRole } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/staff]";

/** Owner-only: the team list. */
export async function GET(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, email, full_name, role, is_active, last_login_at, created_at, password_hash, invite_expires_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`${LOG_TAG} list failed:`, error.message);
    return NextResponse.json({ error: "Could not load the team." }, { status: 503 });
  }

  // Never ship hashes to the browser — derive the state the UI actually needs.
  const staff = (data ?? []).map((s) => ({
    id: s.id,
    email: s.email,
    full_name: s.full_name,
    role: s.role,
    is_active: s.is_active,
    last_login_at: s.last_login_at,
    created_at: s.created_at,
    status: s.password_hash ? (s.is_active ? "active" : "disabled") : "invited",
    invite_expires_at: s.password_hash ? null : s.invite_expires_at,
  }));

  return NextResponse.json({ staff, me: auth.staff.id });
}

/** Owner-only: invite someone. */
export async function POST(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let email = "";
  let fullName = "";
  let role: StaffRole = "operator";
  try {
    const body = (await request.json()) as { email?: string; full_name?: string; role?: string };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    if (body.role === "owner" || body.role === "operator") role = body.role;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (fullName.length < 2) {
    return NextResponse.json({ error: "Please give this person a name." }, { status: 400 });
  }

  const invite = createInviteToken();
  const { data, error } = await supabaseAdmin
    .from("staff")
    .insert({
      email,
      full_name: fullName,
      role,
      password_hash: null,
      invite_token_hash: hashAdminPassword(invite.token),
      invite_expires_at: invite.expiresAt,
      created_by: auth.staff.id,
    })
    .select("id, email, full_name, role")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Someone already has that email address." }, { status: 409 });
    }
    console.error(`${LOG_TAG} invite failed:`, error.message);
    return NextResponse.json({ error: "Could not create that person." }, { status: 503 });
  }

  // Returned once, never stored in readable form. The caller mails it.
  return NextResponse.json({ ok: true, staff: data, invite_token: invite.token });
}
