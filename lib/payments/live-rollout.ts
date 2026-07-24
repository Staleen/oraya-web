/**
 * Plan 4 Phase 3 (3.1) — pure decision core for the live checkout rollout
 * switch. Replaces the hardcoded sandbox-only gate.
 *
 * Fail-closed contract: checkout is ready when
 *   (a) all session env config is present, AND
 *   (b) the environment is "sandbox", OR
 *   (c) the environment is "production" AND all webhook/MLE env vars are
 *       present AND the server-side settings row `payments_live_enabled`
 *       reads exactly "true".
 * A missing row, any other value, or an UNREADABLE settings table ⇒ NOT
 * ready. The settings row is the kill switch: flipping it away from "true"
 * instantly disables live checkout without a deploy.
 *
 * Relative .ts imports so node:test can load this module (repo test convention).
 */

export const PAYMENTS_LIVE_ENABLED_SETTINGS_KEY = "payments_live_enabled";

export type PaymentsLiveSettingReadResult =
  /** value === null ⇒ the settings row does not exist. */
  | { ok: true; value: string | null }
  /** The settings table could not be read ⇒ fail closed. */
  | { ok: false };

export type LiveRolloutInput = {
  environment: "sandbox" | "production" | null;
  /** Missing session env config lines (empty = fully configured). */
  session_missing: string[];
  /** Missing webhook/MLE env var lines (empty = fully configured). */
  webhook_env_missing: string[];
  live_setting: PaymentsLiveSettingReadResult;
};

export type LiveRolloutDecision = {
  checkout_ready: boolean;
  /** Exact outstanding items blocking checkout in the CURRENT environment. */
  missing: string[];
};

export const LIVE_SETTING_UNREADABLE_MESSAGE =
  `Live rollout switch (settings row "${PAYMENTS_LIVE_ENABLED_SETTINGS_KEY}") could not be read — failing closed`;

export const LIVE_SETTING_ROW_MISSING_MESSAGE =
  `Live rollout switch is OFF: settings row "${PAYMENTS_LIVE_ENABLED_SETTINGS_KEY}" does not exist yet — enable it via admin Settings → Live card payments`;

export function liveSettingDisabledMessage(value: string) {
  return `Live rollout switch is OFF: settings row "${PAYMENTS_LIVE_ENABLED_SETTINGS_KEY}" is "${value}" (only exactly "true" enables live checkout)`;
}

export function decideCreditLibanaisCheckoutReady(input: LiveRolloutInput): LiveRolloutDecision {
  // Session config is a prerequisite in EVERY environment.
  if (input.session_missing.length > 0 || input.environment === null) {
    return { checkout_ready: false, missing: [...input.session_missing] };
  }

  if (input.environment === "sandbox") {
    return { checkout_ready: true, missing: [] };
  }

  // production — webhook/MLE env AND the explicit server-side switch.
  const missing: string[] = [...input.webhook_env_missing];

  if (!input.live_setting.ok) {
    missing.push(LIVE_SETTING_UNREADABLE_MESSAGE);
  } else if (input.live_setting.value === null) {
    missing.push(LIVE_SETTING_ROW_MISSING_MESSAGE);
  } else if (input.live_setting.value !== "true") {
    missing.push(liveSettingDisabledMessage(input.live_setting.value));
  }

  return { checkout_ready: missing.length === 0, missing };
}
