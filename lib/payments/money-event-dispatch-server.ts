import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatBookingReference } from "@/lib/booking-reference";
import { sendLedgerBookingReceipt } from "@/lib/payments/ledger-receipt";
import {
  sendOperatorMoneyAlertEmail,
  sendStandalonePaymentReceiptEmail,
} from "@/lib/send-payment-notification-email";
import { maybeReleaseHeldArrivalGuide } from "@/lib/whatsapp/arrival-guide-release-server";
import {
  buildMoneyNotificationKey,
  dispatchMoneyEvent,
  type MoneyEvent,
  type MoneyEventClaimResult,
  type MoneyEventOutcome,
  type MoneyEventResult,
  type MoneyEventSource,
} from "@/lib/payments/money-event-dispatch";

/**
 * Phase 16B M2 — Supabase/email wiring for the single money-event dispatcher.
 * Every money path calls notifyMoneyEvent(); the pure core in
 * money-event-dispatch.ts owns the at-most-once contract.
 *
 * This module never throws. A notification must never fail a payment.
 */

const LOG_TAG = "[payments/money-event]";
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const UNIQUE_VIOLATION = "23505";

function isMissingTableError(error: { code?: string | null; message?: string | null }) {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
  const message = error.message ?? "";
  return (
    /payment_notifications/.test(message) &&
    /(does not exist|could not find|schema cache)/i.test(message)
  );
}

async function claim(event: MoneyEvent): Promise<MoneyEventClaimResult> {
  const { error } = await supabaseAdmin.from("payment_notifications").insert({
    notification_key: event.notification_key,
    payment_transaction_id: event.payment_transaction_id,
    booking_id: event.booking_id,
    payment_request_id: event.payment_request_id,
    source: event.source,
    outcome: event.outcome,
  });
  if (!error) return "claimed";
  if (error.code === UNIQUE_VIOLATION) return "already";
  if (isMissingTableError(error)) {
    console.error(
      `${LOG_TAG} payment_notifications table missing — run sql/phase-16b-money-event-notifications.sql. No receipt or alert was sent.`,
      { notification_key: event.notification_key },
    );
    return "unavailable";
  }
  console.error(`${LOG_TAG} claim failed`, { code: error.code, message: error.message });
  return "error";
}

async function markSent(
  event: MoneyEvent,
  sent: { guest_receipt: boolean; operator_alert: boolean },
) {
  await supabaseAdmin
    .from("payment_notifications")
    .update({
      guest_receipt_sent: sent.guest_receipt,
      operator_alert_sent: sent.operator_alert,
      updated_at: new Date().toISOString(),
    })
    .eq("notification_key", event.notification_key);
}

type RequestContact = {
  payer_name: string | null;
  payer_email: string | null;
  description: string | null;
};

async function loadRequestContact(requestId: string): Promise<RequestContact | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_requests")
    .select("payer_name, payer_email, description")
    .eq("id", requestId)
    .maybeSingle<RequestContact>();
  if (error) {
    console.error(`${LOG_TAG} payment request lookup failed`, { message: error.message });
    return null;
  }
  return data ?? null;
}

type BookingSummary = {
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_name: string | null;
  member_id: string | null;
};

async function loadBookingSummary(bookingId: string): Promise<BookingSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("villa, check_in, check_out, guest_name, member_id")
    .eq("id", bookingId)
    .maybeSingle<BookingSummary>();
  if (error) {
    console.error(`${LOG_TAG} booking summary lookup failed`, { message: error.message });
    return null;
  }
  if (!data) return null;
  // A member who booked while signed in leaves guest_name null — their name is
  // on the member record. Without this the operator's money alert says "Guest"
  // for exactly the customers Oraya knows best. Enrichment is additive: a failed
  // read leaves the alert as it was rather than suppressing it.
  if (!data.guest_name?.trim() && data.member_id) {
    const { data: member, error: memberError } = await supabaseAdmin
      .from("members")
      .select("full_name")
      .eq("id", data.member_id)
      .maybeSingle<{ full_name: string | null }>();
    if (memberError) {
      console.error(`${LOG_TAG} member name lookup failed`, { message: memberError.message });
    } else if (member?.full_name?.trim()) {
      return { ...data, guest_name: member.full_name.trim() };
    }
  }
  return data;
}

/**
 * The receipt must work when the payment has no booking: an operator who
 * forgot to attach the booking must not turn into guest silence.
 */
async function sendGuestReceipt(event: MoneyEvent): Promise<boolean> {
  if (event.booking_id) return sendLedgerBookingReceipt(event.booking_id);
  if (!event.payment_request_id) return false;

  const contact = await loadRequestContact(event.payment_request_id);
  if (!contact?.payer_email) return false;
  return sendStandalonePaymentReceiptEmail({
    to: contact.payer_email,
    name: contact.payer_name,
    amount: event.amount,
    currency: event.currency,
    method: event.method,
    description: contact.description,
    reference: event.provider_reference,
  });
}

export async function loadOperatorRecipients(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "notification_emails")
    .maybeSingle<{ value: string | null }>();
  if (error) {
    console.error(`${LOG_TAG} operator recipient lookup failed`, { message: error.message });
    return [];
  }
  return (data?.value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function sendOperatorAlert(event: MoneyEvent): Promise<boolean> {
  const to = await loadOperatorRecipients();
  if (to.length === 0) {
    console.error(`${LOG_TAG} no operator notification_emails configured — alert not sent`, {
      outcome: event.outcome,
    });
    return false;
  }
  const booking = event.booking_id ? await loadBookingSummary(event.booking_id) : null;
  const contact = event.payment_request_id
    ? await loadRequestContact(event.payment_request_id)
    : null;

  return sendOperatorMoneyAlertEmail({
    to,
    outcome: event.outcome,
    amount: event.amount,
    currency: event.currency,
    method: event.method,
    subject_name: booking?.guest_name ?? contact?.payer_name ?? null,
    villa: booking?.villa ?? null,
    check_in: booking?.check_in ?? null,
    check_out: booking?.check_out ?? null,
    booking_reference: event.booking_id ? formatBookingReference(event.booking_id) : null,
    description: contact?.description ?? null,
    reference: event.provider_reference,
    source: event.source,
  });
}

export type NotifyMoneyEventInput = {
  outcome: MoneyEventOutcome;
  source: MoneyEventSource;
  amount: number;
  currency: string;
  method: string;
  booking_id?: string | null;
  payment_request_id?: string | null;
  payment_transaction_id?: string | null;
  /** CyberSource transaction id — the identity both observers share. */
  provider_transaction_id?: string | null;
  idempotency_key?: string | null;
};

/**
 * Announce that money was recorded (or failed / needs review) exactly once.
 * Safe to call from every path, including both observers of the same payment.
 * Never throws; callers must ignore the result for control flow.
 */
export async function notifyMoneyEvent(
  input: NotifyMoneyEventInput,
): Promise<MoneyEventResult> {
  try {
    const notificationKey = buildMoneyNotificationKey({
      outcome: input.outcome,
      provider_transaction_id: input.provider_transaction_id,
      payment_transaction_id: input.payment_transaction_id,
      idempotency_key: input.idempotency_key,
    });
    if (!notificationKey) {
      console.error(`${LOG_TAG} no identity for this money event — nothing sent`, {
        source: input.source,
        outcome: input.outcome,
      });
      return { kind: "not_claimed", reason: "error" };
    }
    const event: MoneyEvent = {
      notification_key: notificationKey,
      outcome: input.outcome,
      source: input.source,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      booking_id: input.booking_id ?? null,
      payment_request_id: input.payment_request_id ?? null,
      payment_transaction_id: input.payment_transaction_id ?? null,
      provider_reference: input.provider_transaction_id ?? null,
    };
    // Money landing is also what releases an arrival guide the payment gate
    // held. Guarded by its own at-most-once claim, so several observers of the
    // same payment cannot produce two messages.
    if (input.outcome === "recorded" && input.booking_id) {
      await maybeReleaseHeldArrivalGuide(input.booking_id);
    }

    return await dispatchMoneyEvent(
      {
        claim,
        markSent,
        sendGuestReceipt,
        sendOperatorAlert,
        log: (message, detail) => console.error(`${LOG_TAG} ${message}`, detail ?? {}),
      },
      event,
    );
  } catch (error) {
    console.error(`${LOG_TAG} dispatch failed — the payment is unaffected`, error);
    return { kind: "not_claimed", reason: "error" };
  }
}
