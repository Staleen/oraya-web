/**
 * Phase 16C — automatic WhatsApp Arrival Guide webhook dispatch.
 *
 * When a STAY booking becomes confirmed through one of the two authoritative
 * confirmation writers (app/api/booking-action/route.ts and
 * app/api/admin/bookings/[id]/route.ts), this helper fail-closed POSTs one
 * safe payload to a configured WhatChimp Webhook Workflow URL so WhatChimp
 * can send the approved WhatsApp Utility Template
 * (`oraya_arrival_guide_confirmed`). Architecture A: WhatChimp
 * owns the template and final delivery — this module never calls Meta/WABA
 * directly and holds no Meta credentials.
 *
 * Dispatch gates (ALL must pass before the idempotency claim):
 *   1. booking status is "confirmed" and the booking is NOT an event inquiry;
 *   2. `WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL` is configured (presence is the
 *      activation switch — unset means "skipped: not configured");
 *   3. `VERCEL_ENV === "production"` OR
 *      `WHATSAPP_CONFIRMATION_ALLOW_NONPROD === "true"` (explicit opt-in);
 *   4. a WhatsApp recipient exists: `bookings.guest_phone`, else the
 *      member's `members.phone`, digits-normalized like the admin wa.me links;
 *   5. the stay is not already over (`check_out` before today UTC would send
 *      an instantly-expired link — checkout-day itself still sends);
 *   6. the public booking reference and the personalized
 *      `arrival_guide_url` (existing helpers) both mint successfully.
 *
 * Idempotency (at-most-once): immediately before the first POST attempt the
 * helper atomically claims `bookings.whatsapp_confirmation_sent_at`
 * (`update … where status = 'confirmed' and whatsapp_confirmation_sent_at
 * is null returning id` — the booking_action_tokens.used_at pattern). Zero
 * rows means another confirm already claimed it: skip silently. If the POST
 * fails AFTER claiming, there is NO automatic retry in v1 — the failure is
 * logged and the Stage 4A admin "Copy Arrival Guide link" remains the manual
 * fallback. A duplicate WhatsApp message to a guest is worse than a missed
 * one.
 *
 * Payload allow-list (never anything else): event, template, guest_name
 * (when safely available), phone, villa, check_in, check_out,
 * booking_reference, arrival_guide_url. NO booking UUID field, NO internal
 * IDs, NO PINs / gate codes / door codes / access details, NO payment
 * links, NO admin notes, NO secrets. Access-code delivery remains Phase 16D.
 *
 * Logging: safe fields only — booking reference, state, reason code, HTTP
 * status. Never the webhook URL, the signed arrival token, the secret, or
 * the full phone number.
 *
 * This module NEVER throws for normal skip/failure states, and a WhatsApp
 * failure must never block booking confirmation or the confirmed email.
 *
 * Testability: the pure gates and payload builder are exported; runtime-only
 * dependencies (supabase-admin, the booking-reference helper) are loaded
 * lazily inside the default deps so `node --experimental-strip-types --test`
 * can import this module and exercise everything through injected deps.
 */

import { buildArrivalGuideUrl } from "../arrival-guide-link.ts";

export const CONFIRMED_STAY_TEMPLATE_NAME = "oraya_arrival_guide_confirmed";

export type ConfirmedStayDispatchSkipReason =
  | "not_confirmed"
  | "event_inquiry"
  | "not_configured"
  | "non_production"
  | "missing_phone"
  | "expired_stay"
  | "missing_reference"
  | "no_arrival_guide_url"
  | "already_claimed"
  | "claim_failed";

export type ConfirmedStayDispatchResult =
  | { dispatched: true; httpStatus: number }
  | { dispatched: false; reason: ConfirmedStayDispatchSkipReason }
  | { dispatched: false; reason: "post_failed"; httpStatus: number };

export interface ConfirmedStayBookingInput {
  booking_id: string;
  status: string | null;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  event_type?: string | null;
  message?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  member_id?: string | null;
}

export interface ConfirmedStayWebhookPayload {
  event: "booking_confirmed";
  template: typeof CONFIRMED_STAY_TEMPLATE_NAME;
  guest_name?: string;
  phone: string;
  villa: string;
  check_in: string;
  check_out: string;
  booking_reference: string;
  arrival_guide_url: string;
}

export interface ConfirmedStayDispatchDeps {
  env?: Record<string, string | undefined>;
  /** Today's UTC calendar date as YYYY-MM-DD (injectable for tests). */
  todayUtc?: () => string;
  /** Atomic claim of bookings.whatsapp_confirmation_sent_at. */
  claimWhatsAppConfirmation?: (bookingId: string) => Promise<"claimed" | "already" | "error">;
  /** members.full_name / members.phone lookup for member bookings. */
  lookupMemberContact?: (
    memberId: string,
  ) => Promise<{ full_name: string | null; phone: string | null } | null>;
  /** Public 8-char booking reference (lib/booking-reference.ts). */
  formatReference?: (bookingId: string) => Promise<string | null>;
  /** Personalized Arrival Guide URL (lib/arrival-guide-link.ts). */
  mintArrivalGuideUrl?: (bookingId: string, checkOut: string | null) => string | null;
  /** POST the payload; secret is null when no shared secret is configured. */
  postWebhook?: (
    url: string,
    payload: ConfirmedStayWebhookPayload,
    secret: string | null,
  ) => Promise<{ ok: boolean; status: number }>;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const POST_TIMEOUT_MS = 10_000;

// ── Pure helpers (exported for the focused test suite) ───────────────────────

/** Digits-only normalization, matching the admin console's wa.me links. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.length > 0 ? digits : null;
}

/** Same detection the confirmation writers use for the event-email split. */
export function isEventInquiryStay(
  eventType: string | null | undefined,
  message: string | null | undefined,
): boolean {
  return Boolean(eventType) && typeof message === "string" && message.includes("[Event Inquiry]");
}

/**
 * True when check_out (YYYY-MM-DD) is strictly before today's UTC date —
 * date-only string comparison, never `new Date(<stay date>)` (AGENT_RULES
 * §10). Checkout day itself is NOT expired: the token lives to 23:59:59Z.
 * Malformed dates return false here; the URL mint gate rejects them later.
 */
export function isStayCheckOutInPast(checkOut: string | null | undefined, todayUtc: string): boolean {
  if (typeof checkOut !== "string" || !DATE_ONLY_RE.test(checkOut.trim())) return false;
  return checkOut.trim() < todayUtc;
}

/** Environment gate: configured URL first, then the non-production guard. */
export function resolveDispatchEnvironmentGate(env: Record<string, string | undefined>):
  | { allowed: true; webhookUrl: string; secret: string | null }
  | { allowed: false; reason: "not_configured" | "non_production" } {
  const webhookUrl = env.WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL?.trim();
  if (!webhookUrl) return { allowed: false, reason: "not_configured" };

  const isProduction = env.VERCEL_ENV === "production";
  const nonProdOptIn = env.WHATSAPP_CONFIRMATION_ALLOW_NONPROD === "true";
  if (!isProduction && !nonProdOptIn) return { allowed: false, reason: "non_production" };

  const secret = env.WHATCHIMP_CONFIRMED_STAY_WEBHOOK_SECRET?.trim();
  return { allowed: true, webhookUrl, secret: secret ? secret : null };
}

/** Assemble the exact allow-listed payload. Returns null if a required field is missing. */
export function buildConfirmedStayWebhookPayload(args: {
  guestName: string | null;
  phone: string;
  villa: string | null;
  checkIn: string | null;
  checkOut: string | null;
  bookingReference: string;
  arrivalGuideUrl: string;
}): ConfirmedStayWebhookPayload | null {
  const villa = typeof args.villa === "string" && args.villa.trim() ? args.villa.trim() : null;
  const checkIn =
    typeof args.checkIn === "string" && DATE_ONLY_RE.test(args.checkIn.trim()) ? args.checkIn.trim() : null;
  const checkOut =
    typeof args.checkOut === "string" && DATE_ONLY_RE.test(args.checkOut.trim()) ? args.checkOut.trim() : null;
  if (!villa || !checkIn || !checkOut) return null;

  const guestName =
    typeof args.guestName === "string" && args.guestName.trim() ? args.guestName.trim() : null;

  return {
    event: "booking_confirmed",
    template: CONFIRMED_STAY_TEMPLATE_NAME,
    ...(guestName ? { guest_name: guestName } : {}),
    phone: args.phone,
    villa,
    check_in: checkIn,
    check_out: checkOut,
    booking_reference: args.bookingReference,
    arrival_guide_url: args.arrivalGuideUrl,
  };
}

// ── Default runtime deps (lazy imports keep the module node-test importable) ─

async function defaultClaimWhatsAppConfirmation(
  bookingId: string,
): Promise<"claimed" | "already" | "error"> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ whatsapp_confirmation_sent_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "confirmed")
      .is("whatsapp_confirmation_sent_at", null)
      .select("id");

    if (error) {
      if ((error as { code?: string }).code === "42703") {
        console.warn(
          "[whatsapp/confirmed-stay] whatsapp_confirmation_sent_at column missing — apply sql/phase-16c-whatsapp-confirmation-tracking.sql. Dispatch skipped (fail closed).",
        );
      } else {
        console.warn("[whatsapp/confirmed-stay] claim error:", error.message);
      }
      return "error";
    }
    return data && data.length > 0 ? "claimed" : "already";
  } catch (err) {
    console.warn("[whatsapp/confirmed-stay] claim unexpected error:", err);
    return "error";
  }
}

async function defaultLookupMemberContact(
  memberId: string,
): Promise<{ full_name: string | null; phone: string | null } | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data, error } = await supabaseAdmin
      .from("members")
      .select("full_name, phone")
      .eq("id", memberId)
      .maybeSingle<{ full_name: string | null; phone: string | null }>();
    if (error || !data) return null;
    return { full_name: data.full_name ?? null, phone: data.phone ?? null };
  } catch {
    return null;
  }
}

async function defaultFormatReference(bookingId: string): Promise<string | null> {
  const { formatBookingReference } = await import("@/lib/booking-reference");
  return formatBookingReference(bookingId);
}

async function defaultPostWebhook(
  url: string,
  payload: ConfirmedStayWebhookPayload,
  secret: string | null,
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Oraya-Webhook-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
      // Never follow redirects silently — a 3xx is a misconfigured target
      // (KNOWN_BUGS #11 class), treated as failure.
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    return { ok: response.status >= 200 && response.status < 300, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Fail-closed, at-most-once WhatsApp dispatch for a just-confirmed stay
 * booking. Never throws for normal skip/failure states; logs every outcome
 * with safe fields only. Callers (the two authoritative confirmation
 * writers) fire this AFTER the status update and email block, and must not
 * let any unexpected rejection block the confirmation response.
 */
export async function dispatchConfirmedStayWhatsAppNotification(
  booking: ConfirmedStayBookingInput,
  deps: ConfirmedStayDispatchDeps = {},
): Promise<ConfirmedStayDispatchResult> {
  const env = deps.env ?? process.env;
  const todayUtc = deps.todayUtc ?? (() => new Date().toISOString().slice(0, 10));
  const claim = deps.claimWhatsAppConfirmation ?? defaultClaimWhatsAppConfirmation;
  const lookupMember = deps.lookupMemberContact ?? defaultLookupMemberContact;
  const formatReference = deps.formatReference ?? defaultFormatReference;
  const mintArrivalGuideUrl =
    deps.mintArrivalGuideUrl ?? ((id: string, out: string | null) => buildArrivalGuideUrl(id, out));
  const postWebhook = deps.postWebhook ?? defaultPostWebhook;

  const refForLog = booking.booking_id.slice(0, 8).toUpperCase();
  const skip = (reason: ConfirmedStayDispatchSkipReason): ConfirmedStayDispatchResult => {
    console.info(`[whatsapp/confirmed-stay] ${refForLog} skipped: ${reason}`);
    return { dispatched: false, reason };
  };

  // Gate 1 — only confirmed stay bookings (defensive re-check of the caller's state).
  if ((booking.status ?? "").trim().toLowerCase() !== "confirmed") return skip("not_confirmed");
  if (isEventInquiryStay(booking.event_type, booking.message)) return skip("event_inquiry");

  // Gate 2 + 3 — activation switch and environment.
  const gate = resolveDispatchEnvironmentGate(env);
  if (!gate.allowed) return skip(gate.reason);

  // Gate 4 — recipient. bookings.guest_phone first, then the member's phone.
  let phone = normalizeWhatsAppPhone(booking.guest_phone);
  let memberContact: { full_name: string | null; phone: string | null } | null = null;
  if (!phone && booking.member_id) {
    memberContact = await lookupMember(booking.member_id);
    phone = normalizeWhatsAppPhone(memberContact?.phone);
  }
  if (!phone) return skip("missing_phone");

  // Gate 5 — never send a link into an already-finished stay.
  if (isStayCheckOutInPast(booking.check_out, todayUtc())) return skip("expired_stay");

  // Guest name: bookings.guest_name, else members.full_name (best effort).
  let guestName = typeof booking.guest_name === "string" && booking.guest_name.trim() ? booking.guest_name.trim() : null;
  if (!guestName && booking.member_id) {
    memberContact = memberContact ?? (await lookupMember(booking.member_id));
    guestName =
      typeof memberContact?.full_name === "string" && memberContact.full_name.trim()
        ? memberContact.full_name.trim()
        : null;
  }

  // Gate 6 — mint the public reference and the personalized guide URL.
  const bookingReference = await formatReference(booking.booking_id);
  if (!bookingReference) return skip("missing_reference");

  const arrivalGuideUrl = mintArrivalGuideUrl(booking.booking_id, booking.check_out ?? null);
  if (!arrivalGuideUrl) return skip("no_arrival_guide_url");

  const payload = buildConfirmedStayWebhookPayload({
    guestName,
    phone,
    villa: booking.villa,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    bookingReference,
    arrivalGuideUrl,
  });
  if (!payload) return skip("no_arrival_guide_url");

  // Idempotency claim — only now, with dispatch enabled and the payload ready.
  const claimOutcome = await claim(booking.booking_id);
  if (claimOutcome === "already") return skip("already_claimed");
  if (claimOutcome === "error") return skip("claim_failed");

  // One POST attempt. No automatic retry in v1 (at-most-once): a failure
  // here leaves the claim consumed and the Stage 4A admin manual copy as
  // the fallback.
  const result = await postWebhook(gate.webhookUrl, payload, gate.secret);
  if (!result.ok) {
    console.warn(
      `[whatsapp/confirmed-stay] ${bookingReference} post_failed (http ${result.status}) — no auto-retry; use the admin "Copy Arrival Guide link" fallback.`,
    );
    return { dispatched: false, reason: "post_failed", httpStatus: result.status };
  }

  console.info(`[whatsapp/confirmed-stay] ${bookingReference} dispatched (http ${result.status})`);
  return { dispatched: true, httpStatus: result.status };
}
