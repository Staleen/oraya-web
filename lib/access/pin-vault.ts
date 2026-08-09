/**
 * Phase 16D Stage A — server-only access-PIN vault (DARK; no runtime consumer yet).
 *
 * Encrypts/decrypts six-digit door-PIN credentials for the hybrid preloaded
 * PIN magazine (sql/phase-16d-access-magazine.sql) and computes the keyed
 * historical fingerprint used for duplicate prevention.
 *
 * SERVER-ONLY. Never import from a "use client" component or anything
 * reachable by the client bundle. The plaintext PIN must never appear in
 * logs, thrown errors, analytics, URLs, or responses beyond the single
 * audited reveal the later stages implement.
 *
 * Key model (dedicated — deliberately NOT ADMIN_SECRET or any existing
 * secret, so rotating web-session or payment keys can never orphan door
 * credentials, and vice versa):
 *
 *   ACCESS_PIN_VAULT_KEYS      "k1:<base64-32-bytes>[,k2:<base64-32-bytes>...]"
 *     Ordered keyring. The FIRST entry is the active encryption key; every
 *     entry can decrypt. Rotation: generate a new key, PREPEND it as the new
 *     first entry, keep the old entries until no live (non-destroyed)
 *     credential's envelope still names them. Envelopes embed the key id, so
 *     old active credentials stay decryptable during rotation while new
 *     credentials use the active key. Removing a key that a live envelope
 *     still references makes that credential UNRECOVERABLE — the only remedy
 *     is quarantine -> dual-lock deletion -> destroy -> reload. Back the
 *     value up in the password manager before every change.
 *
 *   ACCESS_PIN_FINGERPRINT_KEY "<base64-32-bytes>"
 *     Separate HMAC key for the historical duplicate-prevention fingerprint
 *     (access_credentials.pin_fingerprint). A six-digit PIN has ~20 bits of
 *     entropy, so an unkeyed hash would be trivially brute-forceable — the
 *     keyed HMAC is what makes the stored fingerprint safe. This key must
 *     stay STABLE: rotating it breaks duplicate detection against every
 *     historical fingerprint. It is intentionally independent of the vault
 *     keyring so encryption-key rotation never touches it.
 *
 * Fail-closed contract: missing/malformed configuration parses to null (the
 * caller must refuse to operate), decryption returns null on ANY failure
 * (tamper, wrong key, unknown key id, malformed envelope), and no error path
 * ever carries key material or a PIN.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ACCESS_PIN_VAULT_KEYS_ENV = "ACCESS_PIN_VAULT_KEYS";
export const ACCESS_PIN_FINGERPRINT_KEY_ENV = "ACCESS_PIN_FINGERPRINT_KEY";

/** Envelope format marker: apv1.<key-id>.<iv>.<tag>.<ciphertext> (base64url segments). */
const ENVELOPE_VERSION = "apv1";

const PIN_RE = /^[0-9]{6}$/;
const KEY_ID_RE = /^[a-z0-9][a-z0-9_-]{0,15}$/;
/** Exactly 32 bytes of standard base64 (`openssl rand -base64 32`). */
const KEY_MATERIAL_RE = /^[A-Za-z0-9+/]{43}=$/;

export interface AccessPinKeyring {
  /** First keyring entry — used for every new encryption. */
  activeKeyId: string;
  /** Every known key by id — all usable for decryption. */
  keys: ReadonlyMap<string, Buffer>;
}

export function isValidAccessPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_RE.test(pin);
}

/**
 * Parses the keyring env value. Returns null on ANY defect (empty, bad key
 * id, non-32-byte material, duplicate id) — a partially valid keyring is
 * treated as no keyring at all, so misconfiguration fails closed.
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

/** Parses the fingerprint key env value. Null on any defect (fail closed). */
export function parseAccessPinFingerprintKey(raw: string | undefined | null): Buffer | null {
  if (typeof raw !== "string") return null;
  const material = raw.trim();
  if (!KEY_MATERIAL_RE.test(material)) return null;
  return Buffer.from(material, "base64");
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

/**
 * Keyed historical fingerprint (hex HMAC-SHA256). Stable across vault-key
 * rotation by construction — it depends only on the dedicated fingerprint
 * key — so duplicate detection keeps working over the full history.
 */
export function fingerprintAccessPin(pin: string, fingerprintKey: Buffer): string {
  if (!isValidAccessPinFormat(pin)) {
    throw new Error("[access-pin-vault] refusing to fingerprint: value is not a six-digit PIN");
  }
  return createHmac("sha256", fingerprintKey)
    .update(`oraya-access-pin-fingerprint:${pin}`, "utf8")
    .digest("hex");
}

export function getAccessPinKeyringFromEnv(): AccessPinKeyring | null {
  return parseAccessPinKeyring(process.env[ACCESS_PIN_VAULT_KEYS_ENV]);
}

export function getAccessPinFingerprintKeyFromEnv(): Buffer | null {
  return parseAccessPinFingerprintKey(process.env[ACCESS_PIN_FINGERPRINT_KEY_ENV]);
}

export type AccessPinVaultConfigProblem =
  | "missing_vault_keys"
  | "missing_fingerprint_key"
  | "fingerprint_key_reuses_vault_key";

/**
 * Names the current configuration defect (never the values), or null when
 * the vault is usable. The reuse check exists because the fingerprint key
 * doubles as a long-term secret pepper: sharing bytes with an encryption key
 * would couple their rotation stories.
 */
export function accessPinVaultConfigProblem(
  keyring: AccessPinKeyring | null = getAccessPinKeyringFromEnv(),
  fingerprintKey: Buffer | null = getAccessPinFingerprintKeyFromEnv()
): AccessPinVaultConfigProblem | null {
  if (!keyring) return "missing_vault_keys";
  if (!fingerprintKey) return "missing_fingerprint_key";
  for (const key of keyring.keys.values()) {
    if (key.length === fingerprintKey.length && timingSafeEqual(key, fingerprintKey)) {
      return "fingerprint_key_reuses_vault_key";
    }
  }
  return null;
}
