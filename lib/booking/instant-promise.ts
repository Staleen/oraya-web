/**
 * Whether `/book` may tell this guest their stay can confirm instantly.
 *
 * The defect (KNOWN_BUGS #27.3): "Instant confirmation available for eligible
 * stays" rendered unconditionally on step 3 — regardless of the villa's instant
 * flag and regardless of `instant_booking_auto_confirm`, the master switch that
 * actually decides. With the master switch off, as it is in production, the
 * sentence was true for nobody.
 *
 * The rule is: **say it only when it is true for the stay in front of the
 * guest.** That means the master switch AND the villa's own flag AND the
 * stay-level eligibility the page already computes.
 *
 * `autoConfirmEnabled` is deliberately tri-state. `/book` cannot currently read
 * `instant_booking_auto_confirm` — `GET /api/settings` serves an explicit
 * allow-list of public keys and that key is not on it — so the page passes
 * `"unknown"`, and unknown means silent. A promise nobody can verify is the
 * defect being fixed; making it again on a guess would be the same bug wearing
 * a different value. When the key is added to the allow-list, pass the real
 * boolean and the sentence returns for the stays it is true for.
 */

export type AutoConfirmSwitch = boolean | "unknown";

export type InstantPromiseInput = {
  /** `settings.instant_booking_auto_confirm` — the master switch. */
  autoConfirmEnabled: AutoConfirmSwitch;
  /** `settings.instant_booking_villa_*` for the SELECTED villa. */
  villaInstantEnabled: boolean;
  /**
   * The page's existing stay-level gate: dates chosen, no calendar conflict,
   * no approval-bound or operationally-warned add-on, trust mode instant.
   */
  stayEligible: boolean;
};

/** True only when instant confirmation is genuinely available for THIS stay. */
export function canPromiseInstantConfirmation(input: InstantPromiseInput): boolean {
  if (input.autoConfirmEnabled !== true) return false;
  if (!input.villaInstantEnabled) return false;
  return input.stayEligible;
}
