import { NextResponse } from "next/server";
import { requireButlerAuth } from "@/lib/butler/auth";
import { CANONICAL_EVENT_TYPES } from "@/lib/event-types";

/**
 * Phase 16A.1 — read-only canonical event types.
 *
 * Source of truth: lib/event-types.ts (CANONICAL_EVENT_TYPES).
 * The Butler must never invent or paraphrase event types — render exactly what
 * this endpoint returns, or escalate to a human.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authFail = requireButlerAuth(request);
  if (authFail) return authFail;

  const event_types = CANONICAL_EVENT_TYPES.map(({ value, label, description }) => ({
    value,
    label,
    description,
  }));

  return NextResponse.json(
    { event_types },
    { headers: { "Cache-Control": "no-store" } },
  );
}
