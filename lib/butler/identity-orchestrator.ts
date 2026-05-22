/**
 * Phase 16A — WhatsApp identity orchestration for the Butler.
 *
 * One stateless decision per call: given whatever signals the bot has
 * gathered so far (WhatChimp subscriber id, optional chat id, optional
 * sender phone for future channels, a guest-supplied booking reference,
 * a guest-supplied identity proof — email OR full name), return the
 * deterministic next action plus the only sentence the Butler is allowed
 * to echo about the outcome.
 *
 * Priority order (the only place this logic lives in the repo):
 *
 *   1. **Subscriber continuity (primary, WhatChimp).** If the inbound
 *      WhatChimp subscriber id already maps via
 *      `whatsapp_leads.whatsapp_subscriber_id` → `linked_booking_id` →
 *      `bookings`, identity is implicit and the booking's safe fields are
 *      surfaced for the bot to compose a status reply.
 *   2. **Phone continuity (future channels).** Same shape as the subscriber
 *      path, but keyed on `whatsapp_leads.phone`. Kept because future
 *      Butler channels (Telegram, Messenger, direct WhatsApp Cloud API)
 *      expose a sender phone where WhatChimp does not.
 *   3. **Booking-reference fallback.** No subscriber/phone match → bot is
 *      told to ask for the reference. When a reference arrives, it is
 *      resolved via lib/booking-reference.ts. For a pending or confirmed
 *      match, the orchestrator REFUSES to surface villa/dates until an
 *      explicit identity proof is also submitted and verified.
 *   4. **Human escalation.** Any ambiguous match, failed identity proof,
 *      or other unsafe state hands off to a human.
 *
 * Identity verification options recognized today:
 *   - **Subscriber / phone continuity** — implicit when a primary path succeeds.
 *   - **Booking identity-proof match** — explicit. The guest types either
 *     the email OR the full name used on the booking. Compared case-
 *     insensitively, whitespace-collapsed, against `bookings.guest_email`,
 *     `bookings.guest_name`, and (when the booking is linked to a member)
 *     the member's `auth.users.email` and `members.full_name`. A match on
 *     any of these four equals "verified". Substring / fuzzy matching is
 *     intentionally not used — verification is exact-after-normalization
 *     to prevent name-prefix leakage (e.g. "John" matching every John).
 *   - **Manual escalation** — anything else.
 *
 * SENSITIVE-DISCLOSURE RULE: the orchestrator never returns villa /
 * check_in / check_out / booking_view_url when identity is unverified.
 * All four sensitive fields stay NULL until either a primary continuity
 * path resolves OR an explicit identity proof matches. A bot that caches
 * values across turns must still respect this contract: if the current
 * orchestrator response has them null, the bot must not echo a
 * previously-cached value. The booking_view_url is treated as sensitive
 * because the underlying `/booking/view/[token]` page renders villa,
 * dates, and the full booking summary; surfacing the URL before identity
 * is established would be an indirect bypass of the disclosure gate.
 *
 * Out of scope for this module: payments, payment links, smart-lock
 * PINs, exact addresses, admin notes, raw payload, signed action tokens
 * (confirm/cancel) — the signed view URL is the ONLY signed credential
 * this module is allowed to mint, and only on identity-established
 * branches.
 *
 * SCHEMA DEPENDENCY: the subscriber path requires the columns added by
 * sql/phase-16a3-whatsapp-subscriber-identity.sql
 * (`whatsapp_leads.whatsapp_subscriber_id`, `whatsapp_leads.whatsapp_chat_id`).
 * Until that migration is applied in Supabase, the subscriber-id lookup
 * gracefully falls through to the phone / reference paths — safe but not
 * optimal. The orchestrator detects the missing-column case via the
 * Supabase error code and degrades silently rather than throwing.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatBookingReference, resolveBookingByReference } from "@/lib/booking-reference";
import { buildButlerBookingViewUrl } from "@/lib/butler/booking-view-link";

export type IdentityState =
  | "ask_for_booking_reference"
  | "known_sender_resolved"
  | "known_sender_cancelled"
  | "reference_not_found"
  | "reference_ambiguous"
  | "reference_cancelled"
  | "reference_pending_unverified"
  | "reference_confirmed_unverified"
  | "verified"
  | "verification_failed";

export type IdentityAction =
  | "ask_for_booking_reference"
  | "ask_for_alternative_identifier"
  | "request_identity_proof"
  | "reply_with_status"
  | "acknowledge_cancellation"
  | "escalate_human";

export interface IdentityInput {
  /** WhatChimp subscriber id — primary continuity key for WhatsApp. */
  subscriber_id?: string | null;
  /** WhatChimp chat id — diagnostic only, never part of the primary lookup. */
  chat_id?: string | null;
  /** Inbound sender phone (raw). Used only when subscriber_id misses; kept
   *  for future channels that do expose a phone (Telegram, Messenger, etc.). */
  phone?: string | null;
  /** Guest-supplied booking reference (any case, with or without dashes/spaces). */
  booking_reference?: string | null;
  /** Guest-supplied identity proof — email OR full name. Compared
   *  case-insensitively, whitespace-collapsed. */
  identity_proof?: string | null;
}

export interface IdentityResult {
  state: IdentityState;
  recommended_next_action: IdentityAction;
  booking_id: string | null;
  booking_reference: string | null;
  booking_status: string | null;
  /** Sensitive — populated only when identity is verified. */
  villa: string | null;
  /** Sensitive — YYYY-MM-DD or null. Never parsed with new Date(). */
  check_in: string | null;
  /** Sensitive — YYYY-MM-DD or null. Never parsed with new Date(). */
  check_out: string | null;
  /**
   * Signed `/booking/view/[token]` URL minted by
   * [lib/butler/booking-view-link.ts] when identity has been established
   * (verified proof OR implicit subscriber/phone continuity on an active
   * booking). Null on every unverified / cancelled / not-found / ambiguous
   * / escalation branch — the URL is a credential and is never surfaced
   * before identity is established. Null is also possible when
   * BOOKING_ACTION_SECRET is missing server-side; in that case the bot
   * must not invent a substitute link.
   */
  booking_view_url: string | null;
  safe_message: string;
}

type ContinuityBookingRow = {
  id: string;
  status: string | null;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
};

type ContinuityResolution =
  | { kind: "not_found" }
  | { kind: "found"; booking: ContinuityBookingRow };

const PROOF_MAX_LEN = 320;

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Lowercase + trim + collapse internal whitespace runs to a single space.
 * Used uniformly on the guest-supplied identity proof and on every stored
 * field it is compared against (guest_email, guest_name, member email,
 * member full_name) so the equality check is exact-after-normalization
 * regardless of which form the guest typed.
 */
function normalizeProofString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  if (!lowered) return null;
  const collapsed = lowered.replace(/\s+/g, " ");
  if (collapsed.length > PROOF_MAX_LEN) return null;
  return collapsed;
}

/**
 * Format a stay date `YYYY-MM-DD` string as a short human-readable label
 * (e.g. `2026-06-10` → `10 Jun 2026`) WITHOUT passing through JS Date
 * parsing. Mirrors the `fmtDate` helper used on the booking-view page so
 * the Butler's safe_message phrasing matches what the guest would see if
 * they clicked the view link. Returns null for missing / malformed input.
 */
function formatStayDateLabel(iso: string | null | undefined): string | null {
  if (typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return `${Number(match[3])} ${months[monthIndex]} ${match[1]}`;
}

/**
 * Compose the enriched safe_message used when identity is established on
 * an active (pending or confirmed) booking. The message folds in the
 * booking reference, villa, stay dates, and signed booking-view URL when
 * they are available, but degrades gracefully when any of them are
 * missing — never inserting "null", "undefined", or an empty placeholder.
 *
 * Two voice variants:
 *   - `lead` = "Thank you — I've verified your booking" (explicit proof match)
 *   - `lead` = "Welcome back" (implicit continuity)
 */
function composeActiveIdentitySafeMessage(args: {
  lead: "verified" | "welcome_back";
  status: "pending" | "confirmed";
  reference: string | null;
  villa: string | null;
  checkIn: string | null;
  checkOut: string | null;
  viewUrl: string | null;
}): string {
  const { lead, status, reference, villa, checkIn, checkOut, viewUrl } = args;

  const stayLabel = (() => {
    const villaPart = typeof villa === "string" && villa.trim().length > 0 ? villa.trim() : null;
    const inLabel = formatStayDateLabel(checkIn);
    const outLabel = formatStayDateLabel(checkOut);
    const datesPart = inLabel && outLabel ? `${inLabel} → ${outLabel}` : null;
    if (villaPart && datesPart) return `${villaPart} (${datesPart})`;
    if (villaPart) return villaPart;
    if (datesPart) return datesPart;
    return null;
  })();

  const referencePart =
    typeof reference === "string" && reference.trim().length > 0 ? ` Reference ${reference}.` : "";

  const stayClause = stayLabel ? ` for ${stayLabel}` : "";

  const opener =
    lead === "verified"
      ? status === "confirmed"
        ? `Thank you — I've verified your booking${stayClause}. Your stay is confirmed.`
        : `Thank you — I've verified your booking${stayClause}. It's still under review.`
      : status === "confirmed"
        ? `Welcome back — your stay${stayClause} is confirmed.`
        : `Welcome back — your booking${stayClause} is still under review.`;

  const viewPart =
    typeof viewUrl === "string" && viewUrl.length > 0 ? ` Full details: ${viewUrl}` : "";

  return `${opener}${referencePart}${viewPart} How can I help today?`;
}

function normalizeBookingStatus(status: string | null | undefined): string {
  if (typeof status !== "string") return "pending";
  const trimmed = status.trim().toLowerCase();
  if (trimmed === "confirmed" || trimmed === "cancelled" || trimmed === "pending") {
    return trimmed;
  }
  // Any unanticipated status is treated as "pending" so an unhandled
  // value never leaks through this surface.
  return "pending";
}

/**
 * Shared helper: given a `whatsapp_leads` lookup column + value, resolve
 * the most-recent linked booking. Used by both the subscriber-id and the
 * phone continuity paths so the lookup-then-load shape only lives in one
 * place. Errors are logged server-side and collapsed to `not_found` so the
 * caller treats "lookup blew up" identically to "no row".
 *
 * For the subscriber path, callers must short-circuit when the column does
 * not yet exist (migration not yet applied) — Supabase returns error
 * code `42703` (undefined_column). The helper logs once at info level and
 * returns `not_found`, which is the safe degradation the orchestrator
 * counts on.
 */
async function resolveLinkedBookingByLeadColumn(
  column: "phone" | "whatsapp_subscriber_id",
  value: string,
): Promise<ContinuityResolution> {
  try {
    const { data: leadRows, error: leadErr } = await supabaseAdmin
      .from("whatsapp_leads")
      .select("linked_booking_id, created_at")
      .eq(column, value)
      .not("linked_booking_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (leadErr) {
      const code = (leadErr as { code?: string }).code;
      if (column === "whatsapp_subscriber_id" && code === "42703") {
        // Pre-migration state — column does not exist yet. Degrade silently.
        console.info(
          "[identity-orchestrator] whatsapp_subscriber_id column missing; falling back to phone/reference path",
        );
      } else {
        console.warn(`[identity-orchestrator] ${column}-lead lookup error:`, leadErr.message);
      }
      return { kind: "not_found" };
    }

    const leadRow = (leadRows ?? [])[0];
    const bookingId =
      leadRow && typeof leadRow.linked_booking_id === "string" && leadRow.linked_booking_id.trim().length > 0
        ? leadRow.linked_booking_id
        : null;
    if (!bookingId) return { kind: "not_found" };

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id, status, villa, check_in, check_out")
      .eq("id", bookingId)
      .maybeSingle<ContinuityBookingRow>();

    if (bookingErr) {
      console.warn(`[identity-orchestrator] ${column}-booking lookup error:`, bookingErr.message);
      return { kind: "not_found" };
    }
    if (!booking) return { kind: "not_found" };

    return { kind: "found", booking };
  } catch (err) {
    console.warn(`[identity-orchestrator] ${column} lookup unexpected error:`, err);
    return { kind: "not_found" };
  }
}

/**
 * Look up the most-recent linked booking for a WhatChimp subscriber id.
 *
 * Lookup strategy: exact-match on `whatsapp_leads.whatsapp_subscriber_id`.
 * The same WhatChimp conversation always carries the same subscriber id,
 * so exact match works by construction.
 *
 * Depends on sql/phase-16a3-whatsapp-subscriber-identity.sql. Until that
 * migration is applied, this returns `not_found` (gracefully — see
 * resolveLinkedBookingByLeadColumn for the missing-column degradation).
 */
async function resolveBookingBySubscriberId(subscriberId: string): Promise<ContinuityResolution> {
  return resolveLinkedBookingByLeadColumn("whatsapp_subscriber_id", subscriberId);
}

/**
 * Look up the most-recent linked booking for an inbound sender phone.
 *
 * Lookup strategy: exact-match on `whatsapp_leads.phone`. Retained for
 * future Butler channels that do expose a sender phone (Telegram,
 * Messenger, direct WhatsApp Cloud API). WhatChimp itself does not
 * deliver a phone variable, so on the WhatChimp channel this path only
 * matches if a phone was captured during the booking-request flow.
 */
async function resolveBookingByPhone(phone: string): Promise<ContinuityResolution> {
  return resolveLinkedBookingByLeadColumn("phone", phone);
}

/**
 * Compare a guest-supplied identity proof against the booking's stored
 * `guest_email` and `guest_name`, and (when the booking is linked to a
 * member) the member's `auth.users.email` and `members.full_name`.
 *
 * All four stored values are normalized the same way as the proof
 * (lowercased, trimmed, whitespace-collapsed) before equality is checked.
 * Any failure (booking missing, Supabase error) returns false — the
 * orchestrator treats that as "not verified" and escalates.
 *
 * Match is exact-after-normalization on purpose. Substring / startsWith
 * matching is intentionally rejected for v1 to prevent name-prefix
 * leakage (e.g. a guest named "John Q." typing "John" would otherwise
 * verify against every other John in the database).
 */
async function verifyIdentityProofMatchesBooking(
  bookingId: string,
  normalizedProof: string,
): Promise<boolean> {
  try {
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("guest_email, guest_name, member_id")
      .eq("id", bookingId)
      .maybeSingle<{ guest_email: string | null; guest_name: string | null; member_id: string | null }>();

    if (error || !booking) return false;

    const guestEmail = normalizeProofString(booking.guest_email);
    if (guestEmail && guestEmail === normalizedProof) return true;

    const guestName = normalizeProofString(booking.guest_name);
    if (guestName && guestName === normalizedProof) return true;

    const memberId =
      typeof booking.member_id === "string" && booking.member_id.trim().length > 0
        ? booking.member_id.trim()
        : null;
    if (!memberId) return false;

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(memberId);
    if (userErr) {
      console.warn("[identity-orchestrator] member email lookup error:", userErr.message);
    } else {
      const memberEmail = normalizeProofString(userResp?.user?.email ?? null);
      if (memberEmail && memberEmail === normalizedProof) return true;
    }

    const { data: memberRow, error: memberErr } = await supabaseAdmin
      .from("members")
      .select("full_name")
      .eq("id", memberId)
      .maybeSingle<{ full_name: string | null }>();
    if (memberErr) {
      console.warn("[identity-orchestrator] members lookup error:", memberErr.message);
      return false;
    }
    const memberFullName = normalizeProofString(memberRow?.full_name ?? null);
    return Boolean(memberFullName && memberFullName === normalizedProof);
  } catch (err) {
    console.warn("[identity-orchestrator] verify identity proof unexpected error:", err);
    return false;
  }
}

function askForReferenceResult(): IdentityResult {
  return {
    state: "ask_for_booking_reference",
    recommended_next_action: "ask_for_booking_reference",
    booking_id: null,
    booking_reference: null,
    booking_status: null,
    villa: null,
    check_in: null,
    check_out: null,
    booking_view_url: null,
    safe_message:
      "Could you share your Oraya booking reference? It's the 8-character code on your confirmation email.",
  };
}

function escalateResult(state: IdentityState, safeMessage: string): IdentityResult {
  return {
    state,
    recommended_next_action: "escalate_human",
    booking_id: null,
    booking_reference: null,
    booking_status: null,
    villa: null,
    check_in: null,
    check_out: null,
    booking_view_url: null,
    safe_message: safeMessage,
  };
}

function knownSenderResolvedResult(booking: ContinuityBookingRow): IdentityResult {
  const status = normalizeBookingStatus(booking.status);
  const reference = formatBookingReference(booking.id);

  if (status === "cancelled") {
    // Continuity reached a cancelled booking — acknowledge, do not surface
    // stale stay details, no verification needed. The view URL is also
    // withheld: the playbook's "do not surface villa/dates on cancelled"
    // rule covers indirect exposure through a freshly minted view link.
    return {
      state: "known_sender_cancelled",
      recommended_next_action: "acknowledge_cancellation",
      booking_id: booking.id,
      booking_reference: reference,
      booking_status: "cancelled",
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      safe_message:
        "I see your earlier booking with us was cancelled. The Oraya team can help with any next steps.",
    };
  }

  // Continuity = implicit identity verification. Safe to surface the
  // booking's non-sensitive context AND a signed view URL for the bot to
  // compose a status reply. The URL is a credential gated by HMAC, so
  // minting it on identity-established branches is the only safe place.
  const viewUrl = buildButlerBookingViewUrl(booking.id);
  const normalizedStatus = status === "confirmed" ? "confirmed" : "pending";
  return {
    state: "known_sender_resolved",
    recommended_next_action: "reply_with_status",
    booking_id: booking.id,
    booking_reference: reference,
    booking_status: status,
    villa: booking.villa,
    check_in: booking.check_in,
    check_out: booking.check_out,
    booking_view_url: viewUrl,
    safe_message: composeActiveIdentitySafeMessage({
      lead: "welcome_back",
      status: normalizedStatus,
      reference,
      villa: booking.villa,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      viewUrl,
    }),
  };
}

/**
 * Orchestrate one turn of WhatsApp identity resolution.
 *
 * Stateless: each call provides every signal the bot has gathered so far.
 * Always resolves; never throws. Operational errors collapse to
 * "ask_for_booking_reference" or "escalate_human" depending on what the
 * caller had already established.
 */
export async function orchestrateButlerIdentity(input: IdentityInput): Promise<IdentityResult> {
  const subscriberId = normalizeOptionalString(input.subscriber_id);
  const phone = normalizeOptionalString(input.phone);
  const referenceRaw = typeof input.booking_reference === "string" ? input.booking_reference : null;
  const referenceProvided = referenceRaw !== null && referenceRaw.trim().length > 0;
  const identityProof = normalizeProofString(input.identity_proof);
  // chat_id is intentionally accepted but unused in routing — it is a
  // diagnostic signal only, captured at the ingest layer so operators can
  // correlate WhatChimp logs with `whatsapp_leads` rows.

  // 1. Primary: subscriber-id continuity (WhatChimp).
  if (subscriberId) {
    const subResolution = await resolveBookingBySubscriberId(subscriberId);
    if (subResolution.kind === "found") {
      return knownSenderResolvedResult(subResolution.booking);
    }
  }

  // 2. Secondary: phone continuity (future channels; WhatChimp does not
  //    deliver a phone variable so this is a no-op there unless the
  //    booking-request flow happened to capture one).
  if (phone) {
    const phoneResolution = await resolveBookingByPhone(phone);
    if (phoneResolution.kind === "found") {
      return knownSenderResolvedResult(phoneResolution.booking);
    }
  }

  // 3. No continuity match. Need a reference.
  if (!referenceProvided) return askForReferenceResult();

  const refResolution = await resolveBookingByReference(referenceRaw);

  if (refResolution.kind === "not_found") {
    return {
      state: "reference_not_found",
      recommended_next_action: "ask_for_alternative_identifier",
      booking_id: null,
      booking_reference: null,
      booking_status: null,
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      safe_message:
        "I couldn't find a booking with that reference. Please double-check the code on your Oraya confirmation email.",
    };
  }

  if (refResolution.kind === "ambiguous") {
    return escalateResult(
      "reference_ambiguous",
      "I'd like to confirm a few details with the Oraya team before I share more. Someone will follow up shortly.",
    );
  }

  // refResolution.kind === "found"
  const status = normalizeBookingStatus(refResolution.status);
  const reference = formatBookingReference(refResolution.booking_id);

  if (status === "cancelled") {
    return {
      state: "reference_cancelled",
      recommended_next_action: "acknowledge_cancellation",
      booking_id: refResolution.booking_id,
      booking_reference: reference,
      booking_status: "cancelled",
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      safe_message:
        "That reference matches a cancelled booking. The Oraya team can help with any next steps.",
    };
  }

  // 4. Pending / confirmed reference match: identity verification gate.
  if (identityProof) {
    const verified = await verifyIdentityProofMatchesBooking(refResolution.booking_id, identityProof);
    if (verified) {
      const viewUrl = buildButlerBookingViewUrl(refResolution.booking_id);
      const normalizedStatus = status === "confirmed" ? "confirmed" : "pending";
      return {
        state: "verified",
        recommended_next_action: "reply_with_status",
        booking_id: refResolution.booking_id,
        booking_reference: reference,
        booking_status: status,
        villa: refResolution.villa,
        check_in: refResolution.check_in,
        check_out: refResolution.check_out,
        booking_view_url: viewUrl,
        safe_message: composeActiveIdentitySafeMessage({
          lead: "verified",
          status: normalizedStatus,
          reference,
          villa: refResolution.villa,
          checkIn: refResolution.check_in,
          checkOut: refResolution.check_out,
          viewUrl,
        }),
      };
    }
    return escalateResult(
      "verification_failed",
      "I couldn't verify those details. The Oraya team will follow up with you to help.",
    );
  }

  // No proof yet → ask for it. Status surfaced (already public knowledge
  // for anyone holding the booking reference), but villa/dates AND the
  // signed view URL are withheld — the URL would otherwise expose the
  // sensitive fields indirectly through the booking-view page.
  return {
    state: status === "confirmed" ? "reference_confirmed_unverified" : "reference_pending_unverified",
    recommended_next_action: "request_identity_proof",
    booking_id: refResolution.booking_id,
    booking_reference: reference,
    booking_status: status,
    villa: null,
    check_in: null,
    check_out: null,
    booking_view_url: null,
    safe_message:
      "Before I share details, could you share the email or the full name used on your booking?",
  };
}
