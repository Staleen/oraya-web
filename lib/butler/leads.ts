/**
 * Phase 16A.2.e — shared types + input normalization for the WhatsApp lead
 * surface (`POST /api/butler/lead` and the `/api/admin/leads*` admin routes).
 *
 * This file is intentionally framework-free (no Next.js / no Supabase imports)
 * so the input shape is easy to test and easy to share across the ingest path
 * and the admin path without circular imports.
 */

/** Allow-listed follow-up status values — must stay in sync with the
 *  `whatsapp_leads_follow_up_status_check` constraint in
 *  `sql/phase-16a2e-whatsapp-leads.sql`. */
export const FOLLOW_UP_STATUSES = [
  "new",
  "contacted",
  "needs_action",
  "converted",
  "lost",
  "spam",
] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return typeof value === "string" && (FOLLOW_UP_STATUSES as readonly string[]).includes(value);
}

/** Row shape returned by the admin GET (mirrors the columns in
 *  `whatsapp_leads`, minus `raw_payload` which is server-internal). */
export interface WhatsappLeadAdminRow {
  id: string;
  created_at: string;
  updated_at: string;
  source: string;
  phone: string | null;
  name: string | null;
  request_type: string | null;
  villa: string | null;
  check_in_text: string | null;
  check_out_text: string | null;
  normalized_check_in: string | null;
  normalized_check_out: string | null;
  guest_count: string | null;
  addons_interest: string | null;
  special_requests: string | null;
  follow_up_status: FollowUpStatus;
  labels: string[];
  linked_booking_id: string | null;
  admin_notes: string | null;
}

/** Subset of columns the admin PATCH endpoint is allowed to write. v1 keeps
 *  this list tight: identity (source/phone/name/dates) and the raw_payload
 *  are intentionally NOT mutable via PATCH. */
export interface WhatsappLeadAdminPatch {
  follow_up_status?: FollowUpStatus;
  labels?: string[];
  admin_notes?: string | null;
  linked_booking_id?: string | null;
}

/** Normalized insert row written by `POST /api/butler/lead`. */
export interface NormalizedLeadInput {
  source: string;
  phone: string | null;
  name: string | null;
  request_type: string | null;
  villa: string | null;
  check_in_text: string | null;
  check_out_text: string | null;
  normalized_check_in: string | null;
  normalized_check_out: string | null;
  guest_count: string | null;
  addons_interest: string | null;
  special_requests: string | null;
  labels: string[];
  raw_payload: Record<string, unknown>;
  linked_booking_id: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const MAX_SHORT_FIELD_LEN = 200;
const MAX_LONG_FIELD_LEN  = 4000;
const MAX_LABEL_LEN       = 80;
const MAX_LABELS          = 32;

function readOptionalString(
  value: unknown,
  maxLen: number = MAX_SHORT_FIELD_LEN,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, maxLen);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function pickFirstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
  maxLen: number = MAX_SHORT_FIELD_LEN,
): string | null {
  for (const k of keys) {
    if (k in obj) {
      const v = readOptionalString(obj[k], maxLen);
      if (v !== null) return v;
    }
  }
  return null;
}

/** Validate calendar correctness of a YYYY-MM-DD string. We never call
 *  `new Date(<guest text>)` — this validation uses a strict regex + a UTC
 *  round-trip check (`isValidYmdComponents`-style), matching the discipline
 *  used elsewhere in the Butler surface. */
function readOptionalIsoDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [yStr, mStr, dStr] = trimmed.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1970 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const stamp = Date.UTC(y, m - 1, d);
  const round = new Date(stamp);
  if (
    round.getUTCFullYear() !== y ||
    round.getUTCMonth() !== m - 1 ||
    round.getUTCDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

function readOptionalUuid(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function readLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_LABEL_LEN));
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}

function readRawPayload(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Convert a Butler-supplied JSON body into the normalized insert row for
 * `whatsapp_leads`. Accepts both the canonical WhatChimp keys
 * (`oraya_full_name`, `oraya_check_in_text`, …) and short aliases
 * (`name`, `check_in_text`, …). Unknown fields are kept inside
 * `raw_payload` so the operator can still see them later in Supabase.
 *
 * Returns null if the body is not a plain object — the route should reply
 * 400 invalid_request in that case.
 */
export function normalizeLeadInput(body: unknown): NormalizedLeadInput | null {
  if (!isPlainObject(body)) return null;

  const source = readOptionalString(body.source) ?? "whatchimp";

  const name             = pickFirstString(body, ["oraya_full_name", "full_name", "name"]);
  const phone            = pickFirstString(body, ["phone", "oraya_phone", "whatsapp_number"]);
  const requestType      = pickFirstString(body, ["oraya_request_type", "request_type"]);
  const villa            = pickFirstString(body, ["oraya_villa", "villa"]);
  const checkInText      = pickFirstString(body, ["oraya_check_in_text", "check_in_text"]);
  const checkOutText     = pickFirstString(body, ["oraya_check_out_text", "check_out_text"]);
  const guestCount       = pickFirstString(body, ["oraya_guest_count", "guest_count", "guests"]);
  const addonsInterest   = pickFirstString(body, ["oraya_addons_interest", "addons_interest"], MAX_LONG_FIELD_LEN);
  const specialRequests  = pickFirstString(body, ["oraya_special_requests", "special_requests"], MAX_LONG_FIELD_LEN);

  const normalizedCheckIn  = readOptionalIsoDate(body.normalized_check_in);
  const normalizedCheckOut = readOptionalIsoDate(body.normalized_check_out);

  const labels = readLabels(body.labels);

  const linkedBookingId = readOptionalUuid(body.linked_booking_id);

  // Store the full original payload so operators can audit what WhatChimp
  // actually sent — but cap it to the JSON-serializable subset to avoid
  // surprises.
  const rawPayload = readRawPayload(body.raw_payload, body);

  return {
    source,
    phone,
    name,
    request_type: requestType,
    villa,
    check_in_text: checkInText,
    check_out_text: checkOutText,
    normalized_check_in: normalizedCheckIn,
    normalized_check_out: normalizedCheckOut,
    guest_count: guestCount,
    addons_interest: addonsInterest,
    special_requests: specialRequests,
    labels,
    raw_payload: rawPayload,
    linked_booking_id: linkedBookingId,
  };
}

/**
 * Convert an admin-supplied JSON body into the patch shape. Returns either
 * a `WhatsappLeadAdminPatch` (with at least one field set) or `"invalid"`
 * if any provided field has an invalid value. Returns `"empty"` if the
 * body is a plain object with no recognized fields.
 */
export function readLeadAdminPatch(body: unknown): WhatsappLeadAdminPatch | "invalid" | "empty" {
  if (!isPlainObject(body)) return "invalid";

  const patch: WhatsappLeadAdminPatch = {};
  let touched = false;

  if ("follow_up_status" in body) {
    const v = body.follow_up_status;
    if (!isFollowUpStatus(v)) return "invalid";
    patch.follow_up_status = v;
    touched = true;
  }

  if ("labels" in body) {
    if (!Array.isArray(body.labels)) return "invalid";
    patch.labels = readLabels(body.labels);
    touched = true;
  }

  if ("admin_notes" in body) {
    const v = body.admin_notes;
    if (v === null) {
      patch.admin_notes = null;
    } else {
      const s = readOptionalString(v, MAX_LONG_FIELD_LEN);
      if (s === null && v !== "") return "invalid";
      patch.admin_notes = s;
    }
    touched = true;
  }

  if ("linked_booking_id" in body) {
    const v = body.linked_booking_id;
    if (v === null) {
      patch.linked_booking_id = null;
    } else {
      const uid = readOptionalUuid(v);
      if (uid === null) return "invalid";
      patch.linked_booking_id = uid;
    }
    touched = true;
  }

  if (!touched) return "empty";
  return patch;
}
