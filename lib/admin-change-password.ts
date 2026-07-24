// Relative .ts import so node:test can load this module (repo test convention).
import { hashAdminPassword, isScryptHash, verifyAdminPassword } from "./admin-password.ts";

/**
 * Remediation 2 (A.1) — pure decision core for POST /api/admin/change-password.
 *
 * Rules: the CURRENT password must verify against the stored scrypt hash (an
 * admin session cookie alone is not enough), the new password is entered
 * twice and must be at least 12 characters, and the stored value is always a
 * fresh scrypt hash. Fails closed whenever a trustworthy stored hash is
 * absent (same posture as decideAdminLogin).
 */

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

export type AdminPasswordChangeDecision =
  | { outcome: "unavailable"; status: 503; reason: string }
  | { outcome: "invalid_new"; status: 400; error: string }
  | { outcome: "wrong_current"; status: 401 }
  | { outcome: "ok"; status: 200; storedValue: string };

export function decideAdminPasswordChange(input: {
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
  /** settings.admin_password row value (null/undefined when the row is missing). */
  storedValue: string | null | undefined;
  lookupFailed: boolean;
}): AdminPasswordChangeDecision {
  if (input.lookupFailed) {
    return { outcome: "unavailable", status: 503, reason: "settings_lookup_failed" };
  }
  if (input.storedValue == null || input.storedValue === "") {
    return { outcome: "unavailable", status: 503, reason: "admin_password_row_missing" };
  }
  if (!isScryptHash(input.storedValue)) {
    return { outcome: "unavailable", status: 503, reason: "stored_value_not_scrypt_hash" };
  }

  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";
  if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return {
      outcome: "invalid_new",
      status: 400,
      error: `New password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (newPassword !== confirmPassword) {
    return {
      outcome: "invalid_new",
      status: 400,
      error: "New password and confirmation do not match.",
    };
  }

  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!currentPassword || !verifyAdminPassword(currentPassword, input.storedValue)) {
    return { outcome: "wrong_current", status: 401 };
  }

  return { outcome: "ok", status: 200, storedValue: hashAdminPassword(newPassword) };
}
