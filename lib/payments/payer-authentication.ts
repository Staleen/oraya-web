/**
 * 3-D Secure (payer authentication) for the transient-token authorization.
 *
 * Two facts drove this design.
 *
 * First, the Business Center 3DS switch is decoration for this integration,
 * exactly like the Decision Manager switch was: it reads "on" while live
 * authorizations keep coming back `ECI 7` with an empty CAVV — the issuer or
 * directory server never authenticated the cardholder. The control surface is
 * the API request, so 3DS is requested through
 * `processingInformation.actionList`, not by clicking anything.
 *
 * Second, a plain on/off toggle would be a trap. When 3DS is requested and the
 * issuer wants a challenge, CyberSource answers `PENDING_AUTHENTICATION` with
 * a step-up URL that has to be rendered to the cardholder. Oraya has no
 * step-up screen. A bare "3DS: on" would therefore take a guest who was about
 * to pay and leave them on a dead page — worse than no 3DS at all.
 *
 * So the setting has three states, and none of them can strand a guest:
 *
 *   off               today's behaviour, byte for byte.
 *   frictionless_only request authentication; take the liability shift when
 *                     the issuer grants it silently, and continue WITHOUT it
 *                     when the issuer wants a challenge.
 *   required          request authentication and refuse the payment when it
 *                     cannot be completed without a challenge. Safest for
 *                     chargebacks, and it will decline real cards — an
 *                     operator choice, made with eyes open.
 *
 * `required` is honest but lossy until a step-up screen exists; that screen is
 * the next increment, and this module is shaped so adding it changes one
 * branch.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type PayerAuthenticationMode = "off" | "frictionless_only" | "required";

/** CyberSource `processingInformation.actionList` value requesting 3DS. */
export const CONSUMER_AUTHENTICATION_ACTION = "CONSUMER_AUTHENTICATION" as const;

export function payerAuthenticationActions(mode: PayerAuthenticationMode): string[] {
  return mode === "off" ? [] : [CONSUMER_AUTHENTICATION_ACTION];
}

/**
 * ECI values that mean the cardholder was actually authenticated.
 * 05/02 = fully authenticated. 06/01 = attempted, liability still shifts.
 * 07 = no authentication happened — this is what Oraya sees live today.
 */
const AUTHENTICATED_ECI = new Set(["05", "02", "5", "2"]);
const ATTEMPTED_ECI = new Set(["06", "01", "6", "1"]);

export type PayerAuthenticationResult = {
  /** `consumerAuthenticationInformation.eci` (or ecommerceIndicator). */
  eci?: string | null;
  /** The authentication value. Empty means nothing was proven. */
  cavv?: string | null;
  /** Provider status, e.g. PENDING_AUTHENTICATION. */
  status?: string | null;
  /** Present when the issuer wants to challenge the cardholder. */
  stepUpUrl?: string | null;
};

export type PayerAuthenticationDecision =
  /** Authenticated (or attempted) — carry on, liability shifted. */
  | { action: "proceed"; authenticated: true }
  /** No authentication, but the mode permits taking the payment anyway. */
  | { action: "proceed"; authenticated: false }
  /** Do not take this payment. `guestMessage` is safe to show. */
  | { action: "refuse"; reason: "challenge_required" | "not_authenticated"; guestMessage: string };

const CHALLENGE_MESSAGE =
  "Your bank asked to verify this payment in a way Oraya cannot show yet. Nothing was charged — please try another card, or message us and we will take the payment directly.";
const NOT_AUTHENTICATED_MESSAGE =
  "Your bank could not verify this card. Nothing was charged — please try another card, or message us and we will take the payment directly.";

function normaliseEci(eci: string | null | undefined): string {
  return (eci ?? "").trim();
}

/**
 * What to do with the authorization response.
 *
 * Fails toward NOT charging in `required`, and toward completing the sale in
 * `frictionless_only` — which is the whole difference between the two modes.
 */
export function decidePayerAuthentication(
  mode: PayerAuthenticationMode,
  result: PayerAuthenticationResult,
): PayerAuthenticationDecision {
  if (mode === "off") return { action: "proceed", authenticated: false };

  const status = (result.status ?? "").trim().toUpperCase();
  const challenged = status === "PENDING_AUTHENTICATION" || Boolean(result.stepUpUrl?.trim());

  if (challenged) {
    // Oraya has no step-up screen. Never leave the guest on a dead page.
    return mode === "required"
      ? { action: "refuse", reason: "challenge_required", guestMessage: CHALLENGE_MESSAGE }
      : { action: "proceed", authenticated: false };
  }

  const eci = normaliseEci(result.eci);
  const cavv = (result.cavv ?? "").trim();
  const authenticated = Boolean(cavv) && (AUTHENTICATED_ECI.has(eci) || ATTEMPTED_ECI.has(eci));

  if (authenticated) return { action: "proceed", authenticated: true };

  return mode === "required"
    ? { action: "refuse", reason: "not_authenticated", guestMessage: NOT_AUTHENTICATED_MESSAGE }
    : { action: "proceed", authenticated: false };
}

/** Owner-facing description of each mode, for the switch panel. */
export const PAYER_AUTHENTICATION_COPY: Record<PayerAuthenticationMode, string> = {
  off: "No 3-D Secure. Chargeback liability stays with Oraya.",
  frictionless_only:
    "Ask the bank to verify the cardholder. When the bank verifies silently, liability shifts to them. When the bank wants to challenge the guest, the payment still goes through unverified — nobody gets stuck.",
  required:
    "Ask the bank to verify, and refuse the payment when it cannot. Strongest protection, and it will turn away cards whose bank wants to challenge the guest.",
};

export function parsePayerAuthenticationMode(
  value: unknown,
  fallback: PayerAuthenticationMode = "off",
): PayerAuthenticationMode {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "off" || v === "frictionless_only" || v === "required" ? v : fallback;
}

export type PayerAuthenticationSettingConflict = {
  ok: false;
  /** Safe to show the operator in the settings panel. */
  message: string;
};

/**
 * Strict 3-D Secure and immediate capture cannot both be on.
 *
 * The ECI and CAVV only arrive in the authorization RESPONSE — after the money
 * has moved, if capture ran in the same request. Refusing at that point would
 * mean refunding a guest who did nothing wrong, on a rail whose refunds have
 * already proven unreliable here. With capture deferred, the same refusal is a
 * void: the hold is released, the guest is never charged, and nothing needs to
 * come back.
 *
 * So strict mode requires "hold the card, capture later".
 */
export function validatePayerAuthenticationSetting(behaviour: {
  payer_authentication: PayerAuthenticationMode;
  capture_immediately: boolean;
}): { ok: true } | PayerAuthenticationSettingConflict {
  if (behaviour.payer_authentication === "required" && behaviour.capture_immediately) {
    return {
      ok: false,
      message:
        "Strict 3-D Secure needs the card to be held rather than charged immediately, so a payment the bank will not verify can be released instead of refunded. Set the money option to hold-and-capture-later first.",
    };
  }
  return { ok: true };
}

/** Read the authentication result out of a CyberSource payment payload. */
export function readPayerAuthenticationResult(payload: {
  status?: unknown;
  consumerAuthenticationInformation?: {
    eci?: unknown;
    ecommerceIndicator?: unknown;
    cavv?: unknown;
    accessToken?: unknown;
    stepUpUrl?: unknown;
  } | null;
} | null | undefined): PayerAuthenticationResult {
  const info = payload?.consumerAuthenticationInformation ?? null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    eci: str(info?.eci) ?? str(info?.ecommerceIndicator),
    cavv: str(info?.cavv),
    status: str(payload?.status),
    stepUpUrl: str(info?.stepUpUrl),
  };
}
