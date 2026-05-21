/**
 * Phase 16A — Butler token continuity resolver.
 *
 * Read-only helper: given an opaque Butler prefill token, verifies it via
 * the existing prefill-token contract, resolves the lead row from
 * whatsapp_leads, detects whether a linked booking exists, and returns a
 * single normalized safe result.
 *
 * Why: future Butler operational surfaces (admin, optional read routes,
 * WhatsApp ops tooling) need one answer to "what is this guest's
 * continuation state?" without re-implementing verify + lookup + linkage
 * three different ways. Centralizing it keeps the token-security contract
 * in one place and prevents silent drift between callers.
 *
 * Boundaries:
 *   - Reuses lib/butler/prefill-token.ts; does not alter the token format,
 *     TTL, signature scheme, or env-var contract.
 *   - Reuses the existing whatsapp_leads and bookings columns; no schema change.
 *   - Never exposes phone, email, raw_payload, admin_notes, follow_up_status,
 *     labels, member_id, payment ledger, or any other operator-only field.
 *   - Stay dates pass through untouched as YYYY-MM-DD strings; never
 *     parsed with `new Date(...)`.
 *   - Does not call /api/bookings or any booking-write path. A non-null
 *     `booking_id` in the result means the helper verified the bookings row
 *     exists AND is not cancelled; a stored `whatsapp_leads.linked_booking_id`
 *     by itself is never trusted as proof of a resumable booking.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPrefillToken } from "@/lib/butler/prefill-token";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Token signature / freshness verdict. */
export type ButlerContinuityValidity = "valid" | "invalid" | "expired";

/**
 * Operator-facing next step. The combination of `validity`, `lead_id`,
 * `booking_id`, and this field makes all five required states distinguishable
 * without expanding the safe result shape:
 *
 *   - invalid token              → validity="invalid", action="reissue_token"
 *   - expired token              → validity="expired", action="reissue_token"
 *   - lead missing OR
 *     linked booking missing OR
 *     linked booking cancelled   → validity="valid", lead_id=set, booking_id=null, action="restart_conversation"
 *   - lead found (no link yet)   → validity="valid", lead_id=set, booking_id=null, action="continue_prefill"
 *   - linked booking exists and
 *     is not cancelled           → validity="valid", lead_id=set, booking_id=set,  action="resume_booking"
 *
 * "restart_conversation" is also the safe fallback when either Supabase
 * lookup itself fails (lead or booking) — the caller cannot trust partial
 * state, so it is sent down the same operator path as a genuine missing
 * lead. The error is logged server-side for diagnosis.
 */
export type ButlerContinuityRecommendedAction =
  | "reissue_token"
  | "restart_conversation"
  | "continue_prefill"
  | "resume_booking";

/**
 * The only shape callers should consume. Fields are intentionally
 * constrained — anything not listed here is operator-internal and must
 * not leak through this helper.
 */
export interface ButlerContinuityResult {
  validity: ButlerContinuityValidity;
  purpose: "prefill" | null;
  lead_id: string | null;
  booking_id: string | null;
  villa: string | null;
  /** YYYY-MM-DD or null. Never a parsed Date. */
  check_in: string | null;
  /** YYYY-MM-DD or null. Never a parsed Date. */
  check_out: string | null;
  sleeping_guests: string | null;
  full_name: string | null;
  source: string | null;
  recommended_next_action: ButlerContinuityRecommendedAction;
}

type LeadContinuityRow = {
  villa: string | null;
  normalized_check_in: string | null;
  normalized_check_out: string | null;
  guest_count: string | null;
  name: string | null;
  source: string | null;
  linked_booking_id: string | null;
};

type LinkedBookingRow = {
  id: string;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  sleeping_guests: number | null;
  guest_name: string | null;
  status: string | null;
};

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

function sanitizeDateRange(
  checkIn: string | null,
  checkOut: string | null,
): { check_in: string | null; check_out: string | null } {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return { check_in: null, check_out: null };
  }
  if (checkOut <= checkIn) {
    return { check_in: null, check_out: null };
  }
  return { check_in: checkIn, check_out: checkOut };
}

function sanitizeSleepingGuests(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function emptyResult(
  validity: ButlerContinuityValidity,
  recommendedAction: ButlerContinuityRecommendedAction,
): ButlerContinuityResult {
  return {
    validity,
    purpose: null,
    lead_id: null,
    booking_id: null,
    villa: null,
    check_in: null,
    check_out: null,
    sleeping_guests: null,
    full_name: null,
    source: null,
    recommended_next_action: recommendedAction,
  };
}

/**
 * Verify + resolve in one call. Always resolves; never throws.
 *
 * Failure modes that are not "invalid token" or "expired token" — e.g.
 * Supabase outage — return `validity="valid"`, `lead_id` populated from the
 * verified claims, and `recommended_next_action="restart_conversation"`.
 * That keeps the caller's branching simple while still surfacing the
 * verified-token half of the answer.
 */
export async function resolveButlerTokenContinuity(
  token: string | null | undefined,
): Promise<ButlerContinuityResult> {
  if (typeof token !== "string" || !token.trim()) {
    return emptyResult("invalid", "reissue_token");
  }

  const verification = verifyPrefillToken(token);
  if (!verification.ok) {
    return emptyResult(
      verification.reason === "expired" ? "expired" : "invalid",
      "reissue_token",
    );
  }

  const leadId = verification.claims.lead_id;
  const purpose = verification.claims.purpose;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_leads")
      .select(
        "villa, normalized_check_in, normalized_check_out, guest_count, name, source, linked_booking_id",
      )
      .eq("id", leadId)
      .maybeSingle<LeadContinuityRow>();

    if (error) {
      console.error("[lib/butler/token-continuity] lead lookup error:", error.message);
      return {
        ...emptyResult("valid", "restart_conversation"),
        purpose,
        lead_id: leadId,
      };
    }

    if (!data) {
      return {
        ...emptyResult("valid", "restart_conversation"),
        purpose,
        lead_id: leadId,
      };
    }

    const leadDates = sanitizeDateRange(data.normalized_check_in, data.normalized_check_out);
    const leadVilla = data.villa ?? null;
    const leadSleepingGuests = sanitizeSleepingGuests(data.guest_count);
    const leadFullName = data.name ?? null;
    const leadSource = data.source ?? null;

    const linkedBookingIdRaw =
      typeof data.linked_booking_id === "string" && data.linked_booking_id.trim().length > 0
        ? data.linked_booking_id
        : null;

    // No linked booking yet — surface the lead's prefill data so the caller
    // can continue the website handoff.
    if (!linkedBookingIdRaw) {
      return {
        validity: "valid",
        purpose,
        lead_id: leadId,
        booking_id: null,
        villa: leadVilla,
        check_in: leadDates.check_in,
        check_out: leadDates.check_out,
        sleeping_guests: leadSleepingGuests,
        full_name: leadFullName,
        source: leadSource,
        recommended_next_action: "continue_prefill",
      };
    }

    // A stored linked_booking_id is not proof of a resumable booking.
    // Verify the row actually exists and is not cancelled before we let any
    // caller treat this as resume-able. The lead's data is still surfaced
    // when the link is broken so the operator can see what the guest
    // originally asked for, but booking_id is forced to null and the action
    // is restart_conversation.
    const brokenLinkResult: ButlerContinuityResult = {
      validity: "valid",
      purpose,
      lead_id: leadId,
      booking_id: null,
      villa: leadVilla,
      check_in: leadDates.check_in,
      check_out: leadDates.check_out,
      sleeping_guests: leadSleepingGuests,
      full_name: leadFullName,
      source: leadSource,
      recommended_next_action: "restart_conversation",
    };

    const bookingLookup = await supabaseAdmin
      .from("bookings")
      .select("id, villa, check_in, check_out, sleeping_guests, guest_name, status")
      .eq("id", linkedBookingIdRaw)
      .maybeSingle<LinkedBookingRow>();

    if (bookingLookup.error) {
      console.warn(
        "[lib/butler/token-continuity] linked booking lookup error:",
        bookingLookup.error.message,
      );
      return brokenLinkResult;
    }

    const bookingRow = bookingLookup.data;
    if (!bookingRow) {
      console.warn("[lib/butler/token-continuity] linked booking missing for lead:", {
        lead_id: leadId,
        linked_booking_id: linkedBookingIdRaw,
      });
      return brokenLinkResult;
    }

    if (typeof bookingRow.status === "string" && bookingRow.status.toLowerCase() === "cancelled") {
      return brokenLinkResult;
    }

    const bookingDates = sanitizeDateRange(bookingRow.check_in, bookingRow.check_out);
    const bookingSleepingGuests =
      typeof bookingRow.sleeping_guests === "number" && Number.isFinite(bookingRow.sleeping_guests)
        ? String(bookingRow.sleeping_guests)
        : leadSleepingGuests;

    return {
      validity: "valid",
      purpose,
      lead_id: leadId,
      booking_id: bookingRow.id,
      villa: bookingRow.villa ?? leadVilla,
      check_in: bookingDates.check_in ?? leadDates.check_in,
      check_out: bookingDates.check_out ?? leadDates.check_out,
      sleeping_guests: bookingSleepingGuests,
      full_name: bookingRow.guest_name ?? leadFullName,
      source: leadSource,
      recommended_next_action: "resume_booking",
    };
  } catch (error) {
    console.error("[lib/butler/token-continuity] unexpected error:", error);
    return {
      ...emptyResult("valid", "restart_conversation"),
      purpose,
      lead_id: leadId,
    };
  }
}
