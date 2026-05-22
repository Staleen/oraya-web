import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { orchestrateButlerIdentity } from "@/lib/butler/identity-orchestrator";

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
 * check_in, check_out are returned only when identity is verified —
 * either implicitly via subscriber/phone continuity or explicitly via an
 * identity proof (email or full name) that matches the booking. Pending
 * or confirmed references with no verification return null sensitive
 * fields and `recommended_next_action="request_identity_proof"`.
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
 * This endpoint MUST NOT:
 *   - mutate any booking, lead, or token
 *   - send email
 *   - mint or rotate tokens
 *   - call any payment / smart-lock / location surface
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SUBSCRIBER_MAX_LEN = 128;
const CHAT_ID_MAX_LEN = 128;
const PHONE_MAX_LEN = 64;
const REFERENCE_MAX_LEN = 64;
const IDENTITY_PROOF_MAX_LEN = 320;

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

  const result = await orchestrateButlerIdentity({
    subscriber_id: subscriberId,
    chat_id: chatId,
    phone,
    booking_reference: bookingReference,
    identity_proof: identityProof ?? identityProofEmailLegacy,
  });

  return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
}
