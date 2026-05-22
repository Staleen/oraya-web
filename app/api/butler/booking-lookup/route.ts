import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { formatBookingReference, resolveBookingByReference } from "@/lib/booking-reference";

/**
 * Phase 16A — Butler booking-reference fallback lookup.
 *
 * Use case: WhatsApp continuity for guests the Butler cannot identify via
 * the primary token / lead-linkage path (unknown sender, spouse, changed
 * number). The bot asks the guest for their booking reference and posts
 * it here to receive a deterministic safe-state envelope it is allowed
 * to act on.
 *
 * Knowing a booking reference is NOT proof of identity. This route
 * intentionally returns only the same non-sensitive fields the guest
 * already sees on /booking/view/[token]: villa, check_in, check_out,
 * status. It NEVER returns:
 *   - phone
 *   - email
 *   - payment data (status, ledger, links, references)
 *   - admin notes or raw payload
 *   - exact address / smart-lock PIN
 *   - any internal signed token
 *
 * Identity verification (phone match, booking email match, manual
 * escalation) is the Butler's responsibility BEFORE it uses villa /
 * dates in any guest-facing message. The `recommended_next_action`
 * field is the deterministic switch the bot must honor.
 *
 * Auth contract reused from /docs/system/DECISIONS_LOG.md
 * (2026-05-12 Butler architecture freeze):
 *   - 503 if BUTLER_WEBHOOK_SECRET is unset.
 *   - 401 if X-Butler-Secret is missing or wrong.
 *   - 400 on invalid JSON / body shape.
 *   - 200 otherwise — including not_found and ambiguous outcomes.
 *
 * This endpoint MUST NOT:
 *   - mutate any booking
 *   - read or write any other table than `bookings` (via the
 *     resolver, server-side, service role)
 *   - send email
 *   - issue or mint tokens
 *   - call any payment / WhatsApp / smart-lock surface
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const BOOKING_REFERENCE_MAX_LEN = 64;

type LookupState =
  | "not_found"
  | "ambiguous"
  | "found_pending"
  | "found_confirmed"
  | "found_cancelled";

type LookupAction =
  | "ask_for_alternative_identifier"
  | "escalate_human"
  | "verify_identity"
  | "acknowledge_cancellation";

interface LookupResponseBody {
  ok: true;
  state: LookupState;
  booking_reference: string | null;
  booking_status: string | null;
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  recommended_next_action: LookupAction;
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

function ok(body: LookupResponseBody) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
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

  const bookingReferenceInput = raw.booking_reference;
  if (typeof bookingReferenceInput !== "string") {
    return badRequest("invalid_body");
  }
  if (bookingReferenceInput.length > BOOKING_REFERENCE_MAX_LEN) {
    return badRequest("invalid_body");
  }

  const resolution = await resolveBookingByReference(bookingReferenceInput);

  if (resolution.kind === "not_found") {
    return ok({
      ok: true,
      state: "not_found",
      booking_reference: null,
      booking_status: null,
      villa: null,
      check_in: null,
      check_out: null,
      recommended_next_action: "ask_for_alternative_identifier",
      safe_message:
        "I couldn't find a booking with that reference. Please double-check the code on your Oraya confirmation email, or share another way I can identify your booking.",
    });
  }

  if (resolution.kind === "ambiguous") {
    return ok({
      ok: true,
      state: "ambiguous",
      booking_reference: null,
      booking_status: null,
      villa: null,
      check_in: null,
      check_out: null,
      recommended_next_action: "escalate_human",
      safe_message:
        "I'd like to confirm a few details with the Oraya team before I share more. Someone will follow up with you shortly.",
    });
  }

  // resolution.kind === "found"
  const normalizedStatus = (resolution.status ?? "pending").trim().toLowerCase();
  const reference = formatBookingReference(resolution.booking_id);

  if (normalizedStatus === "confirmed") {
    return ok({
      ok: true,
      state: "found_confirmed",
      booking_reference: reference,
      booking_status: "confirmed",
      villa: resolution.villa,
      check_in: resolution.check_in,
      check_out: resolution.check_out,
      recommended_next_action: "verify_identity",
      safe_message:
        "I see a confirmed booking matching that reference. Before I share details, I'll need to verify it's yours.",
    });
  }

  if (normalizedStatus === "cancelled") {
    return ok({
      ok: true,
      state: "found_cancelled",
      booking_reference: reference,
      booking_status: "cancelled",
      villa: resolution.villa,
      check_in: resolution.check_in,
      check_out: resolution.check_out,
      recommended_next_action: "acknowledge_cancellation",
      safe_message:
        "That reference matches a cancelled booking. The Oraya team can help with any next steps.",
    });
  }

  // Any non-confirmed, non-cancelled status (today: only `pending` is in
  // the bookings.status allow-list, but the helper tolerates future
  // additions without leaking them through this surface) is treated as
  // the pending fallback.
  return ok({
    ok: true,
    state: "found_pending",
    booking_reference: reference,
    booking_status: "pending",
    villa: resolution.villa,
    check_in: resolution.check_in,
    check_out: resolution.check_out,
    recommended_next_action: "verify_identity",
    safe_message:
      "I see a pending booking matching that reference. Before I share details, I'll need to verify it's yours.",
  });
}
