import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { orchestrateButlerIdentity } from "@/lib/butler/identity-orchestrator";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Phase 16A — Butler confirmed-guest-info boundary endpoint.
 *
 * Purpose: a single secret-guarded surface a verified, *confirmed* guest can
 * use to receive the limited subset of information the Butler is allowed to
 * share at this phase. The endpoint exists so the WhatChimp flow can ask
 * "what can I tell this guest about their confirmed stay?" without the bot
 * branching ad-hoc on individual fields.
 *
 * Identity model: reuses the existing `orchestrateButlerIdentity` priority
 * chain (subscriber-id continuity → phone continuity → booking-reference +
 * identity-proof gate → escalation). This route is intentionally **stricter**
 * than `/api/butler/identify`:
 *
 *   - identity must be established (verified explicit OR implicit continuity), AND
 *   - the booking must be in `confirmed` status.
 *
 * Pending / cancelled / not-found / ambiguous / unverified all collapse to a
 * refusal branch with a safe_message and a non-`deliver_confirmed_guest_info`
 * `recommended_next_action`. The structured sensitive fields (villa, dates,
 * booking_view_url, checkin_guidance, location_access_note) are NULL on every
 * refusal branch.
 *
 * Allowed output for a confirmed verified guest:
 *   - public booking reference (8-char uppercased hex)
 *   - villa name
 *   - check_in / check_out (YYYY-MM-DD; never re-parsed with JS Date)
 *   - signed `/booking/view/[token]` URL (minted by the orchestrator)
 *   - high-level `checkin_guidance` — either the operator-configured text
 *     stored under the `butler_checkin_guidance` settings key, OR a safe
 *     placeholder note when the key is missing/blank
 *   - high-level `location_access_note` explicitly stating that exact
 *     location and access details are only shared after a future approved
 *     configuration ships (Phase 16D)
 *
 * Hard refusals — this endpoint NEVER returns:
 *   - smart-lock PIN, gate code, door code, or any access credential
 *   - exact GPS coordinates or street address
 *   - payment links, payment ledger, payment status detail
 *   - admin notes, internal labels, follow_up_status, raw_payload
 *   - internal booking IDs (only the public 8-char reference is exposed)
 *   - signed confirm/cancel tokens
 *   - email or phone fields belonging to anyone
 *
 * Auth contract (identical to other secret-guarded Butler routes):
 *   - 503 if BUTLER_WEBHOOK_SECRET is unset
 *   - 401 if X-Butler-Secret is missing or wrong
 *   - 400 on invalid JSON / body shape
 *   - 200 otherwise (every outcome, including refusals)
 *
 * This endpoint MUST NOT:
 *   - mutate any booking, lead, token, or settings row
 *   - send email
 *   - call any payment / smart-lock / location surface
 *   - invent / fabricate / substitute check-in guidance, location, or PIN data
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SUBSCRIBER_MAX_LEN = 128;
const CHAT_ID_MAX_LEN = 128;
const PHONE_MAX_LEN = 64;
const REFERENCE_MAX_LEN = 64;
const IDENTITY_PROOF_MAX_LEN = 320;

const CHECKIN_GUIDANCE_SETTINGS_KEY = "butler_checkin_guidance";
const CHECKIN_GUIDANCE_MAX_LEN = 4000;

const UNCONFIGURED_CHECKIN_GUIDANCE_MESSAGE =
  "Detailed check-in guidance for your stay will be shared by the Oraya team closer to your arrival.";

const LOCATION_ACCESS_NOTE =
  "Exact location, gate codes, and smart-lock access details are shared by the Oraya team only after the operational arrival setup for your stay has been approved and configured. The Butler does not hold or quote that information.";

type ConfirmedGuestInfoState =
  | "confirmed_guest_info"
  | "not_confirmed_yet"
  | "cancelled"
  | "ask_for_booking_reference"
  | "ask_for_alternative_identifier"
  | "request_identity_proof"
  | "verification_failed"
  | "escalate_human";

type ConfirmedGuestInfoAction =
  | "deliver_confirmed_guest_info"
  | "wait_for_confirmation"
  | "acknowledge_cancellation"
  | "ask_for_booking_reference"
  | "ask_for_alternative_identifier"
  | "request_identity_proof"
  | "escalate_human";

interface CheckinGuidance {
  configured: boolean;
  message: string;
}

interface ConfirmedGuestInfoResponseBody {
  ok: true;
  state: ConfirmedGuestInfoState;
  recommended_next_action: ConfirmedGuestInfoAction;
  booking_reference: string | null;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  booking_view_url: string | null;
  checkin_guidance: CheckinGuidance | null;
  location_access_note: string | null;
  safe_message: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

function ok(body: ConfirmedGuestInfoResponseBody) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}

function readOptionalCappedString(value: unknown, maxLen: number): string | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "invalid";
  if (value.length > maxLen) return "invalid";
  return value;
}

/**
 * Read the operator-configured check-in guidance from `settings`. Returns
 * the configured text when present and non-empty; otherwise returns null
 * so the caller falls back to the unconfigured placeholder. Any Supabase
 * or driver error collapses to null (logged once) — we never echo raw
 * errors and we never block a confirmed-guest response on this lookup.
 *
 * The `butler_checkin_guidance` key is operator-managed via the existing
 * settings table (no new schema). Until the operator inserts a row, this
 * helper returns null and the response surfaces the safe placeholder.
 */
async function loadConfiguredCheckinGuidance(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", CHECKIN_GUIDANCE_SETTINGS_KEY)
      .maybeSingle<{ value: string | null }>();

    if (error) {
      console.warn("[api/butler/confirmed-guest-info] settings lookup error:", error.message);
      return null;
    }

    const raw = data?.value;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > CHECKIN_GUIDANCE_MAX_LEN) {
      // Truncate-with-ellipsis defensively — the endpoint must never return
      // an unbounded payload to WhatChimp even if an operator pastes a
      // very long body into settings.
      return `${trimmed.slice(0, CHECKIN_GUIDANCE_MAX_LEN - 1)}…`;
    }
    return trimmed;
  } catch (err) {
    console.warn("[api/butler/confirmed-guest-info] settings lookup unexpected error:", err);
    return null;
  }
}

function buildConfirmedSafeMessage(args: {
  bookingReference: string | null;
  villa: string | null;
  checkIn: string | null;
  checkOut: string | null;
  viewUrl: string | null;
  guidanceConfigured: boolean;
}): string {
  const { bookingReference, villa, checkIn, checkOut, viewUrl, guidanceConfigured } = args;

  // Format YYYY-MM-DD without JS Date parsing (mirrors the booking-view
  // page's fmtDate helper). Per the standing time/date discipline rule,
  // stay date strings never pass through new Date().
  function formatStayDateLabel(iso: string | null): string | null {
    if (typeof iso !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return null;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;
    return `${Number(match[3])} ${months[monthIndex]} ${match[1]}`;
  }

  const villaPart = typeof villa === "string" && villa.trim().length > 0 ? villa.trim() : null;
  const inLabel = formatStayDateLabel(checkIn);
  const outLabel = formatStayDateLabel(checkOut);
  const datesPart = inLabel && outLabel ? `${inLabel} → ${outLabel}` : null;

  const stayLabel = (() => {
    if (villaPart && datesPart) return `${villaPart} (${datesPart})`;
    if (villaPart) return villaPart;
    if (datesPart) return datesPart;
    return null;
  })();

  const stayClause = stayLabel ? ` at ${stayLabel}` : "";
  const referenceClause =
    typeof bookingReference === "string" && bookingReference.trim().length > 0
      ? ` Reference ${bookingReference}.`
      : "";

  const opener = `Your stay${stayClause} is confirmed.${referenceClause}`;

  const guidanceClause = guidanceConfigured
    ? " Check-in guidance and arrival notes for your stay are included with this response."
    : " Detailed check-in guidance and arrival access will be shared by the Oraya team closer to your stay.";

  const viewClause =
    typeof viewUrl === "string" && viewUrl.length > 0 ? ` Full details: ${viewUrl}` : "";

  return `${opener}${guidanceClause}${viewClause}`;
}

export async function POST(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  if (!isObject(raw)) return badRequest("invalid_body");

  const subscriberId = readOptionalCappedString(raw.subscriber_id, SUBSCRIBER_MAX_LEN);
  const chatId = readOptionalCappedString(raw.chat_id, CHAT_ID_MAX_LEN);
  const phone = readOptionalCappedString(raw.phone, PHONE_MAX_LEN);
  const bookingReference = readOptionalCappedString(raw.booking_reference, REFERENCE_MAX_LEN);
  const identityProof = readOptionalCappedString(raw.identity_proof, IDENTITY_PROOF_MAX_LEN);
  const identityProofEmailLegacy = readOptionalCappedString(
    raw.identity_proof_email,
    IDENTITY_PROOF_MAX_LEN,
  );

  if (
    subscriberId === "invalid" ||
    chatId === "invalid" ||
    phone === "invalid" ||
    bookingReference === "invalid" ||
    identityProof === "invalid" ||
    identityProofEmailLegacy === "invalid"
  ) {
    return badRequest("invalid_body");
  }

  const identity = await orchestrateButlerIdentity({
    subscriber_id: subscriberId,
    chat_id: chatId,
    phone,
    booking_reference: bookingReference,
    identity_proof: identityProof ?? identityProofEmailLegacy,
  });

  // Identity NOT yet established → forward the orchestrator's safe_message
  // and refusal action verbatim. None of the sensitive fields are surfaced.
  const identityEstablished =
    identity.state === "verified" || identity.state === "known_sender_resolved";

  if (!identityEstablished) {
    // Map the orchestrator's recommended action onto this endpoint's
    // narrower action enum. Any unrecognized action collapses to
    // `escalate_human` to fail safe.
    const mappedAction: ConfirmedGuestInfoAction = (() => {
      switch (identity.recommended_next_action) {
        case "ask_for_booking_reference":
          return "ask_for_booking_reference";
        case "ask_for_alternative_identifier":
          return "ask_for_alternative_identifier";
        case "request_identity_proof":
          return "request_identity_proof";
        case "acknowledge_cancellation":
          return "acknowledge_cancellation";
        case "escalate_human":
          return "escalate_human";
        // `reply_with_status` never reaches here because identityEstablished
        // would have been true. Defensive fall-through to escalation.
        default:
          return "escalate_human";
      }
    })();

    const mappedState: ConfirmedGuestInfoState = (() => {
      switch (identity.state) {
        case "ask_for_booking_reference":
          return "ask_for_booking_reference";
        case "reference_not_found":
          return "ask_for_alternative_identifier";
        case "reference_ambiguous":
          return "escalate_human";
        case "reference_cancelled":
        case "known_sender_cancelled":
          return "cancelled";
        case "reference_pending_unverified":
        case "reference_confirmed_unverified":
          return "request_identity_proof";
        case "verification_failed":
          return "verification_failed";
        default:
          return "escalate_human";
      }
    })();

    return ok({
      ok: true,
      state: mappedState,
      recommended_next_action: mappedAction,
      booking_reference: identity.booking_reference,
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      checkin_guidance: null,
      location_access_note: null,
      safe_message: identity.safe_message,
    });
  }

  // Identity IS established. Now narrow on booking status — the boundary
  // for this endpoint is "confirmed" only. Pending guests are still under
  // review; cancelled guests get an acknowledgement; anything else fails
  // safe to escalation. None of the sensitive fields are surfaced on a
  // refusal branch.
  const normalizedStatus =
    typeof identity.booking_status === "string"
      ? identity.booking_status.trim().toLowerCase()
      : null;

  if (normalizedStatus === "pending") {
    return ok({
      ok: true,
      state: "not_confirmed_yet",
      recommended_next_action: "wait_for_confirmation",
      booking_reference: identity.booking_reference,
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      checkin_guidance: null,
      location_access_note: null,
      safe_message:
        "Your booking is still under review by the Oraya team. Once it's confirmed, I'll share the check-in details. The team will follow up with you shortly.",
    });
  }

  if (normalizedStatus === "cancelled") {
    return ok({
      ok: true,
      state: "cancelled",
      recommended_next_action: "acknowledge_cancellation",
      booking_reference: identity.booking_reference,
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      checkin_guidance: null,
      location_access_note: null,
      safe_message:
        "That booking is recorded as cancelled. The Oraya team can help with any next steps.",
    });
  }

  if (normalizedStatus !== "confirmed") {
    // Any unanticipated status (future allow-list expansion, corrupt row)
    // fails safe — never leak the raw status string, never deliver info.
    return ok({
      ok: true,
      state: "escalate_human",
      recommended_next_action: "escalate_human",
      booking_reference: identity.booking_reference,
      villa: null,
      check_in: null,
      check_out: null,
      booking_view_url: null,
      checkin_guidance: null,
      location_access_note: null,
      safe_message:
        "I'd like to double-check a few details with the Oraya team before sharing more. Someone will follow up with you shortly.",
    });
  }

  // Confirmed + identity-established. Safe to deliver the narrow
  // confirmed-guest allow-list.
  const configuredGuidance = await loadConfiguredCheckinGuidance();
  const checkinGuidance: CheckinGuidance =
    configuredGuidance !== null
      ? { configured: true, message: configuredGuidance }
      : { configured: false, message: UNCONFIGURED_CHECKIN_GUIDANCE_MESSAGE };

  return ok({
    ok: true,
    state: "confirmed_guest_info",
    recommended_next_action: "deliver_confirmed_guest_info",
    booking_reference: identity.booking_reference,
    villa: identity.villa,
    check_in: identity.check_in,
    check_out: identity.check_out,
    booking_view_url: identity.booking_view_url,
    checkin_guidance: checkinGuidance,
    location_access_note: LOCATION_ACCESS_NOTE,
    safe_message: buildConfirmedSafeMessage({
      bookingReference: identity.booking_reference,
      villa: identity.villa,
      checkIn: identity.check_in,
      checkOut: identity.check_out,
      viewUrl: identity.booking_view_url,
      guidanceConfigured: checkinGuidance.configured,
    }),
  });
}
