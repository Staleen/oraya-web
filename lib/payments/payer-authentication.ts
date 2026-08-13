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
 * So the setting has three states:
 *
 *   off               today's behaviour, byte for byte.
 *   frictionless_only RETIRED 2026-08-13 — see below.
 *   required          request authentication and refuse the payment when it
 *                     cannot be completed without a challenge. Safest for
 *                     chargebacks, and it will decline real cards — an
 *                     operator choice, made with eyes open.
 *
 * ---
 *
 * Why `frictionless_only` is retired (W7 slice 2).
 *
 * Its promise was "never blocks a guest": take the liability shift when the
 * issuer verifies silently, and continue WITHOUT it when the issuer wants a
 * challenge. The second half cannot be delivered. `PENDING_AUTHENTICATION` is
 * not an authorization Oraya can choose to accept — it means the authorization
 * was never completed and no money moved. There is nothing to "continue" with.
 * A challenged guest is therefore turned away in this mode exactly as they are
 * in `required`; the only thing the mode really changed was the wording of the
 * refusal, while telling the operator nobody would ever be stopped.
 *
 * So the mode is refused at save time (`validatePayerAuthenticationSetting`)
 * and neutralised at runtime (`resolveEffectivePayerAuthenticationMode`), which
 * keeps a hand-edited or legacy `settings` row from activating it. The stored
 * production value is `off`, so nothing in live behaviour changes.
 *
 * The real fix is a step-up screen — slices 3–6, deferred by the owner on
 * 2026-08-12. See docs/system/PHASE_16B_W7_STEP_UP_PLAN.md. This module is
 * shaped so adding it changes one branch.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type PayerAuthenticationMode = "off" | "frictionless_only" | "required";

/**
 * The mode actually applied to a payment.
 *
 * `frictionless_only` is retired, so it can never reach the provider request or
 * the response verdict. It resolves to `off` — the state that reproduces live
 * behaviour byte for byte — rather than to `required`, which would start
 * refusing real cards on a setting nobody deliberately chose.
 *
 * Deliberately NOT applied inside `parsePayerAuthenticationMode`: the save path
 * parses before it validates, so swallowing the value there would turn an
 * operator's explicit choice into a silent downgrade with nothing to see.
 */
export function resolveEffectivePayerAuthenticationMode(
  mode: PayerAuthenticationMode,
): "off" | "required" {
  return mode === "required" ? "required" : "off";
}

/** CyberSource `processingInformation.actionList` value requesting 3DS. */
export const CONSUMER_AUTHENTICATION_ACTION = "CONSUMER_AUTHENTICATION" as const;
/** Call 2: validate the finished challenge AND authorize, in one request. */
export const VALIDATE_CONSUMER_AUTHENTICATION_ACTION = "VALIDATE_CONSUMER_AUTHENTICATION" as const;

/**
 * A 3-D Secure payment is two calls, not one (W7 §2.1).
 *
 *   enrolment  — call 1. Asks the issuer whether it wants to authenticate.
 *                Either it verifies silently, or it answers
 *                `PENDING_AUTHENTICATION` with a step-up URL. **Authorizes
 *                nothing**, which is what makes an abandoned challenge safe.
 *   validation — call 2. Sent after the cardholder finishes the bank's screen,
 *                carrying the `authenticationTransactionId` from call 1. This
 *                is the call that moves money.
 *
 * With the mode off there is one call and no 3DS action at all — today's
 * request, byte for byte.
 */
export type PayerAuthenticationPhase = "enrolment" | "validation";

export function payerAuthenticationActions(
  mode: PayerAuthenticationMode,
  phase: PayerAuthenticationPhase = "enrolment",
): string[] {
  if (resolveEffectivePayerAuthenticationMode(mode) === "off") return [];
  return phase === "validation"
    ? [VALIDATE_CONSUMER_AUTHENTICATION_ACTION]
    : [CONSUMER_AUTHENTICATION_ACTION];
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
  /**
   * The JWT the BROWSER posts to `stepUpUrl` to open the bank's screen. It is
   * the cardholder's ticket into the challenge and has to reach the browser —
   * that is the protocol — but it must never be logged, stored, or put in a URL.
   */
  accessToken?: string | null;
  /**
   * Threads call 1 to call 2. Losing it means the challenge can never be
   * validated and the payment can never complete. Read from Oraya's own attempt
   * row on the way back — NEVER from the browser's post-back.
   */
  authenticationTransactionId?: string | null;
};

export type PayerAuthenticationDecision =
  /** Authenticated (or attempted) — carry on, liability shifted. */
  | { action: "proceed"; authenticated: true }
  /** No authentication, but the mode permits taking the payment anyway. */
  | { action: "proceed"; authenticated: false }
  /** Do not take this payment. `guestMessage` is safe to show. */
  | { action: "refuse"; reason: "challenge_required" | "not_authenticated"; guestMessage: string };

/**
 * Shown whenever the bank asks for a step-up. Exported because three surfaces
 * have to say the same thing: the adapter's result message and both completion
 * routes, which write their own guest copy rather than echoing the provider.
 */
export const PAYER_AUTHENTICATION_CHALLENGE_MESSAGE =
  "Your bank asked to verify this payment in a way Oraya cannot show yet. Nothing was charged — please try another card, or message us and we will take the payment directly.";
const CHALLENGE_MESSAGE = PAYER_AUTHENTICATION_CHALLENGE_MESSAGE;
const NOT_AUTHENTICATED_MESSAGE =
  "Your bank could not verify this card. Nothing was charged — please try another card, or message us and we will take the payment directly.";

function normaliseEci(eci: string | null | undefined): string {
  return (eci ?? "").trim();
}

/**
 * What to do with the authorization response.
 *
 * Fails toward NOT charging in `required`. Every other mode proceeds — which,
 * since `frictionless_only` was retired, means `off` alone.
 */
export function decidePayerAuthentication(
  mode: PayerAuthenticationMode,
  result: PayerAuthenticationResult,
): PayerAuthenticationDecision {
  if (resolveEffectivePayerAuthenticationMode(mode) === "off") {
    return { action: "proceed", authenticated: false };
  }

  const status = (result.status ?? "").trim().toUpperCase();
  const challenged = status === "PENDING_AUTHENTICATION" || Boolean(result.stepUpUrl?.trim());

  if (challenged) {
    // Oraya has no step-up screen. Never leave the guest on a dead page.
    //
    // In practice the authorization response carries PENDING_AUTHENTICATION,
    // which the adapter has already classified as a retry-safe non-charge, so
    // this branch is a belt-and-braces second reading of the same fact.
    return { action: "refuse", reason: "challenge_required", guestMessage: CHALLENGE_MESSAGE };
  }

  const eci = normaliseEci(result.eci);
  const cavv = (result.cavv ?? "").trim();
  const authenticated = Boolean(cavv) && (AUTHENTICATED_ECI.has(eci) || ATTEMPTED_ECI.has(eci));

  if (authenticated) return { action: "proceed", authenticated: true };

  return { action: "refuse", reason: "not_authenticated", guestMessage: NOT_AUTHENTICATED_MESSAGE };
}

/** Owner-facing description of each mode, for the switch panel. */
export const PAYER_AUTHENTICATION_COPY: Record<PayerAuthenticationMode, string> = {
  off: "No 3-D Secure. Chargeback liability stays with Oraya.",
  frictionless_only:
    "Unavailable. This setting promised that a guest is never stopped, and that promise cannot be kept: when the bank asks to challenge the guest, no payment is taken and there is nothing for Oraya to let through. Choose Off, or strict with the card held rather than charged.",
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
  // Refuse the retired mode out loud. Silently storing it as "off" would be the
  // same class of bug as the dropdown that saved nothing (KNOWN_BUGS #20): the
  // operator picks a setting, sees no objection, and gets something else.
  if (behaviour.payer_authentication === "frictionless_only") {
    return {
      ok: false,
      message:
        "“On, silent only” is no longer available. It promised that no guest is ever stopped, but when a bank asks to verify the guest there is no payment for Oraya to let through — that guest is turned away either way, until Oraya can show the bank’s verification screen. Choose Off, or strict 3-D Secure with the card held rather than charged.",
    };
  }
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
    authenticationTransactionId?: unknown;
  } | null;
} | null | undefined): PayerAuthenticationResult {
  const info = payload?.consumerAuthenticationInformation ?? null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    eci: str(info?.eci) ?? str(info?.ecommerceIndicator),
    cavv: str(info?.cavv),
    status: str(payload?.status),
    stepUpUrl: str(info?.stepUpUrl),
    // Both were previously dropped on the floor: `accessToken` was destructured
    // and discarded, and the transaction id was never read at all. Without them
    // there is no challenge to show and no way to validate it afterwards.
    accessToken: str(info?.accessToken),
    authenticationTransactionId: str(info?.authenticationTransactionId),
  };
}

/**
 * Is this response an issuer asking to challenge the cardholder, with
 * everything Oraya needs to run the challenge and validate it afterwards?
 *
 * Deliberately demands all three parts. A `PENDING_AUTHENTICATION` missing the
 * URL, the token or the transaction id is a challenge Oraya cannot finish — it
 * falls through to slice 1's honest refusal instead of parking an attempt in a
 * state nothing can ever move.
 */
export function readStepUpChallenge(result: PayerAuthenticationResult): {
  stepUpUrl: string;
  accessToken: string;
  authenticationTransactionId: string;
} | null {
  const status = (result.status ?? "").trim().toUpperCase();
  const stepUpUrl = (result.stepUpUrl ?? "").trim();
  const accessToken = (result.accessToken ?? "").trim();
  const authenticationTransactionId = (result.authenticationTransactionId ?? "").trim();
  const challenged = status === "PENDING_AUTHENTICATION" || Boolean(stepUpUrl);
  if (!challenged) return null;
  if (!stepUpUrl || !accessToken || !authenticationTransactionId) return null;
  return { stepUpUrl, accessToken, authenticationTransactionId };
}
