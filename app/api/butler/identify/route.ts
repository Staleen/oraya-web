import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { orchestrateButlerIdentity } from "@/lib/butler/identity-orchestrator";
import { extractBookingReferenceFromText } from "@/lib/butler/extract-booking-reference";

/**
 * Phase 16A — WhatsApp identity orchestration.
 *
 * One call per turn. The bot passes whatever signals it has gathered so
 * far (WhatChimp subscriber id + optional chat id, optional sender phone
 * for future channels, guest-supplied booking reference, guest-supplied
 * identity proof — email OR full name). The route returns the
 * deterministic next action plus the only sentence the Butler is
 * allowed to echo about the outcome.
 *
 * Priority order is enforced in lib/butler/identity-orchestrator.ts:
 *   1. WhatChimp subscriber-id continuity (primary)
 *   2. Phone continuity (future channels)
 *   3. Booking-reference fallback + identity-proof gate
 *   4. Human escalation
 *
 * Sensitive disclosure rule (also enforced in the orchestrator): villa,
 * check_in, check_out, and booking_view_url are returned only when
 * identity is verified — either implicitly via subscriber/phone
 * continuity or explicitly via an identity proof (email or full name)
 * that matches the booking. Pending or confirmed references with no
 * verification return null sensitive fields and
 * `recommended_next_action="request_identity_proof"`. The
 * booking_view_url is treated as sensitive because it is a signed
 * credential for `/booking/view/[token]`, which renders the full booking
 * summary.
 *
 * Response shape (always wrapped as `{ ok: true, ...result }` on 200):
 *   - state, recommended_next_action — control fields the bot branches on
 *   - booking_id, booking_reference, booking_status — non-sensitive
 *     identifiers; safe to surface once an active booking is matched
 *   - villa, check_in, check_out — null unless identity is established
 *   - booking_view_url — null unless identity is established AND the
 *     booking is active (pending or confirmed). Always null on cancelled,
 *     not_found, ambiguous, request_identity_proof, escalate_human, and
 *     ask_for_booking_reference branches. The bot must not synthesize a
 *     substitute link when this field is null (the helper returns null
 *     when BOOKING_ACTION_SECRET is missing server-side).
 *   - safe_message — the only sentence the bot may echo about the outcome
 *
 * Contract:
 *   - 503 if BUTLER_WEBHOOK_SECRET is unset
 *   - 401 if X-Butler-Secret is missing or wrong
 *   - 400 on invalid JSON / body shape
 *   - 200 otherwise (every orchestration outcome, including escalations)
 *
 * Backwards-compat note: the legacy `identity_proof_email` body field is
 * accepted as a fallback for `identity_proof` while the WhatChimp flow
 * is migrated to the v2 JSON. The route prefers `identity_proof` when
 * both are present.
 *
 * Inbound-message convenience (Phase 16A.x):
 *   - An optional `message_text` body field is accepted. It is intended
 *     to carry the verbatim inbound WhatsApp message that triggered the
 *     Butler flow (e.g. `"Hello Oraya — booking reference A0B8CECB"`),
 *     populated by WhatChimp via its inbound-message system variable.
 *   - It is consulted ONLY when `booking_reference` was not provided in
 *     the body. When consulted, the route extracts the first
 *     word-boundary-anchored 8-character hex token via
 *     `lib/butler/extract-booking-reference.ts` and forwards that as the
 *     `booking_reference` to the orchestrator. Existing callers that
 *     pass `booking_reference` explicitly continue to win — `message_text`
 *     never overrides an explicit reference.
 *   - If `message_text` is present but contains no standalone hex token,
 *     the route proceeds exactly as if it had been absent. No fallback
 *     hex-stripping. No naive normalization. No silent mis-identification.
 *   - The field is capped server-side. Existing callers that do not send
 *     it are entirely unaffected — the field is additive and optional.
 *
 * This endpoint MUST NOT:
 *   - mutate any booking, lead, or token
 *   - send email
 *   - mint or rotate confirm/cancel tokens (the signed view URL minted by
 *     the orchestrator is the only credential this surface produces, and
 *     only on identity-established branches)
 *   - call any payment / smart-lock / location surface
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SUBSCRIBER_MAX_LEN = 128;
const CHAT_ID_MAX_LEN = 128;
const PHONE_MAX_LEN = 64;
const REFERENCE_MAX_LEN = 64;
const IDENTITY_PROOF_MAX_LEN = 320;
// WhatsApp messages have an upper bound around ~4096 chars; 2048 is more
// than enough for any realistic trigger message ("Hello Oraya — booking
// reference A0B8CECB" + multilingual variants) and protects the route
// from oversized payloads being shipped from WhatChimp.
const MESSAGE_TEXT_MAX_LEN = 2048;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

function readOptionalCappedString(value: unknown, maxLen: number): string | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "invalid";
  if (value.length > maxLen) return "invalid";
  return value;
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
  const messageText = readOptionalCappedString(raw.message_text, MESSAGE_TEXT_MAX_LEN);

  if (
    subscriberId === "invalid" ||
    chatId === "invalid" ||
    phone === "invalid" ||
    bookingReference === "invalid" ||
    identityProof === "invalid" ||
    identityProofEmailLegacy === "invalid" ||
    messageText === "invalid"
  ) {
    return badRequest("invalid_body");
  }

  // Derive a booking_reference from `message_text` ONLY when no explicit
  // reference was provided. Explicit reference always wins. If
  // `message_text` contains no clean standalone 8-char hex token, this
  // call returns null and the orchestrator proceeds exactly as before
  // (it asks the guest for the reference). No naive hex-stripping is
  // performed anywhere on this path.
  const hasExplicitReference =
    typeof bookingReference === "string" && bookingReference.trim().length > 0;
  const derivedBookingReference = hasExplicitReference
    ? bookingReference
    : extractBookingReferenceFromText(messageText);

  const result = await orchestrateButlerIdentity({
    subscriber_id: subscriberId,
    chat_id: chatId,
    phone,
    booking_reference: derivedBookingReference,
    identity_proof: identityProof ?? identityProofEmailLegacy,
  });

  return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
}
