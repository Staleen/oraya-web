import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBookingEmail } from "@/lib/send-booking-email";
import { sendEventConfirmationEmail } from "@/lib/send-event-confirmation-email";
import { dispatchConfirmedStayWhatsAppNotification } from "@/lib/whatsapp/confirmed-stay-notification";
import { resolveBookingRecipient } from "@/lib/booking-recipient";
import { ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY } from "@/lib/whatsapp/arrival-guide-gate";

/**
 * The ONE copy of "message the guest about a booking status change".
 *
 * Extracted verbatim from app/api/admin/bookings/[id]/route.ts (the confirm /
 * cancel email block and the Phase 16C WhatsApp dispatch block) so that /admin
 * and /ops share it rather than each carrying a copy — two copies of "message
 * the guest" is how guests get double-messaged. The extraction is
 * behaviour-preserving: /admin sends exactly what it sent before.
 *
 * This module DISPATCHES only. Which statuses may be written, by whom, and
 * under what preconditions stays with each caller's route.
 */

/** The booking-row fields the dispatch reads (a subset of the full row). */
export interface GuestDispatchBookingRow {
  villa: string;
  check_in: string;
  check_out: string;
  event_type?: string | null;
  message?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  member_id?: string | null;
  sleeping_guests?: number | null;
  day_visitors?: number | null;
  addons?: unknown;
  addons_snapshot?: unknown;
  pricing_subtotal?: number | string | null;
  pricing_snapshot?: { subtotal?: number | string | null } | null;
  proposal_total_amount?: number | string | null;
  /** Money state — read only by the arrival-guide payment gate. */
  amount_paid?: number | string | null;
  amount_total?: number | string | null;
  deposit_amount?: number | string | null;
}

export type GuestDispatchWhatsAppOutcome = { dispatched: boolean; reason?: string } | null;

export interface GuestDispatchResult {
  /** True when a guest email was actually handed to the sender. */
  emailSent: boolean;
  /** Phase 16C WhatsApp outcome — null when the dispatch was not applicable. */
  whatsapp: GuestDispatchWhatsAppOutcome;
}

/** Same event-inquiry detection the confirmation writers have always used. */
export function isEventInquiryBooking(
  booking: Pick<GuestDispatchBookingRow, "event_type" | "message">,
): boolean {
  return Boolean(
    booking.event_type &&
      typeof booking.message === "string" &&
      booking.message.includes("[Event Inquiry]"),
  );
}

/**
 * Send the guest-facing notifications for a booking that has just been set to
 * `confirmed` or `cancelled`:
 *
 * 1. The status email (event-confirmation email for a confirmed event inquiry,
 *    the booking confirmed/cancelled email otherwise). A failure is logged and
 *    never thrown — email must not block the status change response.
 * 2. For a confirmed STAY only: the fail-closed, at-most-once WhatsApp Arrival
 *    Guide dispatch. Its outcome is returned for response reporting only.
 *
 * `logTag` keeps each caller's log lines identifiable (the admin route passes
 * its historical "[api/admin/bookings]" tag so existing log greps still match).
 */
export async function dispatchBookingStatusGuestMessages(
  db: SupabaseClient,
  bookingId: string,
  status: "confirmed" | "cancelled",
  booking: GuestDispatchBookingRow,
  options?: { logTag?: string },
): Promise<GuestDispatchResult> {
  const logTag = options?.logTag ?? "[booking-guest-dispatch]";
  const isEventInquiry = isEventInquiryBooking(booking);

  let emailSent = false;
  try {
    const { email: recipientEmail, name: recipientName } = await resolveBookingRecipient(db, booking);

    if (!recipientEmail) {
      console.warn(`${logTag} no email address for booking ${bookingId} — skipping notification`);
    } else {
      if (isEventInquiry && status === "confirmed") {
        await sendEventConfirmationEmail({
          to: recipientEmail,
          name: recipientName,
          booking_id: bookingId,
          villa: booking.villa,
          check_in: booking.check_in,
          check_out: booking.check_out,
          event_type: booking.event_type ?? null,
          proposal_total_amount: booking.proposal_total_amount ?? null,
        });
      } else {
        await sendBookingEmail({
          to: recipientEmail,
          name: recipientName,
          status,
          villa: booking.villa,
          check_in: booking.check_in,
          check_out: booking.check_out,
          booking_id: bookingId,
          sleeping_guests: booking.sleeping_guests,
          day_visitors: booking.day_visitors,
          event_type: booking.event_type ?? null,
          message: booking.message ?? null,
          addons: Array.isArray(booking.addons) ? booking.addons : [],
          addons_snapshot: Array.isArray(booking.addons_snapshot) ? booking.addons_snapshot : null,
          pricing_subtotal: booking.pricing_subtotal ?? null,
          pricing_snapshot: booking.pricing_snapshot ?? null,
        });
      }
      emailSent = true;
    }
  } catch (emailErr) {
    console.error(`${logTag} email notification error:`, emailErr);
  }

  // Phase 16C — automatic WhatsApp Arrival Guide dispatch for confirmed STAY
  // bookings only (event inquiries use their own email path and are excluded).
  // Fail-closed and at-most-once inside the helper (env gates, phone/expired
  // skips, atomic whatsapp_confirmation_sent_at claim — a re-confirm does not
  // resend). Never blocks the caller's response or the email above.
  let whatsappOutcome: GuestDispatchWhatsAppOutcome = null;
  if (status === "confirmed" && !isEventInquiry) {
    try {
      // Payment gate (settings.payment_gated_arrival_guide, default off).
      // Read here rather than inside the dispatcher so the dispatcher stays a
      // pure-ish helper with injectable deps for its tests.
      let paymentGateEnabled = false;
      try {
        const { data: gateRow } = await db
          .from("settings")
          .select("value")
          .eq("key", ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY)
          .maybeSingle();
        const raw = (gateRow as { value?: unknown } | null)?.value;
        paymentGateEnabled = String(raw ?? "").trim().toLowerCase() === "true";
      } catch {
        // Unreadable setting means OFF — never hold a guide on a guess.
        paymentGateEnabled = false;
      }

      whatsappOutcome = await dispatchConfirmedStayWhatsAppNotification({
        booking_id: bookingId,
        status: "confirmed",
        villa: booking.villa,
        check_in: booking.check_in,
        check_out: booking.check_out,
        event_type: booking.event_type ?? null,
        message: booking.message ?? null,
        guest_name: booking.guest_name ?? null,
        guest_phone: booking.guest_phone ?? null,
        member_id: booking.member_id ?? null,
        amount_paid: booking.amount_paid == null ? null : Number(booking.amount_paid),
        amount_total: booking.amount_total == null ? null : Number(booking.amount_total),
        deposit_amount: booking.deposit_amount == null ? null : Number(booking.deposit_amount),
      }, { arrivalGuidePaymentGateEnabled: paymentGateEnabled });
    } catch (whatsappErr) {
      console.error(`${logTag} whatsapp dispatch unexpected error:`, whatsappErr);
      whatsappOutcome = { dispatched: false, reason: "unexpected_error" };
    }
  }

  return { emailSent, whatsapp: whatsappOutcome };
}
