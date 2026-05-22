import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  HostedCheckoutProvider,
  PaymentBookingDelta,
  PaymentProviderEvent,
  WebhookVerificationResult,
} from "@/lib/payments/provider";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";

function getCreditLibanaisReadinessError() {
  return new PaymentProviderConfigurationError(
    "Credit Libanais hosted checkout is selected, but the bank gateway contract is not implemented yet. Required bank details: merchant ID, gateway/API base URL, hosted checkout or session-creation endpoint, auth method, request-signing method, success/cancel return URL format, callback/webhook URL format, callback verification method, transaction/session id field, supported currencies, Fresh USD settlement rules, sandbox credentials, and production credentials.",
  );
}

/**
 * Placeholder adapter for the target bank-hosted provider.
 *
 * TODO when the bank contract is available:
 * - wire merchant credentials (`CREDIT_LIBANAIS_MERCHANT_ID`, secret/key/certificate)
 * - confirm the exact gateway/API base URL and hosted checkout/session-creation endpoint
 * - confirm the auth method and request-signing method the bank requires
 * - confirm success/cancel return URL registration requirements
 * - confirm callback/webhook URL format and implement callback verification with the bank's method
 * - confirm transaction/session id field used for idempotent reconciliation
 * - confirm currency support and USD charging vs settlement behavior into the Fresh USD account
 * - confirm sandbox credentials and production credentials
 */
export const creditLibanaisPaymentProvider: HostedCheckoutProvider = {
  key: "credit_libanais",
  display_name: "Credit Libanais / MPGS",
  checkout_ready: false,
  guest_setup_message:
    "Online payment setup is in progress. Oraya will activate secure card checkout as soon as Credit Libanais / MPGS onboarding is complete.",
  persisted_link_provider: null,

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    throw getCreditLibanaisReadinessError();
  },

  async verifyWebhook(): Promise<WebhookVerificationResult> {
    throw getCreditLibanaisReadinessError();
  },

  mapProviderEventToBookingUpdate(event: PaymentProviderEvent): PaymentBookingDelta {
    switch (event.kind) {
      case "session.completed":
        return {
          kind: "set_paid",
          amount_paid: event.amount_paid,
          payment_received_at: event.paid_at,
          payment_reference: event.provider_session_id,
        };
      case "session.expired":
        return { kind: "set_expired" };
      case "session.cancelled":
        return { kind: "set_cancelled" };
      case "session.failed":
        return { kind: "set_failed", reason: event.reason };
    }
  },
};
