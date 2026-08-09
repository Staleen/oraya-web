import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashAdminPassword } from "@/lib/admin-password";
import { createInviteToken, requireOps } from "@/lib/ops-auth";

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
  let reinvite = false;
  let resetPassword = false;
  try {
    const body = (await request.json()) as {
      role?: string; is_active?: boolean; reinvite?: boolean; reset_password?: boolean;
    };
    if (body.role === "owner" || body.role === "operator") role = body.role;
    if (typeof body.is_active === "boolean") isActive = body.is_active;
    reinvite = body.reinvite === true;
    resetPassword = body.reset_password === true;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Password reset: the person is locked out, so their password is cleared and
  // a fresh one-time link is issued. Clearing password_hash is what makes this
  // safe rather than merely convenient — `requireOps` refuses any session
  // whose row has no password, so an existing 12-hour session dies at the next
  // request instead of outliving the reset.
  //
  // Resetting yourself is refused: the link is shown once, and an owner who
  // loses it would have locked themselves out of their own console. Changing
  // your own password is the supported path, and forgetting it is what the
  // recovery email is for.
  if (resetPassword) {
    if (id === auth.staff.id) {
      return NextResponse.json(
        {
          error: "You can't reset your own password here — use Change password. If you're locked out, use the recovery link on the sign-in page.",
          code: "self_reset",
        },
        { status: 409 },
      );
    }

    const invite = createInviteToken();
    const { data, error } = await supabaseAdmin
      .from("staff")
      .update({
        password_hash: null,
        invite_token_hash: hashAdminPassword(invite.token),
        invite_expires_at: invite.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, email, full_name, role")
      .maybeSingle();

    if (error) {
      console.error(`${LOG_TAG} password reset failed:`, error.message);
      return NextResponse.json({ error: "Could not reset that password." }, { status: 503 });
    }
    if (!data) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });

    console.log(`${LOG_TAG} password reset for ${id} by ${auth.staff.id}`);
    // Returned once, never stored in readable form — the owner passes it on.
    return NextResponse.json({ ok: true, staff: data, invite_token: invite.token });
  }

  // Re-invite: a fresh one-time link for someone who never set a password
  // (lost or expired link). The old link stops working immediately; the write
  // is guarded on password_hash IS NULL so an activated account can never be
  // silently reset back to an invite.
  if (reinvite) {
    const invite = createInviteToken();
    const { data, error } = await supabaseAdmin
      .from("staff")
      .update({
        invite_token_hash: hashAdminPassword(invite.token),
        invite_expires_at: invite.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("password_hash", null)
      .select("id, email, full_name, role")
      .maybeSingle();

    if (error) {
      console.error(`${LOG_TAG} reinvite failed:`, error.message);
      return NextResponse.json({ error: "Could not create a new invite link." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "This person already set their password — there is nothing to re-invite." },
        { status: 409 },
      );
    }
    // Returned once, never stored in readable form — the owner sends it.
    return NextResponse.json({ ok: true, staff: data, invite_token: invite.token });
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
