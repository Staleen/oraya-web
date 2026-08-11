/**
 * Card checkout behaviour — Oraya's own control panel for the things
 * CyberSource's dashboard cannot change.
 *
 * For this integration the Business Center UI is decoration. Oraya creates the
 * capture context and authorizes server-side with a transient token, so
 * anything named in those two requests OVERRIDES the dashboard — proven three
 * times on 2026-08-11: the fraud switch refused to turn off, the email and
 * phone fields ignored the dashboard entirely, and the only webhook event on
 * offer does not apply to our flow.
 *
 * Rather than leave those decisions as constants only an engineer can move,
 * they live in `settings` and are edited from Ops → Payments.
 *
 * Every default reproduces today's live behaviour exactly, so reading a missing
 * or malformed setting can never change how money is taken.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export const CHECKOUT_BEHAVIOUR_SETTING_KEY = "card_checkout_behaviour";

export type CheckoutBillingCollection = "full" | "none";

export type CheckoutBehaviour = {
  /** Ask the guest for an email at the card step. Oraya already has it. */
  request_email: boolean;
  /** Ask the guest for a phone number at the card step. Oraya already has it. */
  request_phone: boolean;
  /**
   * Billing address collection. "none" removes the last field the guest has to
   * type, at the cost of AVS having nothing to check.
   */
  billing_address: CheckoutBillingCollection;
  /**
   * Skip Decision Manager. True today because DM rejects every authorization
   * on merchant 06385000 with reason 481. Turn OFF once NetCommerce confirms
   * it is healthy — that restores fraud screening.
   */
  skip_fraud_screening: boolean;
  /**
   * true  = Sale: authorize and capture together, money moves immediately.
   * false = authorize only, hold the funds, capture later — the hotel pattern.
   */
  capture_immediately: boolean;
};

export const DEFAULT_CHECKOUT_BEHAVIOUR: CheckoutBehaviour = {
  request_email: false,
  request_phone: false,
  billing_address: "full",
  skip_fraud_screening: true,
  capture_immediately: true,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

/**
 * Parse the stored setting. Anything unreadable falls back to the live
 * defaults — a corrupt row must never silently change how cards are charged.
 */
export function parseCheckoutBehaviour(value: unknown): CheckoutBehaviour {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_CHECKOUT_BEHAVIOUR };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_CHECKOUT_BEHAVIOUR };
  }
  const record = raw as Record<string, unknown>;
  const billing = record.billing_address;
  return {
    request_email: readBoolean(record.request_email, DEFAULT_CHECKOUT_BEHAVIOUR.request_email),
    request_phone: readBoolean(record.request_phone, DEFAULT_CHECKOUT_BEHAVIOUR.request_phone),
    billing_address: billing === "none" ? "none" : "full",
    skip_fraud_screening: readBoolean(
      record.skip_fraud_screening,
      DEFAULT_CHECKOUT_BEHAVIOUR.skip_fraud_screening,
    ),
    capture_immediately: readBoolean(
      record.capture_immediately,
      DEFAULT_CHECKOUT_BEHAVIOUR.capture_immediately,
    ),
  };
}

/** The `captureMandate` block for a capture-context request. */
export function buildCaptureMandate(behaviour: CheckoutBehaviour) {
  return {
    billingType: behaviour.billing_address === "none" ? "NONE" : "FULL",
    requestEmail: behaviour.request_email,
    requestPhone: behaviour.request_phone,
    requestShipping: false,
    requestSaveCredentials: false,
    showAcceptedNetworkIcons: true,
  } as const;
}

/** Owner-facing summary of what a setting change will do to guests. */
export function describeCheckoutBehaviour(behaviour: CheckoutBehaviour): string[] {
  const lines: string[] = [];
  const asks = [
    behaviour.request_email ? "email" : null,
    behaviour.request_phone ? "phone" : null,
    behaviour.billing_address === "full" ? "billing address" : null,
  ].filter(Boolean);
  lines.push(
    asks.length === 0
      ? "Guests type only their card details."
      : `Guests are asked for their ${asks.join(", ")} again at the card step.`,
  );
  lines.push(
    behaviour.capture_immediately
      ? "Money is taken immediately when the guest pays."
      : "The card is held only. You capture the money later.",
  );
  lines.push(
    behaviour.skip_fraud_screening
      ? "Fraud screening is OFF — Decision Manager is skipped."
      : "Fraud screening is ON — Decision Manager reviews every payment.",
  );
  if (behaviour.billing_address === "none") {
    lines.push("No billing address means address verification cannot run.");
  }
  return lines;
}
