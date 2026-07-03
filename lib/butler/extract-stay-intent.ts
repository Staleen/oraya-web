/**
 * Phase 16A — natural stay-intent extraction for Butler / WhatChimp.
 *
 * Takes a single free-text guest message (e.g. "I want Mechmech from June 10
 * to 15, 3 adults") and decomposes it into structured fields the Butler can
 * confirm with the guest before any availability check is performed.
 *
 * Date arithmetic is delegated to `normalizeStayDates` so the standing
 * date-string discipline (`YYYY-MM-DD` end-to-end, no `new Date(<guest text>)`,
 * UTC round-trip validation — see /docs/system/AGENT_RULES.md §10) lives in
 * one place. The villa + guest-count detectors and the connective splitter
 * are the only new behaviour.
 *
 * Pure TypeScript, dependency-free. No Supabase, no env, no side effects.
 * Always returns a result — never throws on guest input.
 */

import { normalizeStayDates } from "./normalize-dates.ts";

export type StayIntentVilla = "Villa Mechmech" | "Villa Byblos";

export type StayIntentMissingField =
  | "check_in"
  | "check_out"
  | "villa"
  | "guest_count";

export interface StayIntentResult {
  status: "clear" | "partial" | "unclear";
  extracted: {
    check_in:    string | null;
    check_out:   string | null;
    nights:      number | null;
    villa:       StayIntentVilla | null;
    guest_count: number | null;
  };
  missing_fields: StayIntentMissingField[];
  /**
   * String-safe mirror of `extracted` for flow platforms (WhatChimp) whose
   * HTTP-API response→custom-field mapping behavior on JSON `null` is
   * undefined (may skip the write and leave a stale value from a previous
   * attempt). Every key is always a non-null string; missing values are the
   * literal string "null" so a mapped custom field is deterministically
   * overwritten on every call — current-turn truth, stale-field safety.
   * Additive: `extracted` is unchanged and remains the primary shape.
   */
  extracted_text: {
    check_in:    string;
    check_out:   string;
    nights:      string;
    villa:       string;
    guest_count: string;
    /**
     * Always the literal string "null" — the extractor never parses an
     * above-capacity overflow count from free text. The key exists as a
     * deterministic current-attempt RESET: mapping it to the WhatChimp
     * `oraya_guest_followup` field on every initial/Edit normalization and
     * refinement call clears any stale exact-overflow value from an earlier
     * abandoned attempt, so a later supported-count lead can never carry a
     * contradictory leftover (e.g. a stale "12" next to guest_count "2").
     * All normalization calls happen before the current attempt's guest
     * question, so a genuinely captured overflow value is never clobbered.
     */
    guest_followup: string;
  };
  human_readable: string;
  safe_message: string;
  confirm_prompt: string;
}

export interface ExtractStayIntentInput {
  stay_text: string;
  reference_date?: string | null;
}

export const MAX_STAY_TEXT_LEN = 512;
export const MAX_GUEST_COUNT = 64;

// ─── villa detection ───────────────────────────────────────────────────────
// Order matters: longer canonical names first so "Villa Mechmech" matches
// before the bare "mechmech" alias.
const VILLA_PATTERNS: Array<{ re: RegExp; canonical: StayIntentVilla }> = [
  { re: /\bvilla\s+mechmech\b/i, canonical: "Villa Mechmech" },
  { re: /\bvilla\s+byblos\b/i,   canonical: "Villa Byblos" },
  { re: /\bmechmech\b/i,         canonical: "Villa Mechmech" },
  { re: /\bannaya\b/i,           canonical: "Villa Mechmech" },
  { re: /\bbyblos\b/i,           canonical: "Villa Byblos" },
  { re: /\bjbeil\b/i,            canonical: "Villa Byblos" },
];

// ─── guest-count detection ─────────────────────────────────────────────────
// Patterns are tried in priority order. Capture group $1 is the count.
const GUEST_COUNT_PATTERNS: RegExp[] = [
  /\bfor\s+(\d{1,2})\s+(?:people|guests?|adults?|pax|persons?|visitors?)\b/i,
  /\b(\d{1,2})\s+(?:people|guests?|adults?|pax|persons?|visitors?)\b/i,
  /\b(?:we\s+are|we['’]?re|there\s+are|there['’]?ll\s+be)\s+(\d{1,2})\b/i,
  /\b(?:group|party)\s+of\s+(\d{1,2})\b/i,
  /\b(\d{1,2})\s+of\s+us\b/i,
  /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|guests?|adults?|pax|persons?)\b/i,
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// ─── connectives the splitter recognizes ───────────────────────────────────
const CONNECTIVE_PATTERNS: RegExp[] = [
  /\s+(?:to|till|until|through|thru)\s+/i,
  /\s*(?:->|→)\s*/,
  /\s+-\s+/,
];

// ─── duration detection (anywhere in the residue) ──────────────────────────
const DURATION_PATTERN =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(nights?|days?|overnight)\b/i;

// ─── month tokens recognized for bare-day reconstruction ───────────────────
const MONTH_TOKEN_RE =
  /^(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/i;

// Filler words stripped from the residue before splitting. Kept short and
// intentionally excludes month names, weekday names, and duration units.
// Guest-count and villa extraction run BEFORE this filter, so removing
// "from" / "for" here does not affect `for 5 people` matching.
const FILLER_WORDS = new Set([
  "i", "i'd", "id", "we", "we'd", "wed", "im", "i'm", "we're",
  "want", "wanted", "like", "love", "loved", "prefer", "preferred",
  "book", "booking", "stay", "staying", "reserve", "request", "requested",
  "please", "kindly", "thanks", "thank", "you",
  "go", "going", "have", "had", "looking",
  "the", "a", "an", "any", "some",
  "your", "our", "my",
  "place", "house", "spot",
  "on", "in", "at", "during", "of", "from", "for",
  "check", "out", "checkin", "checkout", "check-in", "check-out",
  "arrive", "arriving", "leave", "leaving", "departing", "departure", "arrival",
]);

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const WEEKDAY_LABELS = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;

const WEEKDAY_LOOKUP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

// ─── public entry ──────────────────────────────────────────────────────────

export function extractStayIntent(input: ExtractStayIntentInput): StayIntentResult {
  const rawText = typeof input.stay_text === "string" ? input.stay_text : "";
  const stayText = rawText.trim();
  const referenceDate =
    typeof input.reference_date === "string" ? input.reference_date : null;

  if (!stayText) {
    return buildResult({
      checkIn: null, checkOut: null, nights: null,
      villa: null, guestCount: null,
      empty: true,
    });
  }

  const { guestCount, withoutGuestCount } = extractGuestCount(stayText);
  const { villa, withoutVilla } = extractVilla(withoutGuestCount);
  const cleaned = cleanResidue(withoutVilla);

  const { ciFragment, coFragment, durationFragment } = splitStayResidue(cleaned);

  const initial = normalizeStayDates({
    check_in_text:  ciFragment,
    check_out_text: coFragment ?? durationFragment,
    reference_date: referenceDate,
  });

  let checkIn  = initial.check_in;
  let checkOut = initial.check_out;
  let nights   = initial.nights;

  // Recovery 1: bare-day check-out ("June 10 to 15" → "June 15").
  if (checkIn && !checkOut && coFragment) {
    const reconstructed = reconstructBareDayCheckOut(coFragment, ciFragment);
    if (reconstructed) {
      const retry = normalizeStayDates({
        check_in_text:  ciFragment,
        check_out_text: reconstructed,
        reference_date: referenceDate,
      });
      if (retry.check_in === checkIn && retry.check_out) {
        checkOut = retry.check_out;
        nights   = retry.nights;
      }
    }
  }

  // Recovery 2: bare-weekday check-out anchored to the parsed check-in
  // ("next Saturday to Monday" — the Monday after the Saturday).
  if (checkIn && !checkOut && coFragment) {
    const recovered = recoverBareWeekdayCheckOut(coFragment, checkIn);
    if (recovered) {
      checkOut = recovered.iso;
      nights   = recovered.nights;
    }
  }

  return buildResult({
    checkIn, checkOut, nights,
    villa, guestCount,
    empty: false,
  });
}

// ─── helpers ───────────────────────────────────────────────────────────────

function extractGuestCount(text: string): {
  guestCount: number | null;
  withoutGuestCount: string;
} {
  for (const pat of GUEST_COUNT_PATTERNS) {
    const m = pat.exec(text);
    if (!m) continue;
    const token = m[1].toLowerCase();
    const n = NUMBER_WORDS[token] ?? Number(token);
    if (!Number.isFinite(n) || n < 1 || n > MAX_GUEST_COUNT) continue;
    const withoutGuestCount = spliceOut(text, m.index, m[0].length);
    return { guestCount: n, withoutGuestCount };
  }
  return { guestCount: null, withoutGuestCount: text };
}

function extractVilla(text: string): {
  villa: StayIntentVilla | null;
  withoutVilla: string;
} {
  for (const { re, canonical } of VILLA_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const withoutVilla = spliceOut(text, m.index, m[0].length);
    return { villa: canonical, withoutVilla };
  }
  return { villa: null, withoutVilla: text };
}

function spliceOut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`
    .replace(/\s+/g, " ")
    .trim();
}

function cleanResidue(text: string): string {
  // Strip emojis / decorative punctuation / extra symbols, but keep ASCII
  // letters, digits, whitespace, hyphen, arrow, apostrophes (straight +
  // curly), and `>` so both `-` ranges and `->` connectives survive intact.
  // ASCII-only is deliberate: the Butler playbook is English-first today
  // (see /docs/system/BUTLER_PLAYBOOK.md "Butler identity"); multilingual
  // intake is a known limitation tracked separately.
  let out = text.replace(/[^a-zA-Z0-9\s\-'’→>]/g, " ");
  // Bare day-range hyphen normalization (Jun 10-15 → Jun 10 to 15). Skipped
  // for hyphens adjacent to other digits or hyphens (i.e. ISO dates).
  out = out.replace(
    /(?<![\d-])(\d{1,2})\s*-\s*(\d{1,2})(?![\d-])/g,
    "$1 to $2",
  );
  out = out
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((tok) => !FILLER_WORDS.has(tok.toLowerCase()))
    .join(" ")
    .trim();
  return out;
}

function splitStayResidue(text: string): {
  ciFragment: string;
  coFragment: string | null;
  durationFragment: string | null;
} {
  // If two ISO dates appear adjacent ("2026-06-10 2026-06-15"), insert an
  // explicit connective so the splitter below can find them.
  let work = text.replace(
    /(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/g,
    "$1 to $2",
  );

  for (const re of CONNECTIVE_PATTERNS) {
    const m = re.exec(work);
    if (!m) continue;
    const ci = work.slice(0, m.index).trim();
    const co = work.slice(m.index + m[0].length).trim();
    if (ci && co) return { ciFragment: ci, coFragment: co, durationFragment: null };
  }

  const dur = DURATION_PATTERN.exec(work);
  if (dur) {
    const ci = spliceOut(work, dur.index, dur[0].length);
    return {
      ciFragment: ci,
      coFragment: null,
      durationFragment: dur[0].trim(),
    };
  }

  return { ciFragment: work, coFragment: null, durationFragment: null };
}

function reconstructBareDayCheckOut(
  coFragment: string,
  ciFragment: string,
): string | null {
  const trimmed = coFragment.trim().toLowerCase();
  const m = /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?$/.exec(trimmed);
  if (!m) return null;
  const day = m[1];
  const ciTokens = ciFragment.toLowerCase().split(/\s+/);
  const monthTok = ciTokens.find((t) => MONTH_TOKEN_RE.test(t));
  if (!monthTok) return null;
  return `${monthTok} ${day}`;
}

function recoverBareWeekdayCheckOut(
  coFragment: string,
  checkInIso: string,
): { iso: string; nights: number } | null {
  const m = /^([a-z]+)$/i.exec(coFragment.trim());
  if (!m) return null;
  const targetDow = WEEKDAY_LOOKUP[m[1].toLowerCase()];
  if (targetDow === undefined) return null;

  const ci = parseIsoComponents(checkInIso);
  if (!ci) return null;
  const ciStamp = Date.UTC(ci.year, ci.month - 1, ci.day);
  const ciDow = new Date(ciStamp).getUTCDay();
  let delta = (targetDow - ciDow + 7) % 7;
  if (delta === 0) delta = 7;
  if (delta < 1 || delta > 30) return null;

  const coStamp = ciStamp + delta * 86_400_000;
  const co = new Date(coStamp);
  const iso =
    `${co.getUTCFullYear()}-` +
    `${String(co.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(co.getUTCDate()).padStart(2, "0")}`;
  return { iso, nights: delta };
}

function parseIsoComponents(iso: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

interface BuildResultInput {
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  villa: StayIntentVilla | null;
  guestCount: number | null;
  empty: boolean;
}

function buildResult(input: BuildResultInput): StayIntentResult {
  const missing: StayIntentMissingField[] = [];
  if (!input.checkIn)            missing.push("check_in");
  if (!input.checkOut)           missing.push("check_out");
  if (!input.villa)              missing.push("villa");
  if (input.guestCount === null) missing.push("guest_count");

  let status: StayIntentResult["status"];
  if (input.empty || !input.checkIn) {
    status = "unclear";
  } else if (missing.length === 0) {
    status = "clear";
  } else {
    status = "partial";
  }

  const human = formatHuman(input);

  return {
    status,
    extracted: {
      check_in:    input.checkIn,
      check_out:   input.checkOut,
      nights:      input.nights,
      villa:       input.villa,
      guest_count: input.guestCount,
    },
    missing_fields: missing,
    extracted_text: {
      check_in:    input.checkIn ?? "null",
      check_out:   input.checkOut ?? "null",
      nights:      input.nights === null ? "null" : String(input.nights),
      villa:       input.villa ?? "null",
      guest_count: input.guestCount === null ? "null" : String(input.guestCount),
      guest_followup: "null",
    },
    human_readable: human,
    safe_message:   composeSafeMessage(status, input, human, missing),
    confirm_prompt: "Please confirm before I share this with Oraya.",
  };
}

function formatHuman(input: BuildResultInput): string {
  const parts: string[] = [];
  if (input.checkIn) {
    if (input.checkOut && input.nights !== null) {
      const ciLabel = isoToLabel(input.checkIn);
      const coLabel = isoToLabel(input.checkOut);
      const word = input.nights === 1 ? "night" : "nights";
      parts.push(`${ciLabel} → ${coLabel} (${input.nights} ${word})`);
    } else {
      parts.push(`${isoToLabel(input.checkIn)} → (checkout to confirm)`);
    }
  } else {
    parts.push("(dates unclear)");
  }
  if (input.villa) parts.push(input.villa);
  if (input.guestCount !== null) {
    const word = input.guestCount === 1 ? "guest" : "guests";
    parts.push(`${input.guestCount} ${word}`);
  }
  return parts.join(", ");
}

function isoToLabel(iso: string): string {
  const parts = parseIsoComponents(iso);
  if (!parts) return iso;
  const stamp = Date.UTC(parts.year, parts.month - 1, parts.day);
  const dow = new Date(stamp).getUTCDay();
  return `${WEEKDAY_LABELS[dow]} ${MONTH_LABELS[parts.month - 1]} ${parts.day}`;
}

function composeSafeMessage(
  status: StayIntentResult["status"],
  input: BuildResultInput,
  human: string,
  missing: StayIntentMissingField[],
): string {
  if (status === "unclear") {
    return "I couldn't make out your stay details yet. Could you share your check-in and check-out (for example \"June 10 to June 15\"), the villa, and how many guests?";
  }
  if (status === "clear") {
    return `I have you down for ${human}. Should I share this with Oraya, or would you like to adjust anything?`;
  }
  // partial
  if (missing.length === 1) {
    return `I have ${human}. Could you also share your ${missingFieldLabel(missing[0])}?`;
  }
  const friendly = missing.map(missingFieldLabel).join(" and ");
  return `I have ${human}. Could you also share your ${friendly}?`;
}

function missingFieldLabel(field: StayIntentMissingField): string {
  switch (field) {
    case "check_in":    return "check-in date";
    case "check_out":   return "check-out date";
    case "villa":       return "preferred villa (Mechmech or Byblos)";
    case "guest_count": return "number of guests";
  }
}
