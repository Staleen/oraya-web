import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import {
  extractStayIntent,
  MAX_STAY_TEXT_LEN,
} from "@/lib/butler/extract-stay-intent";

/**
 * Phase 16A — natural stay-intent extraction for Butler / WhatChimp.
 *
 * Accepts a single free-text guest message (`stay_text`) plus an optional
 * deterministic `reference_date`, and returns a structured envelope the bot
 * can echo back to the guest for confirmation BEFORE any availability check
 * or lead persist is attempted.
 *
 * Contract:
 *   - 503 if BUTLER_WEBHOOK_SECRET is unset.
 *   - 401 if the X-Butler-Secret header is missing or invalid.
 *   - 400 on invalid JSON, invalid body shape, oversize stay_text, or
 *         invalid reference_date format.
 *   - 200 otherwise — including `status: "partial"` and `status: "unclear"`.
 *
 * This endpoint MUST NOT:
 *   - check availability
 *   - read or write Supabase
 *   - send email
 *   - issue or mint tokens
 *   - create or modify a booking
 *
 * AI containment: WhatChimp AI Training / Bot Reply must NOT pre-process,
 * paraphrase, or extract structured fields from `stay_text` before sending
 * it here. The verbatim guest reply is the input; the backend is the only
 * normalization authority. See /docs/system/BUTLER_PLAYBOOK.md.
 *
 * Auth contract reused from /docs/system/DECISIONS_LOG.md
 * (2026-05-12 Butler architecture freeze).
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type IncomingBody = {
  stay_text?: unknown;
  reference_date?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }

  if (!isObject(raw)) return jsonError("invalid_body", 400);
  const body = raw as IncomingBody;

  if (typeof body.stay_text !== "string") {
    return jsonError("invalid_body", 400);
  }
  if (body.stay_text.length > MAX_STAY_TEXT_LEN) {
    return jsonError("stay_text_too_long", 400);
  }

  let referenceDate: string | null = null;
  if (body.reference_date !== undefined && body.reference_date !== null) {
    if (typeof body.reference_date !== "string") {
      return jsonError("invalid_body", 400);
    }
    const trimmed = body.reference_date.trim();
    if (trimmed && !ISO_DATE_RE.test(trimmed)) {
      return jsonError("invalid_reference_date", 400);
    }
    referenceDate = trimmed || null;
  }

  const result = extractStayIntent({
    stay_text: body.stay_text,
    reference_date: referenceDate,
  });

  return NextResponse.json(
    { ok: true, ...result },
    { headers: NO_STORE_HEADERS },
  );
}
