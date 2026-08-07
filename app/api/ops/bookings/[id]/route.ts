import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { roundMoney } from "@/lib/money";
import {
  dispatchBookingStatusGuestMessages,
  isEventInquiryBooking,
  type GuestDispatchBookingRow,
} from "@/lib/booking-guest-dispatch";
import { findAvailabilityConflict } from "@/lib/calendar/availability";
import { isExclusionViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/bookings/[id]]";

const RETURN_COLUMNS =
  "id, status, amount_total, amount_paid, amount_due, payment_status, payment_method, payment_reference, payment_received_at, payment_marked_by, payment_notes, refund_status, refund_amount, refunded_at, refund_provider_reference";

/** Everything the shared guest dispatch reads, plus the lifecycle fields. */
const DISPATCH_COLUMNS =
  "id, status, villa, check_in, check_out, event_type, message, guest_name, guest_email, guest_phone, member_id, sleeping_guests, day_visitors, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, proposal_total_amount";

function nonNegative(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

/**
 * Money actions for /ops.
 *
 * Both actions are guarded against the concurrent-overwrite bug (audit B-13):
 * the client sends the value it was shown, and the update only applies if the
 * database still holds it. With one shared login that race was theoretical;
 * with an operator and an owner both working, it is not. A losing write gets a
 * 409 and the operator is told to look again, rather than silently erasing the
 * other person's entry.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const who = auth.staff.full_name;
  const now = new Date().toISOString();

  if (action === "record_payment") {
    const amount = nonNegative(body.amount);
    const expected = nonNegative(body.expected_amount_paid ?? 0);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const method = typeof body.method === "string" ? body.method.trim() : "";

    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: "Enter how much came in." }, { status: 400 });
    }
    if (expected === null) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!reference) {
      return NextResponse.json({ error: "A bank or receipt reference is required." }, { status: 400 });
    }

    const next = roundMoney(expected + amount);
    let q = supabaseAdmin
      .from("bookings")
      .update({
        amount_paid: next,
        payment_method: method || undefined,
        payment_reference: reference,
        payment_received_at: now,
        // Live-verified 2026-08-07: payment_marked_by is a uuid column — writing
        // the person's NAME made every /ops payment recording fail with 503.
        // The id is the attribution; the response carries the name for display.
        payment_marked_by: auth.staff.id,
      })
      .eq("id", id);
    // PostgREST does not match NULL with .eq, so a first payment against a
    // null column has to be matched explicitly.
    q = expected === 0 ? q.or("amount_paid.is.null,amount_paid.eq.0") : q.eq("amount_paid", expected);

    const { data, error } = await q.select(RETURN_COLUMNS).maybeSingle();
    if (error) {
      console.error(`${LOG_TAG} record_payment failed:`, error.message);
      return NextResponse.json({ error: "Could not record that payment." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        {
          error: "Someone else changed this booking's payments while you were typing. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, booking: data, recorded_by: who });
  }

  if (action === "record_refund") {
    const amount = nonNegative(body.amount);
    const expected = nonNegative(body.expected_refund_amount ?? 0);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: "Enter how much you returned." }, { status: 400 });
    }
    if (expected === null) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!reference) {
      return NextResponse.json({ error: "A bank reference is required." }, { status: 400 });
    }

    const next = roundMoney(expected + amount);
    let q = supabaseAdmin
      .from("bookings")
      .update({
        refund_amount: next,
        refund_status: "refunded",
        refunded_at: now,
        refund_provider_reference: reference,
        // uuid column — see record_payment above.
        payment_marked_by: auth.staff.id,
      })
      .eq("id", id);
    q = expected === 0 ? q.or("refund_amount.is.null,refund_amount.eq.0") : q.eq("refund_amount", expected);

    const { data, error } = await q.select(RETURN_COLUMNS).maybeSingle();
    if (error) {
      console.error(`${LOG_TAG} record_refund failed:`, error.message);
      return NextResponse.json({ error: "Could not record that refund." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        {
          error: "Someone else recorded a refund on this booking while you were typing. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, booking: data, recorded_by: who });
  }

  // ── Approve / decline ──────────────────────────────────────────────────────
  //
  // Both write the SAME status values the legacy admin writes, and both hand
  // guest messaging to lib/booking-guest-dispatch.ts — the one shared copy —
  // so a guest approved from /ops receives exactly what /admin sends.
  //
  // Both are also raced-guarded the same way as the money actions: the update
  // only applies while the booking still holds the status the operator was
  // LOOKING AT when they pressed the button, else 409.

  if (action === "approve" || action === "decline") {
    const { data: booking, error: loadError } = await supabaseAdmin
      .from("bookings")
      .select(DISPATCH_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (loadError) {
      console.error(`${LOG_TAG} ${action} load failed:`, loadError.message);
      return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
    }
    if (!booking) {
      return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
    }

    const bookingRow = booking as unknown as {
      status: string | null;
      villa: string;
      check_in: string;
      check_out: string;
      event_type: string | null;
      message: string | null;
    };
    const currentStatus = (bookingRow.status ?? "").trim().toLowerCase();

    // Event inquiries are approved through their proposal flow, which lives in
    // the legacy admin until the /ops event screens exist. Refused by the API,
    // not merely hidden (design rule: absent, not disabled-with-a-warning).
    if (isEventInquiryBooking(bookingRow)) {
      return NextResponse.json(
        { error: "Event enquiries are handled through their proposal in the legacy admin for now." },
        { status: 400 },
      );
    }

    if (action === "approve") {
      if (currentStatus !== "pending") {
        return NextResponse.json(
          {
            error:
              currentStatus === "confirmed"
                ? "This stay is already approved."
                : "This booking is no longer awaiting approval. Open it again to see where it stands.",
            code: "changed_elsewhere",
          },
          { status: 409 },
        );
      }

      // Same pre-write availability check the legacy admin confirm runs.
      try {
        const conflict = await findAvailabilityConflict(
          bookingRow.villa,
          bookingRow.check_in,
          bookingRow.check_out,
          id,
          false,
        );
        if (conflict) {
          return NextResponse.json(
            {
              error: `Cannot approve — ${bookingRow.villa} already has a blocked stay from ${conflict.check_in} to ${conflict.check_out} that overlaps these dates.`,
            },
            { status: 409 },
          );
        }
      } catch (conflictErr) {
        console.error(`${LOG_TAG} approve conflict check error:`, conflictErr);
        return NextResponse.json(
          { error: "Could not verify availability. Please try again." },
          { status: 500 },
        );
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", id)
        .eq("status", "pending")
        .select(DISPATCH_COLUMNS)
        .maybeSingle();

      if (updateError) {
        // Losing the race against the DB overlap constraint keeps the booking
        // pending — same outcome as the legacy admin confirm.
        if (isExclusionViolation(updateError)) {
          return NextResponse.json(
            {
              error: `Cannot approve — ${bookingRow.villa} already has a confirmed stay overlapping these dates. The booking remains pending.`,
            },
            { status: 409 },
          );
        }
        console.error(`${LOG_TAG} approve update failed:`, updateError.message);
        return NextResponse.json({ error: "Could not approve this stay." }, { status: 503 });
      }
      if (!updated) {
        return NextResponse.json(
          {
            error: "Someone else changed this booking while you were looking at it. Open it again to see where it stands.",
            code: "changed_elsewhere",
          },
          { status: 409 },
        );
      }

      const dispatch = await dispatchBookingStatusGuestMessages(
        supabaseAdmin,
        id,
        "confirmed",
        updated as unknown as GuestDispatchBookingRow,
        { logTag: LOG_TAG },
      );

      return NextResponse.json({
        ok: true,
        booking: updated,
        email_sent: dispatch.emailSent,
        whatsapp: dispatch.whatsapp,
        acted_by: who,
      });
    }

    // decline — pending → cancelled, or cancelling an already-confirmed stay.
    const expectedStatus =
      typeof body.expected_status === "string" ? body.expected_status.trim().toLowerCase() : "";
    if (expectedStatus !== "pending" && expectedStatus !== "confirmed") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (currentStatus !== expectedStatus) {
      return NextResponse.json(
        {
          error:
            currentStatus === "cancelled"
              ? "This booking is already cancelled."
              : "This booking changed while you were looking at it. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", expectedStatus)
      .select(DISPATCH_COLUMNS)
      .maybeSingle();

    if (updateError) {
      console.error(`${LOG_TAG} decline update failed:`, updateError.message);
      return NextResponse.json({ error: "Could not cancel this booking." }, { status: 503 });
    }
    if (!updated) {
      return NextResponse.json(
        {
          error: "Someone else changed this booking while you were looking at it. Open it again to see where it stands.",
          code: "changed_elsewhere",
        },
        { status: 409 },
      );
    }

    const dispatch = await dispatchBookingStatusGuestMessages(
      supabaseAdmin,
      id,
      "cancelled",
      updated as unknown as GuestDispatchBookingRow,
      { logTag: LOG_TAG },
    );

    return NextResponse.json({
      ok: true,
      booking: updated,
      email_sent: dispatch.emailSent,
      whatsapp: dispatch.whatsapp,
      acted_by: who,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
