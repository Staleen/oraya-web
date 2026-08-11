import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dispatchConfirmedStayWhatsAppNotification } from "@/lib/whatsapp/confirmed-stay-notification";
import { ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY } from "@/lib/whatsapp/arrival-guide-gate";

/**
 * Release an arrival guide that the payment gate held.
 *
 * When the gate holds a guide it deliberately does NOT consume the
 * at-most-once claim on `bookings.whatsapp_confirmation_sent_at`, so the guide
 * remains sendable exactly once. This runs when money lands: if the booking is
 * confirmed and the threshold is now met, the same dispatcher sends it, and
 * that claim makes a duplicate impossible even if several money paths observe
 * the same payment.
 *
 * Never throws. A failure here leaves the guide held, which is the same state
 * it was already in.
 */

const LOG_TAG = "[whatsapp/arrival-guide-release]";

const COLUMNS =
  "id, status, villa, check_in, check_out, event_type, message, guest_name, guest_phone, member_id, amount_paid, amount_total, deposit_amount";

export async function maybeReleaseHeldArrivalGuide(
  bookingId: string | null | undefined,
): Promise<void> {
  if (!bookingId) return;
  try {
    const { data: gateRow } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", ARRIVAL_GUIDE_PAYMENT_GATE_SETTING_KEY)
      .maybeSingle<{ value: unknown }>();
    const enabled = String(gateRow?.value ?? "").trim().toLowerCase() === "true";
    // Gate off means nothing was ever held; the confirm path already sent it.
    if (!enabled) return;

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(COLUMNS)
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !booking) return;

    const row = booking as unknown as Record<string, unknown>;
    if (String(row.status ?? "").toLowerCase() !== "confirmed") return;

    await dispatchConfirmedStayWhatsAppNotification(
      {
        booking_id: String(row.id),
        status: "confirmed",
        villa: (row.villa as string | null) ?? null,
        check_in: (row.check_in as string | null) ?? null,
        check_out: (row.check_out as string | null) ?? null,
        event_type: (row.event_type as string | null) ?? null,
        message: (row.message as string | null) ?? null,
        guest_name: (row.guest_name as string | null) ?? null,
        guest_phone: (row.guest_phone as string | null) ?? null,
        member_id: (row.member_id as string | null) ?? null,
        amount_paid: row.amount_paid == null ? null : Number(row.amount_paid),
        amount_total: row.amount_total == null ? null : Number(row.amount_total),
        deposit_amount: row.deposit_amount == null ? null : Number(row.deposit_amount),
      },
      { arrivalGuidePaymentGateEnabled: true },
    );
  } catch (error) {
    console.error(`${LOG_TAG} release failed — guide stays held`, error);
  }
}
