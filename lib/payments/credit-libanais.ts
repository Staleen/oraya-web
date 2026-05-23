import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  HostedCheckoutEnvironment,
  HostedCheckoutProvider,
  HostedCheckoutProviderReadiness,
  PaymentBookingDelta,
  PaymentProviderEvent,
  WebhookVerificationResult,
} from "@/lib/payments/provider";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";

type CreditLibanaisAuthMethod = "pending_bank_spec";
type CreditLibanaisRequestSigningMethod = "pending_bank_spec";
type CreditLibanaisCallbackVerificationMethod = "pending_bank_spec";
type CreditLibanaisSessionCreationEndpoint = "pending_bank_spec";
type CreditLibanaisProviderSessionField = "pending_bank_spec";
type CreditLibanaisCurrencySettlementBehavior = "pending_bank_spec";

interface CreditLibanaisGatewayContract {
  merchant_id: string | null;
  gateway_url: string | null;
  session_creation_endpoint: CreditLibanaisSessionCreationEndpoint;
  auth_method: CreditLibanaisAuthMethod;
  request_signing_method: CreditLibanaisRequestSigningMethod;
  callback_verification_method: CreditLibanaisCallbackVerificationMethod;
  provider_session_id_field: CreditLibanaisProviderSessionField;
  currency_and_settlement_behavior: CreditLibanaisCurrencySettlementBehavior;
  mode: HostedCheckoutEnvironment;
}

const CREDIT_LIBANAIS_GUEST_MESSAGE =
  "Secure card payment is not available yet. Oraya will follow up with the approved payment step after reviewing your booking.";

const CREDIT_LIBANAIS_CONTRACT_REQUIREMENTS = [
  "Hosted checkout/session creation endpoint from the bank",
  "Bank auth method",
  "Bank request-signing method",
  "Bank callback verification method",
  "Provider transaction/session id field",
  "Currency support and Fresh USD settlement rules",
  "Sandbox/live credential pack",
] as const;

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readCreditLibanaisContract(): CreditLibanaisGatewayContract {
  return {
    merchant_id: readEnv("CREDIT_LIBANAIS_MERCHANT_ID"),
    gateway_url: readEnv("CREDIT_LIBANAIS_GATEWAY_URL"),
    session_creation_endpoint: "pending_bank_spec",
    auth_method: "pending_bank_spec",
    request_signing_method: "pending_bank_spec",
    callback_verification_method: "pending_bank_spec",
    provider_session_id_field: "pending_bank_spec",
    currency_and_settlement_behavior: "pending_bank_spec",
    mode: "unknown",
  };
}

function getCreditLibanaisMissingRequirements(contract: CreditLibanaisGatewayContract) {
  const missing: string[] = [];
  if (!contract.merchant_id) missing.push("Merchant ID is not configured");
  if (!readEnv("CREDIT_LIBANAIS_SECRET")) missing.push("Gateway secret/key is not configured");
  if (!contract.gateway_url) missing.push("Gateway base URL is not configured");
  if (!readEnv("CREDIT_LIBANAIS_WEBHOOK_SECRET")) {
    missing.push("Callback/webhook verification secret is not configured");
  }
  missing.push(...CREDIT_LIBANAIS_CONTRACT_REQUIREMENTS);
  return missing;
}

export function getCreditLibanaisReadiness(): HostedCheckoutProviderReadiness {
  const contract = readCreditLibanaisContract();
  const configured =
    Boolean(contract.merchant_id) &&
    Boolean(contract.gateway_url) &&
    Boolean(readEnv("CREDIT_LIBANAIS_SECRET")) &&
    Boolean(readEnv("CREDIT_LIBANAIS_WEBHOOK_SECRET"));

  return {
    configured,
    implemented: false,
    checkout_ready: false,
    environment: contract.mode,
    guest_message: CREDIT_LIBANAIS_GUEST_MESSAGE,
    admin_message: configured
      ? "Credit Libanais / MPGS credentials are present, but the adapter is still a placeholder until the bank confirms the hosted checkout and callback contract."
      : "Credit Libanais / MPGS is selected, but required bank configuration is incomplete and the real gateway contract is still pending.",
    missing_requirements: getCreditLibanaisMissingRequirements(contract),
  };
}

function getCreditLibanaisReadinessError() {
  const readiness = getCreditLibanaisReadiness();
  const requirements = readiness.missing_requirements.join("; ");
  return new PaymentProviderConfigurationError(
    `Credit Libanais hosted checkout is selected, but the bank gateway contract is not implemented yet. Outstanding requirements: ${requirements}.`,
  );
}

/**
 * Placeholder adapter for the target bank-hosted provider.
 *
 * This file intentionally models the future implementation seam without
 * inventing any successful checkout behavior before Credit Libanais / MPGS
 * delivers the official merchant contract.
 */
export const creditLibanaisPaymentProvider: HostedCheckoutProvider = {
  key: "credit_libanais",
  display_name: "Credit Libanais / MPGS",
  checkout_ready: false,
  guest_setup_message: CREDIT_LIBANAIS_GUEST_MESSAGE,
  persisted_link_provider: "credit_libanais",

  getReadiness() {
    return getCreditLibanaisReadiness();
  },

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
