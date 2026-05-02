import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingPaymentReminderEmail } from "@/lib/send-booking-payment-email";

const REMINDER_NOTE_PREFIX = "[Payment reminder]";
const REMINDER_COOLDOWN_HOURS = 24;

type ReminderCandidate = {
  id: string;
  villa: string;
  check_in: string;
  check_out: string;
  status: string | null;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  event_type: string | null;
  message: string | null;
  pricing_subtotal?: number | string | null;
  pricing_snapshot?: { subtotal?: number | string | null } | null;
  addons_snapshot?: Array<{ price?: number | null }> | null;
  deposit_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_due_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_notes?: string | null;
};

function extractLatestReminderTimestamp(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const pattern = /\[Payment reminder\]\s+([0-9T:\-.+Z]+)/g;
  let latest: string | null = null;
  let match: RegExpExecArray | null = pattern.exec(notes);

  while (match) {
    latest = match[1] ?? latest;
    match = pattern.exec(notes);
  }

  return latest;
}

export function appendPaymentReminderNote(existingNotes: string | null | undefined, timestampIso: string): string {
  const nextLine = `${REMINDER_NOTE_PREFIX} ${timestampIso}`;
  const trimmed = existingNotes?.trim();
  return trimmed ? `${trimmed}\n${nextLine}` : nextLine;
}

export function wasRecentlyReminded(notes: string | null | undefined, nowIso: string, cooldownHours = REMINDER_COOLDOWN_HOURS): boolean {
  const lastReminderIso = extractLatestReminderTimestamp(notes);
  if (!lastReminderIso) return false;

  const lastReminderMs = new Date(lastReminderIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (Number.isNaN(lastReminderMs) || Number.isNaN(nowMs)) return false;

  return nowMs - lastReminderMs < cooldownHours * 60 * 60 * 1000;
}

async function resolveRecipient(booking: ReminderCandidate): Promise<{ email: string | null; name: string }> {
  if (booking.member_id) {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(booking.member_id);
    if (user?.email) {
      let memberName = "Member";
      const { data: member } = await supabaseAdmin
        .from("members")
        .select("full_name")
        .eq("id", booking.member_id)
        .single();
      if (member?.full_name) memberName = member.full_name;
      return { email: user.email, name: memberName };
    }
  }

  return {
    email: booking.guest_email ?? null,
    name: booking.guest_name || "Guest",
  };
}

function isEventInquiry(booking: Pick<ReminderCandidate, "event_type" | "message">) {
  return Boolean(
    booking.event_type &&
    typeof booking.message === "string" &&
    booking.message.includes("[Event Inquiry]")
  );
}

export async function sendPaymentReminders(nowIso = new Date().toISOString()) {
  const { data: bookings, error } = await supabaseAdmin
    .from("bookings")
    .select("id, villa, check_in, check_out, status, member_id, guest_name, guest_email, event_type, message, pricing_subtotal, pricing_snapshot, addons_snapshot, deposit_amount, amount_paid, payment_due_at, payment_method, payment_reference, payment_notes")
    .eq("status", "confirmed")
    .eq("payment_status", "payment_requested")
    .lt("payment_due_at", nowIso);

  if (error) {
    throw error;
  }

  let reminded = 0;
  let skipped = 0;

  for (const booking of bookings ?? []) {
    if (isEventInquiry(booking) || wasRecentlyReminded(booking.payment_notes, nowIso)) {
      skipped += 1;
      continue;
    }

    const { email, name } = await resolveRecipient(booking);
    if (!email) {
      skipped += 1;
      continue;
    }

    await sendBookingPaymentReminderEmail({
      to: email,
      name,
      villa: booking.villa,
      check_in: booking.check_in,
      check_out: booking.check_out,
      booking_id: booking.id,
      deposit_amount: booking.deposit_amount ?? null,
      amount_paid: booking.amount_paid ?? null,
      payment_due_at: booking.payment_due_at ?? null,
      payment_method: booking.payment_method ?? null,
      payment_reference: booking.payment_reference ?? null,
      pricing_subtotal: booking.pricing_subtotal ?? null,
      pricing_snapshot: booking.pricing_snapshot ?? null,
      addons_snapshot: Array.isArray(booking.addons_snapshot) ? booking.addons_snapshot : null,
    });

    const paymentNotes = appendPaymentReminderNote(booking.payment_notes, nowIso);
    await supabaseAdmin
      .from("bookings")
      .update({ payment_notes: paymentNotes })
      .eq("id", booking.id);

    reminded += 1;
  }

  return { reminded, skipped };
}
