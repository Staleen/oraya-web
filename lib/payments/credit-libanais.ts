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
    "Credit Libanais hosted checkout is selected, but the bank gateway contract is not implemented yet. Required bank details: merchant id, gateway API endpoint, authentication secret/key or certificate, success/cancel return URL format, callback/webhook signature method, supported settlement currency behavior, and Fresh USD settlement rules.",
  );
}

/**
 * Placeholder adapter for the target bank-hosted provider.
 *
 * TODO when the bank contract is available:
 * - wire merchant credentials (`CREDIT_LIBANAIS_MERCHANT_ID`, secret/key/certificate)
 * - confirm the exact gateway base URL / MPGS endpoint shape
 * - confirm success/cancel return URL registration requirements
 * - implement callback/webhook signature verification with the bank's method
 * - confirm USD charging vs settlement behavior into the Fresh USD account
 * - confirm how provider session ids are issued for idempotent reconciliation
 */
export const creditLibanaisPaymentProvider: HostedCheckoutProvider = {
  key: "credit_libanais",
  display_name: "Credit Libanais / MPGS",
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
