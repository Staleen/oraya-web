import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  // Bookings — all rows, newest first
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (bookingsError) {
    console.error("[api/admin/data] bookings error:", bookingsError);
    return NextResponse.json({ error: bookingsError.message }, { status: 500 });
  }

  // Members — service role bypasses RLS, returns all rows
  const { data: members, error: membersError } = await supabaseAdmin
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  if (membersError) {
    console.error("[api/admin/data] members error:", membersError);
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  // Fetch emails from auth.users — listUsers paginates at 50 by default,
  // so we loop pages until exhausted
  const emailMap: Record<string, string> = {};
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (authError) {
      console.error("[api/admin/data] listUsers error:", authError);
      break; // still return members without emails rather than failing entirely
    }

    for (const u of authData.users) {
      emailMap[u.id] = u.email ?? "";
    }

    if (authData.users.length < perPage) break; // last page
    page++;
  }

  const membersWithEmail = (members ?? []).map((m) => ({
    ...m,
    email: emailMap[m.id] ?? "",
  }));

  return NextResponse.json({
    bookings: bookings ?? [],
    members:  membersWithEmail,
  });
}
