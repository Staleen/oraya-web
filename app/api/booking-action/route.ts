import { NextRequest, NextResponse } from "next/server";
import { verifyActionToken } from "@/lib/booking-action-token";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingEmail } from "@/lib/send-booking-email";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toResult(request: NextRequest, state: string) {
  return NextResponse.redirect(new URL(`/booking-action/result?state=${state}`, request.url));
}

// ── GET — safe redirect only, zero mutations ──────────────────────────────────
// Email scanners and link-preview bots follow GET links automatically.
// This handler never touches the DB — it only redirects to the human confirm page.

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return toResult(request, "invalid");
  return NextResponse.redirect(
    new URL(`/booking-action/confirm?token=${encodeURIComponent(token)}`, request.url)
  );
}

// ── POST — mutation, only reachable via explicit human form submit ─────────────

export async function POST(request: NextRequest) {
  // Token arrives from the hidden form field in /booking-action/confirm
  const formData = await request.formData();
  const token    = formData.get("token");
  if (typeof token !== "string" || !token) return toResult(request, "invalid");

  // ── Step 1: Crypto verify (signature + expiry) ────────────────────────────
  const result = verifyActionToken(token);
  if (!result.ok) return toResult(request, result.reason);

  const { booking_id, action, jti } = result;

  // ── Step 2: DB token row check (row must exist, not yet consumed, payload match)
  const { data: tokenRow } = await supabaseAdmin
    .from("booking_action_tokens")
    .select("used_at, booking_id, action")
    .eq("jti", jti)
    .single();

  if (!tokenRow)                                                        return toResult(request, "invalid");
  if (tokenRow.used_at)                                                 return toResult(request, "already_processed");
  if (tokenRow.booking_id !== booking_id || tokenRow.action !== action) return toResult(request, "invalid");

  // ── Step 3: Fetch booking ─────────────────────────────────────────────────
  const { data: booking, error: fetchErr } = await supabaseAdmin
    .from("bookings")
    .select("villa, check_in, check_out, status, member_id, guest_name, guest_email")
    .eq("id", booking_id)
    .single();

  if (fetchErr || !booking) return toResult(request, "invalid");

  // Guard: only act on pending bookings
  if (booking.status !== "pending") return toResult(request, "already_processed");

  // ── Step 4: Overlap check (confirm only) — reuses same logic as admin PATCH ─
  if (action === "confirmed") {
    const { data: conflicts, error: conflictErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("villa", booking.villa)
      .eq("status", "confirmed")
      .neq("id", booking_id)
      .lt("check_in", booking.check_out)
      .gt("check_out", booking.check_in);

    if (conflictErr) {
      console.error("[api/booking-action] conflict check error:", conflictErr);
      return toResult(request, "invalid");
    }
    if (conflicts && conflicts.length > 0) return toResult(request, "overlap_conflict");
  }

  // ── Step 5: Update booking status (.eq("status","pending") = DB-level guard) ─
  const { error: updateErr } = await supabaseAdmin
    .from("bookings")
    .update({ status: action })
    .eq("id", booking_id)
    .eq("status", "pending");

  if (updateErr) {
    console.error("[api/booking-action] update error:", updateErr);
    return toResult(request, "invalid");
  }

  // ── Step 6: Race-safe single-use enforcement ──────────────────────────────
  // Guarded update: only succeeds if used_at is still null.
  // If two concurrent requests both pass Step 2, exactly one wins here.
  const { data: marked } = await supabaseAdmin
    .from("booking_action_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("jti", jti)
    .is("used_at", null)
    .select("jti");

  if (!marked || marked.length === 0) {
    // Another request already consumed this token — treat as replay
    return toResult(request, "already_processed");
  }

  // ── Step 7: Send guest notification email ────────────────────────────────
  let emailFailed = false;
  try {
    let recipientEmail: string | null = null;
    let recipientName:  string        = "Guest";

    if (booking.member_id) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(booking.member_id);
      if (user?.email) {
        recipientEmail = user.email;
        const { data: member } = await supabaseAdmin
          .from("members")
          .select("full_name")
          .eq("id", booking.member_id)
          .single();
        if (member?.full_name) recipientName = member.full_name;
      }
    } else if (booking.guest_email) {
      recipientEmail = booking.guest_email;
      if (booking.guest_name) recipientName = booking.guest_name;
    }

    if (recipientEmail) {
      await sendBookingEmail({
        to:         recipientEmail,
        name:       recipientName,
        status:     action,
        villa:      booking.villa,
        check_in:   booking.check_in,
        check_out:  booking.check_out,
        booking_id,
      });
    } else {
      console.warn(`[api/booking-action] no email for booking ${booking_id} — skipping guest notification`);
    }
  } catch (emailErr) {
    console.error("[api/booking-action] guest email error:", emailErr);
    emailFailed = true;
  }

  const resultPath = emailFailed
    ? `/booking-action/result?state=${action}&email=failed`
    : `/booking-action/result?state=${action}`;
  return NextResponse.redirect(new URL(resultPath, request.url));
}
