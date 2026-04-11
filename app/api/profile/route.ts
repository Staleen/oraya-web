import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function getAuthUser(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// PATCH: update member profile fields
export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { full_name, phone, country, address } = await request.json();

    const { error } = await supabaseAdmin
      .from("members")
      .update({ full_name, phone, country, address })
      .eq("id", user.id);

    if (error) {
      console.error("[api/profile] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/profile] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

// DELETE: permanently delete member account
export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    // Delete from members table first
    const { error: membersError } = await supabaseAdmin
      .from("members")
      .delete()
      .eq("id", user.id);

    if (membersError) {
      console.error("[api/profile] delete members error:", membersError);
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    // Delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (authError) {
      console.error("[api/profile] delete auth error:", authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/profile] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
