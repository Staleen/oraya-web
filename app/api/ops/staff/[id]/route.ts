import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/staff/[id]]";

async function countOtherActiveOwners(excludeId: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("is_active", true)
    .neq("id", excludeId);
  if (error) {
    console.error(`${LOG_TAG} owner count failed:`, error.message);
    return null;
  }
  return count ?? 0;
}

/** Owner-only: change someone's role, or enable/disable them. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let role: "owner" | "operator" | undefined;
  let isActive: boolean | undefined;
  try {
    const body = (await request.json()) as { role?: string; is_active?: boolean };
    if (body.role === "owner" || body.role === "operator") role = body.role;
    if (typeof body.is_active === "boolean") isActive = body.is_active;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (role === undefined && isActive === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // Locking yourself out is not a recoverable mistake from inside the UI, so
  // it is refused rather than confirmed.
  const losingOwner = (role === "operator" || isActive === false);
  if (losingOwner) {
    const others = await countOtherActiveOwners(id);
    if (others === null) {
      return NextResponse.json({ error: "Could not verify this is safe. Try again." }, { status: 503 });
    }
    if (others === 0) {
      return NextResponse.json(
        { error: "This is the only owner left. Make someone else an owner first.", code: "last_owner" },
        { status: 409 },
      );
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (role !== undefined) patch.role = role;
  if (isActive !== undefined) patch.is_active = isActive;

  const { data, error } = await supabaseAdmin
    .from("staff")
    .update(patch)
    .eq("id", id)
    .select("id, email, full_name, role, is_active")
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} update failed:`, error.message);
    return NextResponse.json({ error: "Could not save that change." }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });

  return NextResponse.json({ ok: true, staff: data });
}

/** Owner-only: remove someone entirely. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const others = await countOtherActiveOwners(id);
  if (others === null) {
    return NextResponse.json({ error: "Could not verify this is safe. Try again." }, { status: 503 });
  }
  const { data: target, error: readError } = await supabaseAdmin
    .from("staff").select("role").eq("id", id).maybeSingle();
  if (readError) {
    console.error(`${LOG_TAG} pre-delete read failed:`, readError.message);
    return NextResponse.json({ error: "Could not remove that person." }, { status: 503 });
  }
  if (!target) return NextResponse.json({ ok: true, already_gone: true });
  if (target.role === "owner" && others === 0) {
    return NextResponse.json(
      { error: "This is the only owner left. Make someone else an owner first.", code: "last_owner" },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin.from("staff").delete().eq("id", id);
  if (error) {
    console.error(`${LOG_TAG} delete failed:`, error.message);
    return NextResponse.json({ error: "Could not remove that person." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
