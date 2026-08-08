import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/members/[id]]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit M-6: the legacy admin API had DELETE only, so correcting a member's
 * phone number required hand-written SQL. This adds the edit — name and phone
 * only; email/identity stays with Supabase auth and is not editable here.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
    const value = typeof body.full_name === "string" ? body.full_name.trim() : "";
    if (!value) return NextResponse.json({ error: "A member needs a name." }, { status: 400 });
    patch.full_name = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const value = typeof body.phone === "string" ? body.phone.trim() : "";
    patch.phone = value || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("members")
    .update(patch)
    .eq("id", id)
    .select("id, full_name, phone")
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} update failed:`, error.message);
    return NextResponse.json({ error: "That change didn't save." }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "That member no longer exists." }, { status: 404 });

  return NextResponse.json({ ok: true, member: data });
}

/**
 * Delete a member. Auth account FIRST (the G8 ordering): a partial failure can
 * then only leave a visible row whose sign-in is already revoked — never a
 * deleted row whose account can still sign in. Their bookings survive,
 * detached, which the UI states before the click.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    // "not found" is fine — a retry after a partial failure must be able to finish.
    if (authError && !/not.?found/i.test(authError.message)) {
      console.error(`${LOG_TAG} auth delete failed:`, authError.message);
      return NextResponse.json(
        { error: "Their sign-in could not be revoked, so nothing was deleted. Try again." },
        { status: 503 },
      );
    }
  } catch (err) {
    console.error(`${LOG_TAG} auth delete threw:`, err);
    return NextResponse.json({ error: "Their sign-in could not be revoked. Try again." }, { status: 503 });
  }

  const { error } = await supabaseAdmin.from("members").delete().eq("id", id);
  if (error) {
    console.error(`${LOG_TAG} row delete failed:`, error.message);
    return NextResponse.json(
      {
        error: "Their sign-in is revoked, but the member row is still here. Try again to finish removing them.",
        code: "partial",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
