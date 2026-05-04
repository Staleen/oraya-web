/** One-time handoff from /book → /events/inquiry (avoids putting PII in the URL). */

export const BOOK_TO_EVENT_HANDOFF_KEY = "oraya_book_to_event_handoff_v1";

const HANDOFF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type BookToEventHandoffGuest = {
  fullName: string;
  email: string;
  dialCode: string;
  phoneNumber: string;
  country: string;
};

export type BookToEventHandoffPayload = {
  version: 1;
  savedAt: number;
  /** Must match `hl` query param on /events/inquiry so the payload is not lost under React Strict Mode remounts. */
  lockId: string;
  villa: string;
  check_in: string;
  check_out: string;
  sleeping_guests: string;
  day_visitors: string;
  guest?: BookToEventHandoffGuest;
};

function randomLockId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Returns `lockId` for the URL query `hl=` (handoff). */
export function writeBookToEventHandoff(payload: {
  villa: string;
  check_in: string;
  check_out: string;
  sleeping_guests: string;
  day_visitors: string;
  guest?: BookToEventHandoffGuest;
}): string | null {
  if (typeof window === "undefined") return null;
  try {
    const lockId = randomLockId();
    const body: BookToEventHandoffPayload = {
      version: 1,
      savedAt: Date.now(),
      lockId,
      villa: payload.villa,
      check_in: payload.check_in,
      check_out: payload.check_out,
      sleeping_guests: payload.sleeping_guests,
      day_visitors: payload.day_visitors,
      ...(payload.guest ? { guest: payload.guest } : {}),
    };
    window.sessionStorage.setItem(BOOK_TO_EVENT_HANDOFF_KEY, JSON.stringify(body));
    return lockId;
  } catch {
    return null;
  }
}

export function peekBookToEventHandoff(): BookToEventHandoffPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BOOK_TO_EVENT_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookToEventHandoffPayload>;
    if (parsed.version !== 1 || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > HANDOFF_MAX_AGE_MS) return null;
    if (typeof parsed.lockId !== "string" || !parsed.lockId.trim()) return null;
    if (
      typeof parsed.villa !== "string" ||
      typeof parsed.check_in !== "string" ||
      typeof parsed.check_out !== "string" ||
      typeof parsed.sleeping_guests !== "string" ||
      typeof parsed.day_visitors !== "string"
    ) {
      return null;
    }
    return parsed as BookToEventHandoffPayload;
  } catch {
    return null;
  }
}

export function clearBookToEventHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BOOK_TO_EVENT_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/** Peek + remove only when `lockId` matches (paired with URL `hl=`). */
export function takeBookToEventHandoffIfLock(lockId: string | null | undefined): BookToEventHandoffPayload | null {
  if (!lockId || typeof window === "undefined") return null;
  const payload = peekBookToEventHandoff();
  if (!payload || payload.lockId !== lockId) return null;
  clearBookToEventHandoff();
  return payload;
}
