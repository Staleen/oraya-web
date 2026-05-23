/**
 * MPGS placeholder surface for the Credit Libanais production integration.
 *
 * Credit Libanais is expected to provide the exact MPGS hosted-checkout
 * contract. Until then, the concrete adapter remains intentionally
 * placeholder-only and refuses to create sessions or accept callbacks.
 */
export {
  creditLibanaisPaymentProvider as mpgsPaymentProvider,
  getCreditLibanaisReadiness as getMpgsReadiness,
} from "@/lib/payments/credit-libanais";
