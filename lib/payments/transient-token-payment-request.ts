/**
 * Pure `/pts/v2/payments` body builder for Unified Checkout transient tokens.
 * Kept free of Next/Supabase imports so node:test can load it directly.
 */

import { roundMoney } from "../money.ts";
import { payerAuthenticationActions, type PayerAuthenticationMode } from "./payer-authentication.ts";

export type TransientTokenPaymentRequestInput = {
  booking_id: string;
  provider_session_id: string;
  transient_token: string;
  amount_due: number;
  currency: "USD" | "LBP";
  merchant_reference?: string | null;
  /**
   * Skip Decision Manager for this payment (default true — see
   * DECISION_SKIP_ACTION below). Set false only when Decision Manager is
   * known to be healthy for the merchant account.
   */
  skip_decision_manager?: boolean;
  /**
   * true  = Sale (authorize + capture together, money moves now).
   * false = authorize only; capture later. Operator-controlled.
   */
  capture_immediately?: boolean;
  /**
   * 3-D Secure. Requested through the same actionList as DECISION_SKIP,
   * because for this integration the Business Center switch is decoration.
   * Defaults to "off" so an unset setting keeps today's behaviour.
   */
  payer_authentication?: PayerAuthenticationMode;
};

/**
 * CyberSource `processingInformation.actionList` value that skips the
 * Decision Manager service(s) for a payment. Documented in the CyberSource
 * REST API field reference (Ptsv2paymentsProcessingInformation.actionList):
 *
 *   "DECISION_SKIP: Use this when you want to skip Decision Manager
 *    service(s)."
 *
 * Why Oraya sends it by default (2026-08-11):
 * Decision Manager on merchant 06385000 rejects EVERY live authorization with
 * reason 481 after the issuer has already approved it, so settlement never
 * runs and no card payment can ever complete. Evidence: request ids
 * 7863958223886680704897, 7863969294066269704890, 7864119718386251604897 and
 * 7864143490846095204899 — all Auth Success + DM REJECT 481 + Settlement
 * "Not Run". The last of these carried a device fingerprint, a full billing
 * address and a CVN match, and was still rejected, so the rejection is not
 * caused by missing data. Business Center for this organisation exposes no
 * Decision Manager or Case Management screen, so the rules cannot be read or
 * tuned, and Unified Checkout refuses its own "Skip" setting with
 * "Decision Manager must be enabled to use Skip option in Fraud Detection".
 *
 * This is therefore the only lever Oraya controls. Remove this single action
 * (or pass skip_decision_manager: false) the moment NetCommerce confirms
 * Decision Manager is fixed for the merchant account.
 */
export const DECISION_SKIP_ACTION = "DECISION_SKIP" as const;

/**
 * Build the `/pts/v2/payments` body for a Unified Checkout transient token.
 *
 * Intentionally omits any server-authored billing address block. CyberSource
 * documents that fields supplied in the API request supersede the same fields
 * on the transient token. A name/country-only billing override therefore wiped
 * the full address Unified Checkout collected (billingType FULL), which
 * production Credit Libanais rejects as INVALID_REQUEST with no payment id —
 * observed 2026-08-10 on attempts after the card form rendered successfully.
 * Amount/currency stay server-authoritative for verification.
 */
export function buildTransientTokenPaymentRequest(input: TransientTokenPaymentRequestInput) {
  const skipDecisionManager = input.skip_decision_manager !== false;
  const captureImmediately = input.capture_immediately !== false;
  // One actionList carries both decisions; order does not matter to
  // CyberSource, and an empty list must be omitted entirely rather than sent
  // as [] — an empty actionList is not the same as no actionList.
  const actionList = [
    ...(skipDecisionManager ? [DECISION_SKIP_ACTION as string] : []),
    ...payerAuthenticationActions(input.payer_authentication ?? "off"),
  ];
  return {
    clientReferenceInformation: {
      // The attempt-derived merchant reference (idempotency identifier) when
      // provided; the provider session id remains the legacy fallback.
      code: input.merchant_reference?.trim() || input.provider_session_id,
      comments: `Oraya booking ${input.booking_id} session ${input.provider_session_id}`,
    },
    processingInformation: {
      commerceIndicator: "internet",
      capture: captureImmediately,
      ...(actionList.length > 0 ? { actionList } : {}),
    },
    tokenInformation: {
      transientTokenJwt: input.transient_token,
    },
    orderInformation: {
      amountDetails: {
        totalAmount: roundMoney(input.amount_due).toFixed(2),
        currency: input.currency,
      },
    },
  };
}

/**
 * When CyberSource answers without a payment resource id, HTTP 4xx means the
 * charge was refused before creation — retry-safe. 5xx/2xx-without-id stay
 * unknown (may still need Business Center reconciliation).
 */
export function isRetrySafeNonChargeHttp(input: {
  http_status: number;
  transaction_id: string | null;
}): boolean {
  return !input.transaction_id && input.http_status >= 400 && input.http_status < 500;
}
