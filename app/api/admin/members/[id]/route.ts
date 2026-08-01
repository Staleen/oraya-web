import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
  }

  console.log(`[api/admin/members] deleting member id=${id}`);

  // Audit M-1 — ordering matters: the auth account is deleted FIRST. The old
  // order (member row first) could fail after the row was gone, leaving an
  // account that could still sign in while being invisible in the admin.
  // With auth-first, the only possible partial state is "row still visible,
  // account already removed", which is fail-visible and completes on retry
  // (a retry's auth delete hits not-found and is treated as already done).

  // 1. Delete from auth.users — "user not found" is treated as already deleted
  //    so retries after a partial failure can complete the sequence.
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
      return NextResponse.json(
        { error: "Nothing was deleted: the sign-in account could not be removed. The member is unchanged — retry the delete." },
        { status: 500 },
      );
    }
  }

  // 2. Null-out member_id on any bookings so they become guest bookings
  //    (avoids FK constraint errors if bookings references auth.users)
  const { error: bookingsUpdateError } = await supabaseAdmin
    .from("bookings")
    .update({ member_id: null })
    .eq("member_id", id);

  if (bookingsUpdateError) {
    console.error("[api/admin/members] bookings update error:", JSON.stringify(bookingsUpdateError));
    // Non-fatal — continue with deletion
  }

  // 3. Delete from members table
  const { error: membersError } = await supabaseAdmin
    .from("members")
    .delete()
    .eq("id", id);

  if (membersError) {
    console.error("[api/admin/members] members table delete error:", JSON.stringify(membersError));
    return NextResponse.json(
      {
        error:
          "Partial delete: the sign-in account was removed, but the member record could not be deleted and is still listed. Retry the delete to remove the remaining record.",
      },
      { status: 500 },
    );
  }

  console.log(`[api/admin/members] successfully deleted member id=${id}`);
  return NextResponse.json({ ok: true });
}
