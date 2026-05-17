/**
 * Phase 16A — natural date normalization for Butler / WhatChimp guest input.
 *
 * Pure TypeScript, dependency-free. Operates only on a small allow-listed set
 * of patterns that WhatChimp is expected to emit (absolute month-day, ISO,
 * "today" / "tomorrow", "this/next <weekday>", and N-night / N-day duration
 * hints). Anything outside that set returns `status: "unclear"`.
 *
 * Hard invariants enforced repo-wide (see /docs/system/AGENT_RULES.md §10):
 *   - Stay dates are date-only strings (`YYYY-MM-DD`) end-to-end.
 *   - Guest-provided text is **never** fed to `new Date(...)` or any implicit
 *     JS Date parser. We tokenize explicitly and build dates from numeric
 *     year/month/day via `Date.UTC(...)`.
 *
 * Output is advisory by intent — the `safe_message` always asks the guest
 * to confirm before any availability check happens. The `status` is `"clear"`
 * when both dates parse, `"unclear"` otherwise; the Butler must still echo
 * the parsed dates back for explicit confirmation.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const SMALL_NUMBER_WORDS: Record<string, number> = {
  one: 1, a: 1, an: 1, single: 1,
  two: 2, couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const MONTH_SHORT_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const WEEKDAY_LABELS = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;

/** Public response shape — matches /docs/system/CURRENT_PHASE.md spec. */
export interface NormalizedDateResult {
  status: "clear" | "unclear" | "error";
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  human_readable: string;
  safe_message: string;
}

export interface NormalizeStayDatesInput {
  check_in_text?: string | null;
  check_out_text?: string | null;
  /** YYYY-MM-DD only. Used for deterministic relative-date resolution. */
  reference_date?: string | null;
}

// ─── Pure date arithmetic (UTC, date-only) ─────────────────────────────────

function isValidYmdComponents(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1970 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Round-trip through Date.UTC to catch impossible combinations (e.g. Feb 30).
  const stamp = Date.UTC(year, month - 1, day);
  const d = new Date(stamp);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function ymdToIso(year: number, month: number, day: number): string | null {
  if (!isValidYmdComponents(year, month, day)) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidYmdComponents(year, month, day)) return null;
  return { year, month, day };
}

function isoToUtcMillis(iso: string): number | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function utcMillisToIso(stamp: number): string | null {
  if (!Number.isFinite(stamp)) return null;
  const d = new Date(stamp);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return ymdToIso(year, month, day);
}

function addDaysToIso(iso: string, days: number): string | null {
  if (!Number.isInteger(days)) return null;
  const base = isoToUtcMillis(iso);
  if (base === null) return null;
  return utcMillisToIso(base + days * 86_400_000);
}

function isoWeekday(iso: string): number | null {
  const stamp = isoToUtcMillis(iso);
  if (stamp === null) return null;
  return new Date(stamp).getUTCDay();
}

function differenceInDays(fromIso: string, toIso: string): number | null {
  const a = isoToUtcMillis(fromIso);
  const b = isoToUtcMillis(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

// ─── Server-side "today" ────────────────────────────────────────────────────

function todayIsoUtc(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolveReferenceDate(raw: string | null | undefined): string {
  if (typeof raw === "string" && raw.trim()) {
    const parts = parseIsoDate(raw.trim());
    if (parts) return ymdToIso(parts.year, parts.month, parts.day)!;
  }
  return todayIsoUtc();
}

// ─── Text normalization ─────────────────────────────────────────────────────

function cleanInput(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const lowered = raw
    .replace(/[,;.!?]/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  // Compact day+month tokens like "24may" or "may24" — split when the alpha
  // half matches a known month name. Anything else (e.g. "2nights") is left
  // intact so the duration parser keeps working.
  return lowered
    .replace(/(\d{1,2})([a-z]+)/g, (match, num: string, alpha: string) =>
      MONTH_NAMES[alpha] !== undefined ? `${num} ${alpha}` : match,
    )
    .replace(/([a-z]+)(\d{1,2})/g, (match, alpha: string, num: string) =>
      MONTH_NAMES[alpha] !== undefined ? `${alpha} ${num}` : match,
    );
}

function readSmallNumber(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    if (n >= 0 && n <= 31) return n;
  }
  const word = SMALL_NUMBER_WORDS[token];
  if (typeof word === "number") return word;
  return null;
}

function readMonth(token: string): number | null {
  return MONTH_NAMES[token] ?? null;
}

function readWeekday(token: string): number | null {
  return WEEKDAY_NAMES[token] ?? null;
}

function stripOrdinalSuffix(token: string): string {
  return token.replace(/^(\d{1,2})(st|nd|rd|th)$/, "$1");
}

// ─── Check-in parsers ───────────────────────────────────────────────────────

function tryParseIsoCheckIn(text: string, refIso: string): string | null {
  const parts = parseIsoDate(text);
  if (!parts) return null;
  const iso = ymdToIso(parts.year, parts.month, parts.day);
  if (!iso) return null;
  // Reject ISO dates in the distant past — clearly typo-territory for a stay request.
  const diff = differenceInDays(refIso, iso);
  if (diff !== null && diff < -365) return null;
  return iso;
}

/** "today" / "tomorrow" / "the day after tomorrow". */
function tryParseRelativeKeywordCheckIn(text: string, refIso: string): string | null {
  if (text === "today") return refIso;
  if (text === "tomorrow") return addDaysToIso(refIso, 1);
  if (text === "day after tomorrow" || text === "the day after tomorrow") {
    return addDaysToIso(refIso, 2);
  }
  return null;
}

/** "this Saturday" / "next Saturday" / bare weekday name. */
function tryParseWeekdayCheckIn(text: string, refIso: string): string | null {
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.length > 2) return null;

  let qualifier: "this" | "next" | null = null;
  let weekdayToken: string;
  if (tokens.length === 2) {
    if (tokens[0] !== "this" && tokens[0] !== "next") return null;
    qualifier = tokens[0] as "this" | "next";
    weekdayToken = tokens[1];
  } else {
    weekdayToken = tokens[0];
  }

  const targetDow = readWeekday(weekdayToken);
  if (targetDow === null) return null;

  const refDow = isoWeekday(refIso);
  if (refDow === null) return null;

  let delta = (targetDow - refDow + 7) % 7;
  if (qualifier === "next") {
    if (delta === 0) delta = 7;
    else delta = delta + 7;
  } else if (qualifier === "this") {
    if (delta === 0) delta = 7; // "this Saturday" when today is Saturday → next one
  } else {
    // Bare weekday → soonest upcoming (treat as "this <day>")
    if (delta === 0) delta = 7;
  }
  return addDaysToIso(refIso, delta);
}

/**
 * "June 10", "10 June", "Jun 10", "June 10 2026", "10 June 2026", "10th June".
 * Year-less inputs roll forward into the future relative to the reference date.
 */
function tryParseMonthDayCheckIn(text: string, refIso: string): string | null {
  const tokens = text
    .split(" ")
    .filter(Boolean)
    .map(stripOrdinalSuffix);
  if (tokens.length < 2 || tokens.length > 3) return null;

  let month: number | null = null;
  let day: number | null = null;
  let year: number | null = null;

  for (const t of tokens) {
    const m = readMonth(t);
    if (m !== null && month === null) {
      month = m;
      continue;
    }
    if (/^\d{4}$/.test(t)) {
      const y = Number(t);
      if (y >= 2024 && y <= 2099) {
        year = y;
        continue;
      }
      return null;
    }
    if (/^\d{1,2}$/.test(t)) {
      const n = Number(t);
      if (day === null && n >= 1 && n <= 31) {
        day = n;
        continue;
      }
    }
    return null;
  }

  if (month === null || day === null) return null;

  const refParts = parseIsoDate(refIso);
  if (!refParts) return null;

  if (year === null) {
    // Year-less: try reference year first, roll to next year if the date is more
    // than 7 days in the past (safety window for guests typing "yesterday's date").
    const candidate = ymdToIso(refParts.year, month, day);
    if (candidate) {
      const diff = differenceInDays(refIso, candidate);
      if (diff !== null && diff >= -7) return candidate;
    }
    const rolled = ymdToIso(refParts.year + 1, month, day);
    return rolled ?? null;
  }

  return ymdToIso(year, month, day);
}

function parseCheckIn(rawText: string, refIso: string): string | null {
  const text = cleanInput(rawText);
  if (!text) return null;
  // Try strategies in increasing ambiguity.
  return (
    tryParseIsoCheckIn(text, refIso) ??
    tryParseRelativeKeywordCheckIn(text, refIso) ??
    tryParseWeekdayCheckIn(text, refIso) ??
    tryParseMonthDayCheckIn(text, refIso)
  );
}

// ─── Check-out parsers (depend on a resolved check-in) ──────────────────────

/** "N nights", "N days", "one night", "two days", "a night", "couple of nights". */
function tryParseDurationCheckOut(text: string, checkInIso: string): { iso: string; nights: number } | null {
  const tokens = text.split(" ").filter(Boolean).map(stripOrdinalSuffix);
  if (tokens.length === 0 || tokens.length > 4) return null;

  // Accept patterns like: ["one","night"], ["two","nights"], ["3","days"],
  // ["a","couple","of","nights"], ["a","night"].
  let unit: "nights" | "days" | null = null;
  let count: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "night" || t === "nights" || t === "overnight") {
      unit = "nights";
      continue;
    }
    if (t === "day" || t === "days") {
      unit = "days";
      continue;
    }
    if (t === "of" || t === "the") continue;
    const n = readSmallNumber(t);
    if (n !== null && count === null) {
      count = n;
      continue;
    }
    return null;
  }

  if (unit === null) return null;
  if (count === null) count = 1; // "a night", "overnight"
  if (count < 1 || count > 31) return null;
  const iso = addDaysToIso(checkInIso, count);
  return iso ? { iso, nights: count } : null;
}

function parseCheckOut(
  rawText: string,
  checkInIso: string,
  refIso: string,
): { iso: string; nights: number } | null {
  const text = cleanInput(rawText);
  if (!text) return null;

  // Absolute date checkout (ISO, month/day, weekday) — same strategies as check-in.
  const absolute =
    tryParseIsoCheckIn(text, refIso) ??
    tryParseRelativeKeywordCheckIn(text, refIso) ??
    tryParseWeekdayCheckIn(text, refIso) ??
    tryParseMonthDayCheckIn(text, refIso);
  if (absolute) {
    const nights = differenceInDays(checkInIso, absolute);
    if (nights !== null && nights >= 1 && nights <= 60) {
      return { iso: absolute, nights };
    }
    return null;
  }

  // Otherwise treat as a duration hint relative to check-in.
  return tryParseDurationCheckOut(text, checkInIso);
}

// ─── Presentation ───────────────────────────────────────────────────────────

function formatHumanReadable(checkInIso: string | null, checkOutIso: string | null, nights: number | null): string {
  if (!checkInIso) return "(dates unclear)";
  const ci = parseIsoDate(checkInIso);
  if (!ci) return "(dates unclear)";
  const ciDow = isoWeekday(checkInIso);
  const ciLabel = `${ciDow !== null ? WEEKDAY_LABELS[ciDow] + " " : ""}${MONTH_SHORT_LABELS[ci.month - 1]} ${ci.day}`;

  if (!checkOutIso || nights === null) {
    return `${ciLabel} → (checkout to confirm)`;
  }
  const co = parseIsoDate(checkOutIso);
  if (!co) return `${ciLabel} → (checkout to confirm)`;
  const coDow = isoWeekday(checkOutIso);
  const coLabel = `${coDow !== null ? WEEKDAY_LABELS[coDow] + " " : ""}${MONTH_SHORT_LABELS[co.month - 1]} ${co.day}`;
  const nightWord = nights === 1 ? "night" : "nights";
  return `${ciLabel} → ${coLabel} (${nights} ${nightWord})`;
}

function unclearMessage(reason: "checkin" | "checkout" | "range"): string {
  if (reason === "checkin") {
    return "I couldn't read those dates. Could you share check-in and check-out as month + day (e.g. \"June 10 to June 13\") so I can confirm with Oraya?";
  }
  if (reason === "checkout") {
    return "I have your check-in but need the check-out — how many nights, or what date do you plan to leave?";
  }
  return "Those dates don't seem to form a valid stay — could you re-share the check-in and check-out?";
}

function confirmationMessage(humanReadable: string, hasDurationHint: boolean): string {
  const prefix = `I parsed your dates as ${humanReadable}.`;
  const tail = hasDurationHint
    ? "Please confirm the exact check-in and check-out before I ask Oraya about availability."
    : "Please confirm before I ask Oraya about availability.";
  return `${prefix} ${tail}`;
}

// ─── Public entry point ─────────────────────────────────────────────────────

export function normalizeStayDates(input: NormalizeStayDatesInput): NormalizedDateResult {
  const refIso = resolveReferenceDate(input.reference_date);

  const checkInRaw = typeof input.check_in_text === "string" ? input.check_in_text : "";
  if (!checkInRaw.trim()) {
    return {
      status: "unclear",
      check_in: null,
      check_out: null,
      nights: null,
      human_readable: "(dates unclear)",
      safe_message: unclearMessage("checkin"),
    };
  }

  const checkInIso = parseCheckIn(checkInRaw, refIso);
  if (!checkInIso) {
    return {
      status: "unclear",
      check_in: null,
      check_out: null,
      nights: null,
      human_readable: "(dates unclear)",
      safe_message: unclearMessage("checkin"),
    };
  }

  const checkOutRaw = typeof input.check_out_text === "string" ? input.check_out_text : "";
  if (!checkOutRaw.trim()) {
    return {
      status: "unclear",
      check_in: checkInIso,
      check_out: null,
      nights: null,
      human_readable: formatHumanReadable(checkInIso, null, null),
      safe_message: unclearMessage("checkout"),
    };
  }

  const parsedCheckOut = parseCheckOut(checkOutRaw, checkInIso, refIso);
  if (!parsedCheckOut) {
    return {
      status: "unclear",
      check_in: checkInIso,
      check_out: null,
      nights: null,
      human_readable: formatHumanReadable(checkInIso, null, null),
      safe_message: unclearMessage("checkout"),
    };
  }

  if (parsedCheckOut.nights < 1) {
    return {
      status: "unclear",
      check_in: checkInIso,
      check_out: null,
      nights: null,
      human_readable: formatHumanReadable(checkInIso, null, null),
      safe_message: unclearMessage("range"),
    };
  }

  const hasDurationHint = /\b(night|nights|day|days|overnight)\b/i.test(checkOutRaw);
  const humanReadable = formatHumanReadable(checkInIso, parsedCheckOut.iso, parsedCheckOut.nights);

  return {
    status: "clear",
    check_in: checkInIso,
    check_out: parsedCheckOut.iso,
    nights: parsedCheckOut.nights,
    human_readable: humanReadable,
    safe_message: confirmationMessage(humanReadable, hasDurationHint),
  };
}
