/**
 * Phase 16A.2.d — response shapes for the read-only Butler availability
 * yes/no surface (`POST /api/butler/availability`).
 *
 * These messages are the only sentences the AI Butler is allowed to repeat
 * back to the guest about availability. They are intentionally hedged
 * ("appear available", "do not appear available") — the locked
 * `/api/bookings` POST remains the only authority on whether a booking
 * can actually be created.
 *
 * Pure builders. No Supabase, no network, no I/O. Easy to test in isolation.
 */

export type ButlerAvailabilityStatus = "available" | "unavailable" | "unclear";

export interface ButlerAvailabilityEcho {
  villa: string;
  check_in: string;
  check_out: string;
}

export interface ButlerAvailabilityResolvedResponse {
  ok: true;
  status: "available" | "unavailable";
  villa: string;
  check_in: string;
  check_out: string;
  safe_message: string;
}

export interface ButlerAvailabilityUnclearResponse {
  ok: true;
  status: "unclear";
  safe_message: string;
}

export type ButlerAvailabilityResponse =
  | ButlerAvailabilityResolvedResponse
  | ButlerAvailabilityUnclearResponse;

const AVAILABLE_MESSAGE =
  "These dates appear available. The Oraya team will still confirm before anything is treated as reserved.";

const UNAVAILABLE_MESSAGE =
  "These dates do not appear available. The Oraya team can suggest alternatives.";

const UNCLEAR_MESSAGE =
  "I could not safely check those dates. The Oraya team will review this manually.";

export function buildAvailableResponse(echo: ButlerAvailabilityEcho): ButlerAvailabilityResolvedResponse {
  return {
    ok: true,
    status: "available",
    villa: echo.villa,
    check_in: echo.check_in,
    check_out: echo.check_out,
    safe_message: AVAILABLE_MESSAGE,
  };
}

export function buildUnavailableResponse(echo: ButlerAvailabilityEcho): ButlerAvailabilityResolvedResponse {
  return {
    ok: true,
    status: "unavailable",
    villa: echo.villa,
    check_in: echo.check_in,
    check_out: echo.check_out,
    safe_message: UNAVAILABLE_MESSAGE,
  };
}

export function buildUnclearResponse(): ButlerAvailabilityUnclearResponse {
  return {
    ok: true,
    status: "unclear",
    safe_message: UNCLEAR_MESSAGE,
  };
}
