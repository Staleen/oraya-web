import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Force dynamic so Next.js never caches this route
export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[api/admin/data] GET called");
  // Bookings — all rows, newest first
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (bookingsError) {
    console.error("[api/admin/data] bookings error:", JSON.stringify(bookingsError));
    return NextResponse.json({ error: bookingsError.message }, { status: 500 });
  }
  console.log(`[api/admin/data] bookings fetched: ${bookings?.length ?? 0} rows`);

  // Members — service role bypasses RLS, returns all rows
  const { data: members, error: membersError } = await supabaseAdmin
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  if (membersError) {
    console.error("[api/admin/data] members error:", JSON.stringify(membersError));
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }
  console.log(`[api/admin/data] members fetched: ${members?.length ?? 0} rows`);

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

  console.log(`[api/admin/data] returning ${bookings?.length ?? 0} bookings, ${membersWithEmail.length} members`);
  return NextResponse.json({
    bookings: bookings ?? [],
    members:  membersWithEmail,
  });
}
