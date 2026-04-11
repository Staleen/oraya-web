import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
  }

  // Delete from members table first
  const { error: membersError } = await supabaseAdmin
    .from("members")
    .delete()
    .eq("id", id);

  if (membersError) {
    console.error("[api/admin/members] delete members error:", membersError);
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  // Delete from auth.users (soft-deletes in Supabase — user cannot sign in again)
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (authError) {
    console.error("[api/admin/members] delete auth user error:", authError);
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
