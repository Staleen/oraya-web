import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_CREDENTIAL_STATUSES,
  canBecomeAvailable,
  canBeDestroyed,
  ciphertextLifecycleHolds,
  isAllowedAccessCredentialTransition,
  type AccessCredentialLockState,
  type AccessCredentialStatus,
} from "./pin-lifecycle.ts";

const T = "2026-08-10T00:00:00Z";

function locks(partial: Partial<AccessCredentialLockState>): AccessCredentialLockState {
  return {
    installedFrontAt: null,
    installedGateAt: null,
    deletedFrontAt: null,
    deletedGateAt: null,
    ...partial,
  };
}

test("transition graph: exactly the allowed edges, nothing else", () => {
  const allowed = new Set([
    "installing>available",
    "installing>quarantined",
    "available>disclosed",
    "available>quarantined",
    "disclosed>quarantined",
    "quarantined>deletion_pending",
    "deletion_pending>destroyed",
  ]);
  for (const from of ACCESS_CREDENTIAL_STATUSES) {
    for (const to of ACCESS_CREDENTIAL_STATUSES) {
      const expected = allowed.has(`${from}>${to}`);
      assert.equal(
        isAllowedAccessCredentialTransition(from, to),
        expected,
        `${from} -> ${to} should be ${expected ? "allowed" : "refused"}`
      );
    }
  }
});

test("disclosure is permanent consumption: disclosed can never return to available or installing", () => {
  assert.equal(isAllowedAccessCredentialTransition("disclosed", "available"), false);
  assert.equal(isAllowedAccessCredentialTransition("disclosed", "installing"), false);
});

test("destroyed is terminal", () => {
  for (const to of ACCESS_CREDENTIAL_STATUSES) {
    assert.equal(isAllowedAccessCredentialTransition("destroyed", to as AccessCredentialStatus), false);
  }
});

test("quarantine cannot be skipped on the way to deletion", () => {
  assert.equal(isAllowedAccessCredentialTransition("disclosed", "deletion_pending"), false);
  assert.equal(isAllowedAccessCredentialTransition("disclosed", "destroyed"), false);
  assert.equal(isAllowedAccessCredentialTransition("available", "destroyed"), false);
  assert.equal(isAllowedAccessCredentialTransition("installing", "disclosed"), false);
});

test("available requires BOTH lock installation confirmations — one is never enough", () => {
  assert.equal(canBecomeAvailable(locks({})), false);
  assert.equal(canBecomeAvailable(locks({ installedFrontAt: T })), false);
  assert.equal(canBecomeAvailable(locks({ installedGateAt: T })), false);
  assert.equal(canBecomeAvailable(locks({ installedFrontAt: T, installedGateAt: T })), true);
});

test("destroyed requires deletion confirmation for every INSTALLED lock only", () => {
  // Fully installed: both deletions required.
  assert.equal(
    canBeDestroyed(locks({ installedFrontAt: T, installedGateAt: T, deletedFrontAt: T })),
    false
  );
  assert.equal(
    canBeDestroyed(locks({ installedFrontAt: T, installedGateAt: T, deletedFrontAt: T, deletedGateAt: T })),
    true
  );
  // Partially installed (interrupted loading): only the reached lock needs a
  // deletion confirmation.
  assert.equal(canBeDestroyed(locks({ installedFrontAt: T })), false);
  assert.equal(canBeDestroyed(locks({ installedFrontAt: T, deletedFrontAt: T })), true);
  // Never installed anywhere: destroyable without deletion confirmations.
  assert.equal(canBeDestroyed(locks({})), true);
});

test("ciphertext exists exactly while not destroyed (erasure invariant)", () => {
  for (const status of ACCESS_CREDENTIAL_STATUSES) {
    if (status === "destroyed") {
      assert.equal(ciphertextLifecycleHolds(status, null), true);
      assert.equal(ciphertextLifecycleHolds(status, "apv1.k1.iv.tag.ct"), false);
    } else {
      assert.equal(ciphertextLifecycleHolds(status, "apv1.k1.iv.tag.ct"), true);
      assert.equal(ciphertextLifecycleHolds(status, null), false);
    }
  }
});
