import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  // Bookings — all rows, newest first
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (bookingsError) {
    return NextResponse.json({ error: bookingsError.message }, { status: 500 });
  }

  // Members — join members table with auth.users for email
  const { data: members, error: membersError } = await supabaseAdmin
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  // Fetch emails from auth.users via admin API
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  if (!authError && authData) {
    for (const u of authData.users) {
      emailMap[u.id] = u.email ?? "";
    }
  }

  const membersWithEmail = (members ?? []).map((m) => ({
    ...m,
    email: emailMap[m.id] ?? "",
  }));

  return NextResponse.json({
    bookings: bookings ?? [],
    members: membersWithEmail,
  });
}
