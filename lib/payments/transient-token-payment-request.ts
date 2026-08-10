/**
 * Pure `/pts/v2/payments` body builder for Unified Checkout transient tokens.
 * Kept free of Next/Supabase imports so node:test can load it directly.
 */

import { roundMoney } from "../money.ts";

export type TransientTokenPaymentRequestInput = {
  booking_id: string;
  provider_session_id: string;
  transient_token: string;
  amount_due: number;
  currency: "USD" | "LBP";
  merchant_reference?: string | null;
};

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
  return {
    clientReferenceInformation: {
      // The attempt-derived merchant reference (idempotency identifier) when
      // provided; the provider session id remains the legacy fallback.
      code: input.merchant_reference?.trim() || input.provider_session_id,
      comments: `Oraya booking ${input.booking_id} session ${input.provider_session_id}`,
    },
    processingInformation: {
      commerceIndicator: "internet",
      capture: true,
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
