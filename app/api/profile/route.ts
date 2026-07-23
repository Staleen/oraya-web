import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function getAuthUser(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * Remediation 2.4 — trimmed, length-capped string or null; rejects other types
 * (same discipline as lib/butler/leads.ts sanitizers).
 */
function sanitizeProfileField(value: unknown, maxLen: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

// PATCH: update member profile fields
export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, string | null> = {};
    const fields: Array<[key: string, maxLen: number]> = [
      ["full_name", 200],
      ["phone", 40],
      ["country", 100],
      ["address", 500],
    ];
    for (const [key, maxLen] of fields) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const sanitized = sanitizeProfileField(body[key], maxLen);
      if (sanitized === undefined && body[key] !== undefined) {
        return NextResponse.json({ error: `Invalid ${key} value.` }, { status: 400 });
      }
      if (sanitized !== undefined) updates[key] = sanitized;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No profile fields provided." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("members")
      .update(updates)
      .eq("id", user.id);

    if (error) {
      console.error("[api/profile] update error:", error);
      return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
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
      return NextResponse.json({ error: "Could not delete your account." }, { status: 500 });
    }

    // Delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (authError) {
      console.error("[api/profile] delete auth error:", authError);
      return NextResponse.json({ error: "Could not delete your account." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/profile] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
