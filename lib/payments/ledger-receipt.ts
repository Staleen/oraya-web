import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveBookingRecipient } from "@/lib/booking-recipient";
import { isEventInquiryBooking } from "@/lib/booking-guest-dispatch";
import { sendBookingPaymentReceivedEmail } from "@/lib/send-booking-payment-email";

const COLUMNS = "id, villa, check_in, check_out, event_type, message, guest_name, guest_email, member_id, addons_snapshot, pricing_subtotal, pricing_snapshot, proposal_total_amount, payment_status, payment_method, payment_reference, deposit_amount, amount_paid, payment_due_at";

export async function sendLedgerBookingReceipt(bookingId: string) {
  const { data: row, error } = await supabaseAdmin.from("bookings").select(COLUMNS).eq("id", bookingId).maybeSingle();
  if (error || !row) return false;
  const recipient = await resolveBookingRecipient(supabaseAdmin, row);
  if (!recipient.email) return false;
  await sendBookingPaymentReceivedEmail({
    to: recipient.email,
    name: recipient.name,
    villa: row.villa,
    check_in: row.check_in,
    check_out: row.check_out,
    booking_id: row.id,
    payment_status: row.payment_status ?? null,
    deposit_amount: row.deposit_amount ?? null,
    amount_paid: row.amount_paid ?? null,
    payment_due_at: row.payment_due_at ?? null,
    payment_method: row.payment_method ?? null,
    payment_reference: row.payment_reference ?? null,
    pricing_subtotal: row.pricing_subtotal ?? null,
    pricing_snapshot: row.pricing_snapshot ?? null,
    addons_snapshot: Array.isArray(row.addons_snapshot) ? row.addons_snapshot : null,
    event_type: row.event_type ?? null,
    proposal_total_amount: row.proposal_total_amount ?? null,
    is_event_inquiry: isEventInquiryBooking(row),
  });
  return true;
}
