import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { resolveBookingRecipient } from "@/lib/booking-recipient";
import { isEventInquiryBooking } from "@/lib/booking-guest-dispatch";
import {
  CONFIRMED_STAY_TEMPLATE_NAME,
  isStayCheckOutInPast,
  normalizeWhatsAppPhone,
  resolveDispatchEnvironmentGate,
} from "@/lib/whatsapp/confirmed-stay-notification";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/bookings/[id]/message-preview]";

/**
 * What WILL the guest receive if this stay is approved or declined?
 *
 * The /ops design rule is preview-over-confirmation: sending IS looking at it.
 * This route answers with the CONTENT of the messages — recipient, subject,
 * every summary row of the email, and the WhatsApp Arrival Guide send decision
 * evaluated against the same gates the real dispatch applies (env switch,
 * phone, expired stay, already-sent claim) — WITHOUT claiming or sending
 * anything.
 *
 * Display-only mirror: the actual send goes through the one shared copy in
 * lib/booking-guest-dispatch.ts, so this preview can never diverge from what
 * is sent in substance — only in styling.
 */

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: number): string {
  return `USD ${Math.round(value).toLocaleString("en-US")}`;
}

interface AddonPreviewRow {
  label: string;
  price: number | null;
  price_label: string;
  notes: string[];
}

function addonPreviewRows(snapshot: unknown, addons: unknown): AddonPreviewRow[] {
  const source = Array.isArray(snapshot) && snapshot.length > 0 ? snapshot : Array.isArray(addons) ? addons : [];
  return source
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .map((a) => {
      const label = typeof a.label === "string" ? a.label : "Add-on";
      const price = typeof a.price === "number" ? a.price : null;
      const hours = typeof a.preparation_time_hours === "number" ? a.preparation_time_hours : null;
      const notes: string[] = [];
      if (hours && hours > 0) {
        notes.push(
          hours % 24 === 0
            ? `Includes ${hours / 24} ${hours / 24 === 1 ? "day" : "days"} advance notice`
            : `Includes ${hours} ${hours === 1 ? "hour" : "hours"} advance notice`,
        );
      }
      if (a.requires_approval === true) notes.push("Subject to confirmation");
      if (a.same_day_warning === "same_day_checkout") notes.push("Early check-in may depend on same-day checkout timing");
      if (a.same_day_warning === "same_day_checkin") notes.push("Late checkout may depend on same-day check-in timing");
      return {
        label,
        price,
        price_label: price === null ? "Price on request" : `$${price.toLocaleString("en-US")}`,
        notes,
      };
    });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action !== "approve" && action !== "decline" && action !== "request_deposit" && action !== "send_reminder") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, status, villa, check_in, check_out, event_type, message, guest_name, guest_email, guest_phone, member_id, sleeping_guests, day_visitors, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, whatsapp_confirmation_sent_at, payment_status, payment_method, deposit_amount, amount_paid, amount_total, payment_due_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} load failed:`, error.message);
    return NextResponse.json({ error: "Could not load this booking." }, { status: 503 });
  }
  if (!booking) {
    return NextResponse.json({ error: "This booking no longer exists." }, { status: 404 });
  }

  const b = booking as unknown as {
    id: string;
    status: string | null;
    villa: string | null;
    check_in: string | null;
    check_out: string | null;
    event_type: string | null;
    message: string | null;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    member_id: string | null;
    sleeping_guests: number | null;
    day_visitors: number | null;
    addons: unknown;
    addons_snapshot: unknown;
    pricing_subtotal: number | string | null;
    pricing_snapshot: { subtotal?: number | string | null } | null;
    whatsapp_confirmation_sent_at: string | null;
    payment_status: string | null;
    payment_method: string | null;
    deposit_amount: number | null;
    amount_paid: number | null;
    amount_total: number | null;
    payment_due_at: string | null;
  };

  // Events are supported now; their confirmation email is the dedicated event
  // one, and no WhatsApp arrival guide is dispatched for them.
  const isEvent = isEventInquiryBooking(b);

  const recipient = await resolveBookingRecipient(supabaseAdmin, b);

  // ── Payment email previews (16B senders' content, mirrored) ────────────────
  if (action === "request_deposit" || action === "send_reminder") {
    const isRequest = action === "request_deposit";
    const firstName = (recipient.name || "Guest").split(" ")[0];
    const deposit = isRequest
      ? Number(url.searchParams.get("deposit") ?? "") || b.deposit_amount || null
      : b.deposit_amount;
    const dueAt = isRequest ? url.searchParams.get("due_at") || b.payment_due_at : b.payment_due_at;
    const fmtDue = (iso: string | null) => {
      if (!iso || Number.isNaN(Date.parse(iso))) return "Not provided";
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Beirut",
      });
    };
    return NextResponse.json({
      ok: true,
      action,
      recipient,
      email: {
        will_send: Boolean(recipient.email),
        subject: isRequest
          ? "Payment requested for your Oraya booking"
          : "Reminder: payment pending for your Oraya booking",
        heading: isRequest
          ? `A payment request has been prepared for your stay, ${firstName}.`
          : "A friendly reminder for your Oraya booking.",
        intro: isRequest
          ? "Please review the requested deposit below and use the secure booking link for the latest booking and payment instructions."
          : "This is a reminder that payment is still pending for your stay. Please review the requested amount and due date below.",
        summary_rows: [
          ["Deposit amount", deposit === null ? "—" : `USD ${Math.round(deposit).toLocaleString("en-US")}`],
          ["Due date", fmtDue(dueAt)],
        ] as Array<[string, string]>,
        addons: [],
        payment_rows: [] as Array<[string, string]>,
        note: "Includes your manual payment methods (Whish, bank transfer, cash) and the secure link to their booking.",
        includes_view_link: true,
        includes_arrival_guide: false,
      },
      whatsapp: { applicable: false },
    });
  }

  const isConfirm = action === "approve";
  const ref = b.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const firstName = (recipient.name || "Guest").split(" ")[0];

  // ── Email content, mirroring lib/send-booking-email.ts row for row ─────────
  const addonRows = addonPreviewRows(b.addons_snapshot, b.addons);
  const staySubtotal = parseAmount(b.pricing_snapshot?.subtotal ?? b.pricing_subtotal);
  let addonsTotal: number | null = 0;
  for (const row of addonRows) {
    if (row.price === null) { addonsTotal = null; break; }
    addonsTotal = (addonsTotal ?? 0) + row.price;
  }
  const estimatedTotal = staySubtotal !== null && addonsTotal !== null ? staySubtotal + addonsTotal : null;

  const summaryRows: Array<[string, string]> = [
    ["Villa", b.villa ?? "-"],
    ["Dates", `${fmtDate(b.check_in)} to ${fmtDate(b.check_out)}`],
    ...(typeof b.sleeping_guests === "number" ? [["Guests", String(b.sleeping_guests)] as [string, string]] : []),
    ...(typeof b.day_visitors === "number" ? [["Visitors", String(b.day_visitors)] as [string, string]] : []),
    ...(b.event_type ? [["Event type", b.event_type] as [string, string]] : []),
    ["Status", isConfirm ? "Confirmed" : "Cancelled"],
    ["Reference", ref],
  ];

  const email = {
    will_send: Boolean(recipient.email),
    subject: isEvent && isConfirm
      ? "Oraya — Your event is confirmed"
      : isConfirm ? "Oraya - Booking Confirmed" : "Oraya - Booking Cancelled",
    heading: isEvent && isConfirm
      ? `Your event is confirmed, ${firstName}.`
      : isConfirm ? `Your stay is confirmed, ${firstName}.` : "Your booking has been cancelled.",
    intro: isConfirm
      ? "This is a transactional confirmation for your Oraya booking. We look forward to welcoming you, and you can reply to this email if you need anything before arrival."
      : "This is a transactional update for your Oraya booking. Your booking has been cancelled. If you believe this is an error, please reply to this email.",
    summary_rows: summaryRows,
    addons: addonRows,
    payment_rows: [
      ["Stay subtotal", staySubtotal !== null ? formatMoney(staySubtotal) : "Not available"],
      ["Add-ons total", addonsTotal !== null ? formatMoney(addonsTotal) : "Price on request"],
      ["Total estimated", estimatedTotal !== null ? formatMoney(estimatedTotal) : "Not available"],
    ] as Array<[string, string]>,
    note: b.message?.trim() || null,
    // The confirmed email carries the signed booking-view link and the
    // personalized Arrival Guide link; the cancelled email carries neither.
    includes_view_link: isConfirm,
    includes_arrival_guide: isConfirm,
  };

  // ── WhatsApp send decision, evaluated with the real dispatch gates ─────────
  let whatsapp:
    | { applicable: false }
    | {
        applicable: true;
        will_send: boolean;
        reason: string | null;
        phone: string | null;
        template: string;
        fields: { guest_name: string | null; villa: string | null; check_in: string | null; check_out: string | null; booking_reference: string } | null;
      };

  if (!isConfirm || isEvent) {
    // Events are excluded from the Phase 16C arrival-guide dispatch by design.
    whatsapp = { applicable: false };
  } else {
    let phone = normalizeWhatsAppPhone(b.guest_phone);
    if (!phone && b.member_id) {
      const { data: member } = await supabaseAdmin
        .from("members")
        .select("phone")
        .eq("id", b.member_id)
        .maybeSingle<{ phone: string | null }>();
      phone = normalizeWhatsAppPhone(member?.phone);
    }

    const gate = resolveDispatchEnvironmentGate(process.env);
    const todayUtc = new Date().toISOString().slice(0, 10);

    let reason: string | null = null;
    if (b.whatsapp_confirmation_sent_at) reason = "already_sent";
    else if (!gate.allowed) reason = gate.reason;
    else if (!phone) reason = "missing_phone";
    else if (isStayCheckOutInPast(b.check_out, todayUtc)) reason = "expired_stay";

    whatsapp = {
      applicable: true,
      will_send: reason === null,
      reason,
      phone,
      template: CONFIRMED_STAY_TEMPLATE_NAME,
      fields:
        reason === null || reason === "already_sent"
          ? {
              guest_name: b.guest_name?.trim() || null,
              villa: b.villa,
              check_in: b.check_in,
              check_out: b.check_out,
              booking_reference: ref,
            }
          : null,
    };
  }

  return NextResponse.json({
    ok: true,
    action,
    recipient,
    email,
    whatsapp,
  });
}
