/**
 * Phase 16D Stage A — server-only access-PIN vault (DARK; no runtime consumer yet).
 *
 * Encrypts/decrypts six-digit door-PIN credentials for the hybrid preloaded
 * PIN magazine (sql/phase-16d-access-magazine.sql) and computes the keyed
 * historical fingerprints used for duplicate prevention.
 *
 * SERVER-ONLY. Never import from a "use client" component or anything
 * reachable by the client bundle. The repository has no compile-time
 * `server-only` package guard (and adding one is a new dependency requiring
 * approval), so this module carries a zero-dependency runtime guard below
 * that throws immediately if it is ever evaluated in a browser context.
 * The plaintext PIN must never appear in logs, thrown errors, analytics,
 * URLs, or responses beyond the single audited reveal the later stages
 * implement.
 *
 * Key model (dedicated — deliberately NOT ADMIN_SECRET or any existing
 * secret, so rotating web-session or payment keys can never orphan door
 * credentials, and vice versa). BOTH variables use the same ordered-keyring
 * format `id:<base64-32-bytes>[,id2:<base64-32-bytes>...]` — first entry
 * active, all entries retained:
 *
 *   ACCESS_PIN_VAULT_KEYS      AES-256-GCM encryption keyring. The FIRST
 *     entry encrypts; every entry can decrypt. Rotation: generate a new key,
 *     PREPEND it as the new first entry, keep the old entries until no live
 *     (non-destroyed) credential's envelope still names them. Envelopes
 *     embed the key id, so old active credentials stay decryptable during
 *     rotation while new credentials use the active key. Removing a key that
 *     a live envelope still references makes that credential UNRECOVERABLE —
 *     the only remedy is quarantine -> dual-lock deletion -> destroy ->
 *     reload. Back the value up in the password manager before every change.
 *
 *   ACCESS_PIN_FINGERPRINT_KEYS  Versioned HMAC fingerprint keyring for
 *     historical duplicate prevention (access_credentials.pin_fingerprint +
 *     pin_fingerprint_key_id). A six-digit PIN has ~20 bits of entropy, so
 *     an unkeyed hash would be trivially brute-forceable — the keyed HMAC is
 *     what makes stored fingerprints safe. New credentials are fingerprinted
 *     under the ACTIVE (first) key and store its key id; duplicate detection
 *     stays intact across rotation because candidates are fingerprinted
 *     under EVERY retained key (fingerprintAccessPinAllKeys) and compared
 *     against the full stored history. Rotation: prepend a new key; NEVER
 *     drop an old key while any retained fingerprint row still carries its
 *     key id, or those historical PINs silently become re-issuable.
 *     EMERGENCY (key compromise): a leaked fingerprint key plus database
 *     read access lets an attacker brute-force the 10^6 PIN space against
 *     stored fingerprints and recover the plaintext of ACTIVE credentials —
 *     treat it like a leak of the PINs themselves: quarantine every active
 *     credential, delete from both locks, destroy, prepend a fresh
 *     fingerprint key, and reload a new batch. The compromised key stays in
 *     the keyring (position > 1) purely so historical duplicate detection
 *     keeps working; the fingerprints it produced protect only
 *     already-destroyed PINs afterwards.
 *
 * Fail-closed contract: missing/malformed configuration parses to null (the
 * caller must refuse to operate), decryption returns null on ANY failure
 * (tamper, wrong key, unknown key id, malformed envelope), and no error path
 * ever carries key material or a PIN.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

// Runtime server-only guard (no compile-time `server-only` package exists in
// this repo). Throws the moment a client bundle evaluates this module.
if (typeof window !== "undefined") {
  throw new Error("[access-pin-vault] server-only module evaluated in a browser context");
}

export const ACCESS_PIN_VAULT_KEYS_ENV = "ACCESS_PIN_VAULT_KEYS";
export const ACCESS_PIN_FINGERPRINT_KEYS_ENV = "ACCESS_PIN_FINGERPRINT_KEYS";

/** Envelope format marker: apv1.<key-id>.<iv>.<tag>.<ciphertext> (base64url segments). */
const ENVELOPE_VERSION = "apv1";

const PIN_RE = /^[0-9]{6}$/;
const KEY_ID_RE = /^[a-z0-9][a-z0-9_-]{0,15}$/;
/** Exactly 32 bytes of standard base64 (`openssl rand -base64 32`). */
const KEY_MATERIAL_RE = /^[A-Za-z0-9+/]{43}=$/;

export interface AccessPinKeyring {
  /** First keyring entry — used for every new encryption / fingerprint. */
  activeKeyId: string;
  /** Every known key by id — all usable for decryption / duplicate checks. */
  keys: ReadonlyMap<string, Buffer>;
}

export function isValidAccessPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_RE.test(pin);
}

/**
 * Parses an ordered keyring env value (shared format for both the vault and
 * the fingerprint keyrings). Returns null on ANY defect (empty, bad key id,
 * non-32-byte material, duplicate id) — a partially valid keyring is treated
 * as no keyring at all, so misconfiguration fails closed.
 */
export function parseAccessPinKeyring(raw: string | undefined | null): AccessPinKeyring | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const entries = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (entries.length === 0) return null;
  const keys = new Map<string, Buffer>();
  let activeKeyId: string | null = null;
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator <= 0) return null;
    const keyId = entry.slice(0, separator).trim();
    const material = entry.slice(separator + 1).trim();
    if (!KEY_ID_RE.test(keyId) || !KEY_MATERIAL_RE.test(material)) return null;
    if (keys.has(keyId)) return null;
    keys.set(keyId, Buffer.from(material, "base64"));
    if (activeKeyId === null) activeKeyId = keyId;
  }
  if (activeKeyId === null) return null;
  return { activeKeyId, keys };
}

/**
 * Encrypts a six-digit PIN with the ACTIVE key. AES-256-GCM, fresh 12-byte
 * IV per call, so identical PINs never share ciphertext. Throws only generic
 * configuration/format errors — never the PIN.
 */
export function encryptAccessPin(pin: string, keyring: AccessPinKeyring): string {
  if (!isValidAccessPinFormat(pin)) {
    throw new Error("[access-pin-vault] refusing to encrypt: value is not a six-digit PIN");
  }
  const key = keyring.keys.get(keyring.activeKeyId);
  if (!key) {
    throw new Error("[access-pin-vault] refusing to encrypt: active key missing from keyring");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    keyring.activeKeyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts an envelope with whichever keyring entry its key id names.
 * Returns null on ANY failure — tampered tag, malformed envelope, unknown or
 * wrong key, or a decrypted value that is not a six-digit PIN. Never throws.
 */
export function decryptAccessPin(envelope: unknown, keyring: AccessPinKeyring | null): string | null {
  try {
    if (typeof envelope !== "string" || !keyring) return null;
    const parts = envelope.split(".");
    if (parts.length !== 5) return null;
    const [version, keyId, ivRaw, tagRaw, encryptedRaw] = parts;
    if (version !== ENVELOPE_VERSION || !keyId || !ivRaw || !tagRaw || !encryptedRaw) return null;
    const key = keyring.keys.get(keyId);
    if (!key) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const pin = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return PIN_RE.test(pin) ? pin : null;
  } catch {
    return null;
  }
}

export interface AccessPinFingerprint {
  keyId: string;
  fingerprint: string;
}

function hmacFingerprint(pin: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update(`oraya-access-pin-fingerprint:${pin}`, "utf8")
    .digest("hex");
}

/**
 * Fingerprint under the ACTIVE fingerprint key — what a new credential row
 * stores (pin_fingerprint + pin_fingerprint_key_id). Hex HMAC-SHA256;
 * deterministic per key; stable across VAULT-key rotation by construction.
 */
export function fingerprintAccessPin(pin: string, keyring: AccessPinKeyring): AccessPinFingerprint {
  if (!isValidAccessPinFormat(pin)) {
    throw new Error("[access-pin-vault] refusing to fingerprint: value is not a six-digit PIN");
  }
  const key = keyring.keys.get(keyring.activeKeyId);
  if (!key) {
    throw new Error("[access-pin-vault] refusing to fingerprint: active key missing from keyring");
  }
  return { keyId: keyring.activeKeyId, fingerprint: hmacFingerprint(pin, key) };
}

/**
 * Fingerprints under EVERY retained fingerprint-key version. Duplicate
 * detection must compare all of these against the stored history, so a PIN
 * fingerprinted under a rotated-out-of-active key is still recognized as
 * taken and can never be issued again.
 */
export function fingerprintAccessPinAllKeys(
  pin: string,
  keyring: AccessPinKeyring
): readonly AccessPinFingerprint[] {
  if (!isValidAccessPinFormat(pin)) {
    throw new Error("[access-pin-vault] refusing to fingerprint: value is not a six-digit PIN");
  }
  const results: AccessPinFingerprint[] = [];
  for (const [keyId, key] of keyring.keys) {
    results.push({ keyId, fingerprint: hmacFingerprint(pin, key) });
  }
  return results;
}

export function getAccessPinKeyringFromEnv(): AccessPinKeyring | null {
  return parseAccessPinKeyring(process.env[ACCESS_PIN_VAULT_KEYS_ENV]);
}

export function getAccessPinFingerprintKeyringFromEnv(): AccessPinKeyring | null {
  return parseAccessPinKeyring(process.env[ACCESS_PIN_FINGERPRINT_KEYS_ENV]);
}

export type AccessPinVaultConfigProblem =
  | "missing_vault_keys"
  | "missing_fingerprint_keys"
  | "fingerprint_key_reuses_vault_key";

/**
 * Names the current configuration defect (never the values), or null when
 * the vault is usable. The reuse check exists because the fingerprint keys
 * double as long-term secret peppers: sharing bytes with an encryption key
 * would couple their rotation stories.
 */
export function accessPinVaultConfigProblem(
  keyring: AccessPinKeyring | null = getAccessPinKeyringFromEnv(),
  fingerprintKeyring: AccessPinKeyring | null = getAccessPinFingerprintKeyringFromEnv()
): AccessPinVaultConfigProblem | null {
  if (!keyring) return "missing_vault_keys";
  if (!fingerprintKeyring) return "missing_fingerprint_keys";
  for (const vaultKey of keyring.keys.values()) {
    for (const fingerprintKey of fingerprintKeyring.keys.values()) {
      if (vaultKey.length === fingerprintKey.length && timingSafeEqual(vaultKey, fingerprintKey)) {
        return "fingerprint_key_reuses_vault_key";
      }
    }
  }
  return null;
}
