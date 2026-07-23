import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remediation 2.4 — shared member→recipient resolution for admin notification
 * paths (was duplicated across the admin booking PATCH and send-feedback
 * routes). Members resolve through auth email + members.full_name; everything
 * else falls back to the booking's guest fields.
 */
export async function resolveBookingRecipient(
  db: SupabaseClient,
  booking: {
    member_id?: string | null;
    guest_email?: string | null;
    guest_name?: string | null;
  },
): Promise<{ email: string | null; name: string }> {
  if (booking.member_id) {
    const { data: { user } } = await db.auth.admin.getUserById(booking.member_id);
    if (user?.email) {
      let memberName = "Member";
      const { data: member } = await db
        .from("members")
        .select("full_name")
        .eq("id", booking.member_id)
        .single();
      if (member?.full_name) memberName = member.full_name;
      return { email: user.email, name: memberName };
    }
  }

  return {
    email: booking.guest_email?.trim() || null,
    name: booking.guest_name || "Guest",
  };
}
