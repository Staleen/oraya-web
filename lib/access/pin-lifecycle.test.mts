import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_CREDENTIAL_STATUSES,
  canBecomeAvailable,
  canBeDestroyed,
  ciphertextLifecycleHolds,
  confirmationPairsHold,
  isAllowedAccessCredentialTransition,
  type AccessCredentialLockState,
  type AccessCredentialStatus,
} from "./pin-lifecycle.ts";

const T = "2026-08-10T00:00:00Z";
const STAFF = "00000000-0000-0000-0000-000000000001";

function locks(partial: Partial<AccessCredentialLockState>): AccessCredentialLockState {
  return {
    installedFrontAt: null,
    installedFrontBy: null,
    installedGateAt: null,
    installedGateBy: null,
    deletedFrontAt: null,
    deletedFrontBy: null,
    deletedGateAt: null,
    deletedGateBy: null,
    ...partial,
  };
}

/** A complete (timestamp + actor) confirmation pair. */
const frontInstalled = { installedFrontAt: T, installedFrontBy: STAFF };
const gateInstalled = { installedGateAt: T, installedGateBy: STAFF };
const frontDeleted = { deletedFrontAt: T, deletedFrontBy: STAFF };
const gateDeleted = { deletedGateAt: T, deletedGateBy: STAFF };

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

test("available requires COMPLETE (timestamp + actor) installation pairs for BOTH locks", () => {
  assert.equal(canBecomeAvailable(locks({})), false);
  assert.equal(canBecomeAvailable(locks({ ...frontInstalled })), false);
  assert.equal(canBecomeAvailable(locks({ ...gateInstalled })), false);
  // Timestamp without its actor is never a complete confirmation.
  assert.equal(
    canBecomeAvailable(locks({ installedFrontAt: T, ...gateInstalled })),
    false
  );
  assert.equal(
    canBecomeAvailable(locks({ ...frontInstalled, installedGateAt: T })),
    false
  );
  assert.equal(canBecomeAvailable(locks({ ...frontInstalled, ...gateInstalled })), true);
});

test("destroyed requires COMPLETE deletion pairs for every INSTALLED lock only", () => {
  // Fully installed: both complete deletion pairs required.
  assert.equal(
    canBeDestroyed(locks({ ...frontInstalled, ...gateInstalled, ...frontDeleted })),
    false
  );
  // Deletion timestamp without its actor does not count.
  assert.equal(
    canBeDestroyed(locks({ ...frontInstalled, ...gateInstalled, ...frontDeleted, deletedGateAt: T })),
    false
  );
  assert.equal(
    canBeDestroyed(locks({ ...frontInstalled, ...gateInstalled, ...frontDeleted, ...gateDeleted })),
    true
  );
  // Partially installed (interrupted loading): only the reached lock needs a
  // complete deletion pair.
  assert.equal(canBeDestroyed(locks({ ...frontInstalled })), false);
  assert.equal(canBeDestroyed(locks({ ...frontInstalled, ...frontDeleted })), true);
  // Never installed anywhere: destroyable without deletion confirmations.
  assert.equal(canBeDestroyed(locks({})), true);
});

test("confirmation pairs: timestamp and actor are present or absent together", () => {
  assert.equal(confirmationPairsHold(locks({})), true);
  assert.equal(confirmationPairsHold(locks({ ...frontInstalled, ...gateInstalled })), true);
  assert.equal(confirmationPairsHold(locks({ installedFrontAt: T })), false);
  assert.equal(confirmationPairsHold(locks({ installedFrontBy: STAFF })), false);
  assert.equal(confirmationPairsHold(locks({ ...frontInstalled, deletedFrontAt: T })), false);
  assert.equal(confirmationPairsHold(locks({ ...frontInstalled, ...frontDeleted })), true);
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
