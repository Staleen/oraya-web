import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { normalizeStayDates } from "@/lib/butler/normalize-dates";

/**
 * Phase 16A — read-only natural date normalization for Butler / WhatChimp.
 *
 * Accepts raw guest text for check-in / check-out (and an optional
 * deterministic `reference_date` for tests) and returns a structured
 * suggestion the Butler must echo back to the guest for confirmation
 * BEFORE any availability check is performed.
 *
 * Contract:
 *   - 503 if BUTLER_WEBHOOK_SECRET is unset.
 *   - 401 if the X-Butler-Secret header is missing or invalid.
 *   - 400 on invalid JSON / body shape / reference_date format.
 *   - 200 otherwise — including `status: "unclear"` outcomes.
 *
 * This endpoint MUST NOT:
 *   - check availability
 *   - read or write Supabase
 *   - send email
 *   - issue or mint tokens
 *   - create or modify a booking
 *
 * Auth contract reused from /docs/system/DECISIONS_LOG.md
 * (2026-05-12 Butler architecture freeze).
 */

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type IncomingBody = {
  check_in_text?: unknown;
  check_out_text?: unknown;
  reference_date?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown, maxLen = 120): string | null | "invalid" {
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
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isObject(raw)) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = raw as IncomingBody;

  const checkInText = readOptionalString(body.check_in_text);
  const checkOutText = readOptionalString(body.check_out_text);
  const referenceDate = readOptionalString(body.reference_date, 32);

  if (checkInText === "invalid" || checkOutText === "invalid" || referenceDate === "invalid") {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (referenceDate !== null && !ISO_DATE_RE.test(referenceDate.trim())) {
    return NextResponse.json(
      { ok: false, error: "invalid_reference_date" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = normalizeStayDates({
    check_in_text: checkInText,
    check_out_text: checkOutText,
    reference_date: referenceDate,
  });

  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
