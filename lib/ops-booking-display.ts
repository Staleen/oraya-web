/**
 * Pure display derivations for /ops booking surfaces.
 *
 * Two truths the raw booking row hides:
 *
 * 1. `amount_total` is empty until payment activity starts, so a fresh
 *    request honestly "costs $0" unless the pricing snapshot is consulted —
 *    the same estimate the confirmation email computes.
 * 2. `message` on converted/website bookings is a machine "[Stay Setup]"
 *    block, not the guest's words. Rendering it raw buries the one line the
 *    guest actually wrote.
 *
 * Both are display-only. Estimates must never be presented as recorded money
 * and never feed record_payment expected values.
 */

export interface MoneyView {
  /** Dollars, or null when neither recorded nor estimable. */
  amount: number | null;
  /** True when the amount is a snapshot estimate, not recorded money. */
  estimated: boolean;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Sum of priced add-ons; null when any add-on is price-on-request (mirrors the email). */
function addonsTotal(snapshot: unknown): number | null {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return 0;
  let total = 0;
  for (const item of snapshot) {
    if (!item || typeof item !== "object") continue;
    const price = (item as Record<string, unknown>).price;
    if (typeof price !== "number") return null;
    total += price;
  }
  return total;
}

export function bookingMoneyView(booking: {
  amount_total?: number | null;
  pricing_subtotal?: number | string | null;
  pricing_snapshot?: { subtotal?: number | string | null } | null;
  addons_snapshot?: unknown;
}): MoneyView {
  const recorded = parseAmount(booking.amount_total);
  if (recorded !== null) return { amount: recorded, estimated: false };

  const subtotal = parseAmount(booking.pricing_snapshot?.subtotal ?? booking.pricing_subtotal);
  if (subtotal === null) return { amount: null, estimated: false };
  const addons = addonsTotal(booking.addons_snapshot);
  if (addons === null) return { amount: subtotal, estimated: true };
  return { amount: subtotal + addons, estimated: true };
}

/* ───────────────────────────── [Stay Setup] ───────────────────────────── */

export interface StaySetupView {
  bedrooms: string | null;
  estimatedGuests: string | null;
  /** The guest's actual words, or null when they wrote nothing. */
  guestNotes: string | null;
  addonsInterest: string | null;
}

const FIELD_PREFIXES: Array<[keyof StaySetupView, RegExp]> = [
  ["bedrooms", /^Bedrooms to be used:\s*/i],
  ["estimatedGuests", /^Estimated guests:\s*/i],
  ["guestNotes", /^Guest Notes:\s*/i],
  ["addonsInterest", /^Add-ons interest:\s*/i],
];

/** "None" / "Not specified…" placeholder values read as absent. */
function meaningful(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^none\b\.?$/i.test(trimmed)) return null;
  if (/^not specified/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Parse a "[Stay Setup]" machine message into its fields. Returns null when
 * the message is not a stay-setup block (callers then render it raw). Any
 * "[Booking Protocol]" (or other bracketed system) section is dropped — it
 * describes the system, not the guest.
 */
export function parseStaySetupMessage(message: string | null | undefined): StaySetupView | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed.startsWith("[Stay Setup]")) return null;

  // Keep only the stay-setup section; later bracketed sections are system talk.
  const body = trimmed.slice("[Stay Setup]".length);
  const nextSection = body.search(/\n\s*\[[A-Za-z][^\]]*\]/);
  const section = nextSection === -1 ? body : body.slice(0, nextSection);

  const view: StaySetupView = {
    bedrooms: null,
    estimatedGuests: null,
    guestNotes: null,
    addonsInterest: null,
  };

  // Line-based: each known field starts its own line; a field's value runs
  // until the next known field line.
  const lines = section.split("\n");
  let currentField: keyof StaySetupView | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentField) view[currentField] = meaningful(buffer.join("\n"));
    buffer = [];
  };

  // Any other "Label: value" line (e.g. "Sleeping setup: …") ends the current
  // field — only unlabeled lines continue a multi-line value.
  const OTHER_LABEL = /^[A-Za-z][A-Za-z\s/-]{0,40}:\s/;

  for (const line of lines) {
    const matched = FIELD_PREFIXES.find(([, re]) => re.test(line.trim()));
    if (matched) {
      flush();
      currentField = matched[0];
      buffer.push(line.trim().replace(matched[1], ""));
    } else if (OTHER_LABEL.test(line.trim())) {
      flush();
      currentField = null;
    } else if (currentField) {
      buffer.push(line);
    }
  }
  flush();

  return view;
}

/**
 * "When did this come in?"
 *
 * The booking detail screen showed the stay dates and the money, but never the
 * one thing an operator needs to judge urgency: how long the guest has been
 * waiting. Reported 2026-08-12 while looking at a request with no visible age.
 *
 * Deliberately quiet — a date plus how long ago, not a warning. An old request
 * is not automatically a problem, and dressing it as one trains the operator to
 * ignore real alarms.
 */
export function describeRequestedAt(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!createdAt) return null;
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return null;

  const date = new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Beirut",
  });

  const minutes = Math.floor((nowMs - then) / 60_000);
  // A request from the future is a clock problem, not an age. Show the date.
  if (minutes < 0) return `Requested ${date}`;
  if (minutes < 1) return `Requested ${date} · just now`;
  if (minutes < 60) return `Requested ${date} · ${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Requested ${date} · ${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 31) return `Requested ${date} · ${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  return `Requested ${date} · ${months} month${months === 1 ? "" : "s"} ago`;
}
