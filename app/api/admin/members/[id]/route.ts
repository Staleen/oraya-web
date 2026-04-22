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

  console.log(`[api/admin/members] deleting member id=${id}`);

  // 1. Null-out member_id on any bookings so they become guest bookings
  //    (avoids FK constraint errors if bookings references auth.users)
  const { error: bookingsUpdateError } = await supabaseAdmin
    .from("bookings")
    .update({ member_id: null })
    .eq("member_id", id);

  if (bookingsUpdateError) {
    console.error("[api/admin/members] bookings update error:", JSON.stringify(bookingsUpdateError));
    // Non-fatal — continue with deletion
  }

  // 2. Delete from members table
  const { error: membersError } = await supabaseAdmin
    .from("members")
    .delete()
    .eq("id", id);

  if (membersError) {
    console.error("[api/admin/members] members table delete error:", JSON.stringify(membersError));
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  // 3. Delete from auth.users — ignore "user not found" errors
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (authError) {
    const msg = authError.message?.toLowerCase() ?? "";
    const notFound =
      msg.includes("not found") ||
      msg.includes("does not exist") ||
      msg.includes("user not found");

    if (notFound) {
      console.warn(`[api/admin/members] auth user id=${id} not found — treating as deleted`);
    } else {
      console.error("[api/admin/members] auth deleteUser error:", JSON.stringify(authError));
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  console.log(`[api/admin/members] successfully deleted member id=${id}`);
  return NextResponse.json({ ok: true });
}
