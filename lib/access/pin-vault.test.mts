import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import {
  accessPinVaultConfigProblem,
  decryptAccessPin,
  encryptAccessPin,
  fingerprintAccessPin,
  fingerprintAccessPinAllKeys,
  isValidAccessPinFormat,
  parseAccessPinKeyring,
} from "./pin-vault.ts";

// Clearly non-production test material: keys are freshly random per run and
// every test PIN below is a throwaway value, never an operational credential.
const key = () => randomBytes(32).toString("base64");
const keyringOf = (raw: string) => {
  const parsed = parseAccessPinKeyring(raw);
  assert.ok(parsed, "test keyring must parse");
  return parsed;
};

const K1 = key();
const K2 = key();
const F1 = key();
const F2 = key();
const TEST_PIN = "482915";

test("keyring parsing: single key, active = first entry", () => {
  const ring = keyringOf(`k1:${K1}`);
  assert.equal(ring.activeKeyId, "k1");
  assert.equal(ring.keys.size, 1);
});

test("keyring parsing: multi-key order — first entry is active, all decrypt-capable", () => {
  const ring = keyringOf(`k2:${K2},k1:${K1}`);
  assert.equal(ring.activeKeyId, "k2");
  assert.equal(ring.keys.size, 2);
  assert.ok(ring.keys.has("k1"));
});

test("keyring parsing fails closed on every malformed shape", () => {
  assert.equal(parseAccessPinKeyring(undefined), null);
  assert.equal(parseAccessPinKeyring(""), null);
  assert.equal(parseAccessPinKeyring("   "), null);
  assert.equal(parseAccessPinKeyring(K1), null); // missing key id
  assert.equal(parseAccessPinKeyring(`:${K1}`), null); // empty key id
  assert.equal(parseAccessPinKeyring("k1:not-base64!!"), null);
  assert.equal(parseAccessPinKeyring(`k1:${randomBytes(16).toString("base64")}`), null); // 16 bytes, not 32
  assert.equal(parseAccessPinKeyring(`K1:${K1}`), null); // uppercase key id
  assert.equal(parseAccessPinKeyring(`k1:${K1},k1:${K2}`), null); // duplicate id
});

test("PIN format guard", () => {
  assert.equal(isValidAccessPinFormat(TEST_PIN), true);
  assert.equal(isValidAccessPinFormat("12345"), false);
  assert.equal(isValidAccessPinFormat("1234567"), false);
  assert.equal(isValidAccessPinFormat("12a456"), false);
  assert.equal(isValidAccessPinFormat(482915), false);
  assert.equal(isValidAccessPinFormat(null), false);
});

test("encrypt/decrypt round trip; envelope names the active key and never contains the PIN", () => {
  const ring = keyringOf(`k1:${K1}`);
  const envelope = encryptAccessPin(TEST_PIN, ring);
  assert.ok(envelope.startsWith("apv1.k1."));
  assert.equal(envelope.includes(TEST_PIN), false);
  assert.equal(decryptAccessPin(envelope, ring), TEST_PIN);
});

test("randomized IV: same PIN twice yields different envelopes, both decryptable", () => {
  const ring = keyringOf(`k1:${K1}`);
  const first = encryptAccessPin(TEST_PIN, ring);
  const second = encryptAccessPin(TEST_PIN, ring);
  assert.notEqual(first, second);
  assert.equal(decryptAccessPin(first, ring), TEST_PIN);
  assert.equal(decryptAccessPin(second, ring), TEST_PIN);
});

test("tamper rejection: any flipped ciphertext or tag byte decrypts to null", () => {
  const ring = keyringOf(`k1:${K1}`);
  const envelope = encryptAccessPin(TEST_PIN, ring);
  const parts = envelope.split(".");
  for (const index of [2, 3, 4]) {
    const tampered = [...parts];
    const segment = tampered[index];
    tampered[index] = (segment[0] === "A" ? "B" : "A") + segment.slice(1);
    assert.equal(decryptAccessPin(tampered.join("."), ring), null, `segment ${index} tamper must fail`);
  }
});

test("malformed envelope rejection", () => {
  const ring = keyringOf(`k1:${K1}`);
  const envelope = encryptAccessPin(TEST_PIN, ring);
  assert.equal(decryptAccessPin(null, ring), null);
  assert.equal(decryptAccessPin("", ring), null);
  assert.equal(decryptAccessPin("apv1.k1.onlythree", ring), null);
  assert.equal(decryptAccessPin(`${envelope}.extra`, ring), null);
  assert.equal(decryptAccessPin(envelope.replace("apv1", "v1"), ring), null);
  assert.equal(decryptAccessPin(envelope, null), null);
});

test("wrong key and unknown key-version rejection", () => {
  const ringA = keyringOf(`k1:${K1}`);
  const ringB = keyringOf(`k1:${K2}`); // same id, different key material
  const ringC = keyringOf(`k9:${K2}`); // envelope's key id absent entirely
  const envelope = encryptAccessPin(TEST_PIN, ringA);
  assert.equal(decryptAccessPin(envelope, ringB), null);
  assert.equal(decryptAccessPin(envelope, ringC), null);
});

test("vault rotation: old envelopes stay decryptable, new encryptions use the new active key", () => {
  const before = keyringOf(`k1:${K1}`);
  const oldEnvelope = encryptAccessPin(TEST_PIN, before);
  // Rotate: new key prepended as active, old key retained for decryption.
  const after = keyringOf(`k2:${K2},k1:${K1}`);
  assert.equal(decryptAccessPin(oldEnvelope, after), TEST_PIN);
  const newEnvelope = encryptAccessPin("739024", after);
  assert.ok(newEnvelope.startsWith("apv1.k2."));
  assert.equal(decryptAccessPin(newEnvelope, after), "739024");
  // Dropping the old key orphans the old envelope (documented recovery:
  // quarantine -> deletion -> destroy -> reload).
  const dropped = keyringOf(`k2:${K2}`);
  assert.equal(decryptAccessPin(oldEnvelope, dropped), null);
});

test("fingerprint: active-key result carries its key id; deterministic, keyed, PIN-validated", () => {
  const fpRing = keyringOf(`f1:${F1}`);
  const first = fingerprintAccessPin(TEST_PIN, fpRing);
  assert.equal(first.keyId, "f1");
  assert.match(first.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(first.fingerprint.includes(TEST_PIN), false);
  assert.equal(first.fingerprint, fingerprintAccessPin(TEST_PIN, fpRing).fingerprint);
  assert.notEqual(first.fingerprint, fingerprintAccessPin("739024", fpRing).fingerprint);
  const otherRing = keyringOf(`f1:${key()}`);
  assert.notEqual(first.fingerprint, fingerprintAccessPin(TEST_PIN, otherRing).fingerprint);
  assert.throws(() => fingerprintAccessPin("12345", fpRing));
});

test("fingerprint keyring rotation: duplicate detection survives via all-keys fingerprints", () => {
  const before = keyringOf(`f1:${F1}`);
  // A historical credential fingerprinted under f1 (its stored value).
  const stored = fingerprintAccessPin(TEST_PIN, before);
  assert.equal(stored.keyId, "f1");
  // Rotate: f2 prepended as active; f1 retained.
  const after = keyringOf(`f2:${F2},f1:${F1}`);
  // New credentials fingerprint under the new active key...
  assert.equal(fingerprintAccessPin(TEST_PIN, after).keyId, "f2");
  // ...but the all-keys set still reproduces the f1-era value, so the stored
  // history still recognizes the same PIN as taken.
  const all = fingerprintAccessPinAllKeys(TEST_PIN, after);
  assert.equal(all.length, 2);
  assert.ok(all.some((entry) => entry.keyId === "f1" && entry.fingerprint === stored.fingerprint));
  assert.ok(all.some((entry) => entry.keyId === "f2" && entry.fingerprint !== stored.fingerprint));
  assert.throws(() => fingerprintAccessPinAllKeys("12345", after));
});

test("encrypt refuses non-PIN values and never echoes the value in the error", () => {
  const ring = keyringOf(`k1:${K1}`);
  try {
    encryptAccessPin("secret-not-a-pin", ring);
    assert.fail("must throw");
  } catch (error) {
    assert.equal((error as Error).message.includes("secret-not-a-pin"), false);
  }
});

test("config problem detection: missing pieces and fingerprint/vault key reuse", () => {
  const ring = keyringOf(`k1:${K1}`);
  const fpRing = keyringOf(`f1:${F1}`);
  assert.equal(accessPinVaultConfigProblem(null, fpRing), "missing_vault_keys");
  assert.equal(accessPinVaultConfigProblem(ring, null), "missing_fingerprint_keys");
  const reused = keyringOf(`f1:${F1},f2:${K1}`); // second entry reuses a vault key
  assert.equal(accessPinVaultConfigProblem(ring, reused), "fingerprint_key_reuses_vault_key");
  assert.equal(accessPinVaultConfigProblem(ring, fpRing), null);
});
