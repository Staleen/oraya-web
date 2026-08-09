/**
 * Phase 16D Stage A — access-credential lifecycle model (DARK).
 *
 * TypeScript mirror of the database state machine enforced by
 * sql/phase-16d-access-magazine.sql (oraya_access_credential_guard + CHECK
 * constraints). Later stages validate transitions here BEFORE touching the
 * database — same pattern as lib/payments/unified-checkout-completion.ts's
 * attempt-transition graph — while the trigger remains the authority.
 *
 * States ('reserved' is deliberately omitted — Stage C allocation is a
 * single-transaction available -> disclosed CAS under an advisory lock, so a
 * two-phase hold state would only add invalid paths):
 *
 *   installing        generated + encrypted; David is copying it into the
 *                     A100 and U100. Ciphertext stays decryptable so an
 *                     interrupted loading session can resume via an AUDITED
 *                     re-reveal (event 'pin_revealed_for_loading'). It can
 *                     never silently become available — 'available' requires
 *                     both per-lock confirmations — and never silently
 *                     returns to stock; the only exits are completing both
 *                     confirmations or quarantine -> deletion -> destroyed.
 *   available         confirmed installed on BOTH locks; eligible stock.
 *   disclosed         issued to a booking. Permanent consumption: there is
 *                     no edge back to available, ever.
 *   quarantined       checkout / cancellation after disclosure / reported
 *                     failure / abandoned load. Dead but not yet removed
 *                     from the physical locks.
 *   deletion_pending  David is deleting it from the locks.
 *   destroyed         both installed locks confirmed deleted; ciphertext
 *                     erased (DB CHECK); fingerprint retained forever so the
 *                     numeric PIN can never be generated again. Terminal.
 */

export type AccessCredentialStatus =
  | "installing"
  | "available"
  | "disclosed"
  | "quarantined"
  | "deletion_pending"
  | "destroyed";

export const ACCESS_CREDENTIAL_STATUSES: readonly AccessCredentialStatus[] = [
  "installing",
  "available",
  "disclosed",
  "quarantined",
  "deletion_pending",
  "destroyed",
];

const ALLOWED_TRANSITIONS: Readonly<Record<AccessCredentialStatus, readonly AccessCredentialStatus[]>> = {
  installing: ["available", "quarantined"],
  available: ["disclosed", "quarantined"],
  disclosed: ["quarantined"],
  quarantined: ["deletion_pending"],
  deletion_pending: ["destroyed"],
  destroyed: [],
};

export function isAllowedAccessCredentialTransition(
  from: AccessCredentialStatus,
  to: AccessCredentialStatus
): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Per-lock confirmation facts, as stored on the credential row. */
export interface AccessCredentialLockState {
  installedFrontAt: string | null;
  installedGateAt: string | null;
  deletedFrontAt: string | null;
  deletedGateAt: string | null;
}

/** 'available' requires installation confirmed on BOTH locks — never one. */
export function canBecomeAvailable(locks: AccessCredentialLockState): boolean {
  return locks.installedFrontAt !== null && locks.installedGateAt !== null;
}

/**
 * 'destroyed' requires deletion confirmed on every lock that was actually
 * installed. A partially installed credential (interrupted loading) needs a
 * deletion confirmation only for the lock(s) it reached; one never installed
 * on either lock can be destroyed without any.
 */
export function canBeDestroyed(locks: AccessCredentialLockState): boolean {
  return (
    (locks.installedFrontAt === null || locks.deletedFrontAt !== null) &&
    (locks.installedGateAt === null || locks.deletedGateAt !== null)
  );
}

/**
 * Ciphertext-erasure invariant (DB CHECK access_credentials_ciphertext_lifecycle):
 * decryptable ciphertext exists exactly while the credential is not
 * destroyed. Destroyed rows keep only the keyed fingerprint.
 */
export function ciphertextLifecycleHolds(
  status: AccessCredentialStatus,
  pinCiphertext: string | null
): boolean {
  return (status === "destroyed") === (pinCiphertext === null);
}
