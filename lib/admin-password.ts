import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Admin password storage (Remediation 1.1).
 *
 * The `settings.admin_password` row stores a scrypt hash — never plaintext.
 * Stored format: `scrypt$N$r$p$<salt-base64url>$<hash-base64url>`
 *
 * Generate a value with `node scripts/hash-admin-password.mjs` and paste it
 * into the settings row. Anything that does not parse as this format is
 * treated as unverifiable and login fails closed (503), so a legacy plaintext
 * row can never be compared against.
 */

const SCRYPT_PREFIX = "scrypt";
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export function hashAdminPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
  });
  return [
    SCRYPT_PREFIX,
    String(DEFAULT_N),
    String(DEFAULT_R),
    String(DEFAULT_P),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

/** True only when `stored` parses as our scrypt format. */
export function isScryptHash(stored: unknown): stored is string {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return false;
  const [, n, r, p, salt, hash] = parts;
  if (![n, r, p].every((x) => /^[0-9]+$/.test(x))) return false;
  if (!salt || !hash) return false;
  return true;
}

/**
 * Timing-safe scrypt verification. Returns false for malformed stored values —
 * callers must distinguish "unavailable" from "wrong password" BEFORE calling
 * (via isScryptHash) to fail closed with 503 instead of 401.
 */
export function verifyAdminPassword(password: string, stored: string): boolean {
  if (!isScryptHash(stored)) return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = stored.split("$");
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  // Reject absurd cost params so a corrupted row can't DoS the server.
  if (!Number.isInteger(N) || N < 2 || N > 1 << 20) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32) return false;
  if (!Number.isInteger(p) || p < 1 || p > 16) return false;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = scryptSync(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export type AdminLoginDecision =
  | { outcome: "unavailable"; status: 503; reason: string }
  | { outcome: "unauthorized"; status: 401 }
  | { outcome: "ok"; status: 200 };

/**
 * Pure decision core for POST /api/admin/verify-password.
 * `storedValue` is the settings row value (or null/undefined when the row is
 * missing); `lookupFailed` marks a DB error. Fails closed in every state where
 * a trustworthy hash is not present.
 */
export function decideAdminLogin(input: {
  password: string;
  storedValue: string | null | undefined;
  lookupFailed: boolean;
}): AdminLoginDecision {
  if (input.lookupFailed) {
    return { outcome: "unavailable", status: 503, reason: "settings_lookup_failed" };
  }
  if (input.storedValue == null || input.storedValue === "") {
    return { outcome: "unavailable", status: 503, reason: "admin_password_row_missing" };
  }
  if (!isScryptHash(input.storedValue)) {
    return { outcome: "unavailable", status: 503, reason: "stored_value_not_scrypt_hash" };
  }
  if (!input.password || !verifyAdminPassword(input.password, input.storedValue)) {
    return { outcome: "unauthorized", status: 401 };
  }
  return { outcome: "ok", status: 200 };
}
