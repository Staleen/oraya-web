import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingRequestEmail } from "@/lib/send-booking-request-email";
import { sendBookingPendingEmail } from "@/lib/send-booking-pending-email";
import { createActionToken } from "@/lib/booking-action-token";
import { SITE_URL } from "@/lib/brand";
import { findAvailabilityConflict } from "@/lib/calendar/availability";

const ALLOWED_VILLAS = ["Villa Mechmech", "Villa Byblos"];
const ISO_DATE_RE    = /^\d{4}-\d{2}-\d{2}$/;

// POST — create a new booking (member or guest)
// Uses service role to bypass RLS entirely — avoids anon-client policy issues
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      villa,
      check_in,
      check_out,
      sleeping_guests,
      day_visitors,
      event_type,
      message,
      addons,
      member_id,
      guest_name,
      guest_email,
      guest_phone,
      guest_country,
    } = body;

    if (!villa || !check_in || !check_out) {
      return NextResponse.json({ error: "villa, check_in, and check_out are required." }, { status: 400 });
    }
    if (!ALLOWED_VILLAS.includes(villa)) {
      return NextResponse.json({ error: "Invalid villa selection." }, { status: 400 });
    }
    if (!ISO_DATE_RE.test(check_in) || !ISO_DATE_RE.test(check_out)) {
      return NextResponse.json({ error: "Dates must be in YYYY-MM-DD format." }, { status: 400 });
    }
    if (check_out <= check_in) {
      return NextResponse.json({ error: "check_out must be after check_in." }, { status: 400 });
    }

    try {
      const conflict = await findAvailabilityConflict(villa, check_in, check_out);
      if (conflict) {
        return NextResponse.json(
          { error: `These dates are unavailable — ${villa} is already blocked for ${conflict.check_in} to ${conflict.check_out}. Please choose different dates.` },
          { status: 409 }
        );
      }
    } catch (conflictError) {
      console.error("[api/bookings] conflict check error:", conflictError);
      return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
    }

    if (member_id) {
      const token = request.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user || user.id !== member_id) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }

    if (guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(guest_email))) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      villa,
      check_in,
      check_out,
      sleeping_guests: parseInt(sleeping_guests, 10) || 0,
      day_visitors:    parseInt(day_visitors, 10) || 0,
      event_type:      event_type || null,
      message:         message || null,
      addons:          Array.isArray(addons) ? addons : [],
      status:          "pending",
      member_id:       member_id || null,
      guest_name:      guest_name || null,
      guest_email:     guest_email || null,
      guest_phone:     guest_phone || null,
      guest_country:   guest_country || null,
    };

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[api/bookings] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      const { data: settingsRows, error: settingsErr } = await supabaseAdmin
        .from("settings")
        .select("value")
        .eq("key", "notification_emails")
        .single();

      if (settingsErr) {
        console.error("[api/bookings] notification_emails lookup error:", settingsErr.message);
      }

      const rawEmails = settingsRows?.value ?? "";
      const recipients = rawEmails.split(",").map((e: string) => e.trim()).filter(Boolean);

      console.log(`[api/bookings] notification recipients (${recipients.length}):`, recipients);

      if (recipients.length > 0) {
        let requesterName  = data.guest_name ?? "Guest";
        let requesterEmail = data.guest_email ?? "";
        let requesterPhone = data.guest_phone ?? null;

        if (data.member_id) {
          try {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.member_id);
            requesterEmail = authUser?.user?.email ?? requesterEmail;
            const { data: memberRow } = await supabaseAdmin
              .from("members")
              .select("full_name, phone")
              .eq("id", data.member_id)
              .single();
            if (memberRow) {
              requesterName = memberRow.full_name ?? requesterName;
              requesterPhone = memberRow.phone ?? requesterPhone;
            }
          } catch (memberErr) {
            console.warn("[api/bookings] member lookup error (falling back to guest fields):", memberErr);
          }
        }

        const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
        const adminUrl = base + "/admin";

        const { token: confirmToken, jti: confirmJti, exp: confirmExp } = createActionToken(data.id, "confirmed");
        const { token: cancelToken, jti: cancelJti, exp: cancelExp } = createActionToken(data.id, "cancelled");

        const { error: tokenInsertErr } = await supabaseAdmin.from("booking_action_tokens").insert([
          { jti: confirmJti, booking_id: data.id, action: "confirmed", expires_at: new Date(confirmExp * 1000).toISOString() },
          { jti: cancelJti, booking_id: data.id, action: "cancelled", expires_at: new Date(cancelExp * 1000).toISOString() },
        ]);
        if (tokenInsertErr) {
          console.error("[api/bookings] token row insert failed — action links omitted from email:", tokenInsertErr.message);
        }

        const confirmUrl = tokenInsertErr ? undefined : `${base}/api/booking-action?token=${confirmToken}`;
        const cancelUrl  = tokenInsertErr ? undefined : `${base}/api/booking-action?token=${cancelToken}`;

        await sendBookingRequestEmail({
          recipients,
          booking_id:      data.id,
          requester_name:  requesterName,
          requester_email: requesterEmail,
          requester_phone: requesterPhone,
          villa:           data.villa,
          check_in:        data.check_in,
          check_out:       data.check_out,
          sleeping_guests: data.sleeping_guests,
          day_visitors:    data.day_visitors,
          event_type:      data.event_type ?? null,
          addons:          Array.isArray(data.addons) ? data.addons : [],
          created_at:      data.created_at,
          admin_url:       adminUrl,
          confirm_url:     confirmUrl,
          cancel_url:      cancelUrl,
        });
      }
    } catch (emailErr) {
      console.error("[api/bookings] notification email error:", emailErr);
    }

    // Phase 6: best-effort guest "booking received" email with view link.
    // Independent of admin notification; never blocks the response.
    try {
      let guestEmail: string | null = null;
      let guestName  = data.guest_name ?? "Guest";

      if (data.member_id) {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(data.member_id);
        if (user?.email) guestEmail = user.email;
        const { data: memberRow } = await supabaseAdmin
          .from("members")
          .select("full_name")
          .eq("id", data.member_id)
          .single();
        if (memberRow?.full_name) guestName = memberRow.full_name;
      } else if (data.guest_email) {
        guestEmail = data.guest_email;
      }

      if (guestEmail) {
        await sendBookingPendingEmail({
          to:         guestEmail,
          name:       guestName,
          villa:      data.villa,
          check_in:   data.check_in,
          check_out:  data.check_out,
          booking_id: data.id,
        });
      }
    } catch (pendingEmailErr) {
      console.error("[api/bookings] guest pending email error:", pendingEmailErr);
    }

    return NextResponse.json({ booking: data });
  } catch (err) {
    console.error("[api/bookings] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
