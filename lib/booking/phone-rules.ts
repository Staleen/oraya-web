/**
 * Is this a plausible phone number for the country the guest picked?
 *
 * `/book` accepts a WhatsApp number OR an email, and for most Lebanese guests
 * the number IS the only way Oraya can reach them. A mistyped number is
 * therefore not a cosmetic problem: the booking arrives, and nobody can
 * contact the guest. Reported 2026-08-12.
 *
 * This validates the LENGTH of the national number against the dial code —
 * enough to catch the common mistakes (a digit dropped, the dial code typed
 * twice, the leading zero left on) without pulling in a full phone-number
 * library as a dependency.
 *
 * Two deliberate limits, so nobody mistakes this for libphonenumber:
 *   - It checks digit counts, not carrier prefixes. +961 3 000 000 passes.
 *   - An unlisted dial code is ACCEPTED on any sane length. Blocking a guest
 *     because Oraya has no rule for their country would be worse than the
 *     typo this exists to catch.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

/** Valid national-number lengths per dial code, excluding the dial code. */
const NATIONAL_LENGTHS: Record<string, number[]> = {
  "+961": [7, 8], // Lebanon: landline 7, mobile 8
  "+966": [9],
  "+971": [9],
  "+33": [9],
  "+1": [10],
  "+213": [9],
  "+54": [10],
  "+61": [9],
  "+43": [10, 11, 12, 13],
  "+32": [9],
  "+55": [10, 11],
  "+86": [11],
  "+357": [8],
  "+45": [8],
  "+20": [10],
  "+49": [10, 11],
  "+30": [10],
  "+91": [10],
  "+964": [10],
  "+353": [9],
  "+39": [9, 10],
  "+962": [9],
  "+965": [8],
  "+52": [10],
  "+212": [9],
  "+31": [9],
  "+64": [8, 9],
  "+234": [10],
  "+47": [8],
  "+968": [8],
  "+92": [10],
  "+970": [9],
  "+48": [9],
  "+351": [9],
  "+974": [8],
  "+7": [10],
  "+221": [9],
  "+27": [9],
  "+34": [9],
  "+249": [9],
  "+46": [9],
  "+41": [9],
  "+963": [9],
  "+216": [8],
  "+90": [10],
  "+44": [10],
  "+967": [9],
};

/** Anything outside this is a typo in any country. */
const FALLBACK_MIN = 6;
const FALLBACK_MAX = 14;

export type PhoneCheck =
  | { ok: true; national: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "wrong_length"; message: string };

export function digitsOnly(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Strip what guests habitually paste in: their own dial code again, and the
 * trunk "0" that belongs only to domestic dialling.
 */
export function normalisePhoneInput(dialCode: string, raw: string): string {
  let digits = digitsOnly(raw);
  const dial = digitsOnly(dialCode);

  // Order matters. "0096170123456" is the international prefix, THEN the dial
  // code, THEN the number — so the 00 has to go before the dial code can be
  // recognised. Stripping the dial code first left "96170123456" (caught by
  // a test, 2026-08-12).
  if (digits.startsWith("00") && digits.length > 2) digits = digits.slice(2);
  if (dial && digits.startsWith(dial) && digits.length > dial.length) {
    digits = digits.slice(dial.length);
  }
  // Domestic trunk zero, which never belongs in an international number.
  while (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function checkPhoneNumber(dialCode: string, raw: string): PhoneCheck {
  const national = normalisePhoneInput(dialCode, raw);
  if (!national) {
    return { ok: false, reason: "empty", message: "Please enter your phone number." };
  }

  const expected = NATIONAL_LENGTHS[dialCode.trim()];
  if (!expected) {
    if (national.length < FALLBACK_MIN) {
      return { ok: false, reason: "too_short", message: "That number looks too short." };
    }
    if (national.length > FALLBACK_MAX) {
      return { ok: false, reason: "too_long", message: "That number looks too long." };
    }
    return { ok: true, national };
  }

  if (expected.includes(national.length)) return { ok: true, national };

  const wanted =
    expected.length === 1
      ? `${expected[0]} digits`
      : `${expected.slice(0, -1).join(", ")} or ${expected[expected.length - 1]} digits`;
  return {
    ok: false,
    reason: "wrong_length",
    message: `A ${dialCode} number has ${wanted} after the country code.`,
  };
}

/** Placeholder that shows the shape expected for the chosen country. */
export function phonePlaceholder(dialCode: string): string {
  const expected = NATIONAL_LENGTHS[dialCode.trim()];
  const len = expected ? Math.max(...expected) : 8;
  // Grouped in threes, which is how people read a number back to themselves.
  return Array.from({ length: len }, () => "0")
    .join("")
    .replace(/(.{1,3})(?=(.{3})+$)/g, "$1 ");
}
