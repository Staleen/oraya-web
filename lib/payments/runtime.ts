import { creditLibanaisPaymentProvider } from "@/lib/payments/credit-libanais";
import {
  HOSTED_CHECKOUT_PROVIDER_KEYS,
  isHostedCheckoutProviderKey,
  PaymentProviderConfigurationError,
  type HostedCheckoutEnvironment,
  type HostedCheckoutProvider,
  type HostedCheckoutProviderKey,
  type PaymentLinkProvider,
} from "@/lib/payments/provider";
import { stripePaymentProvider } from "@/lib/payments/stripe";

const DEFAULT_NON_PRODUCTION_PROVIDER: HostedCheckoutProviderKey = "stripe";

const hostedCheckoutProviders: Record<HostedCheckoutProviderKey, HostedCheckoutProvider> = {
  credit_libanais: creditLibanaisPaymentProvider,
  stripe: stripePaymentProvider,
};

function readConfiguredHostedCheckoutProviderKey(): HostedCheckoutProviderKey {
  const value = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";
  if (!value) {
    if (isProduction) {
      throw new PaymentProviderConfigurationError(
        "PAYMENT_PROVIDER is required in production and must be `credit_libanais`. Stripe is not an approved Oraya production provider.",
      );
    }
    return DEFAULT_NON_PRODUCTION_PROVIDER;
  }

  if (!isHostedCheckoutProviderKey(value)) {
    throw new PaymentProviderConfigurationError(
      `Unsupported PAYMENT_PROVIDER value "${value}". Allowed values: ${HOSTED_CHECKOUT_PROVIDER_KEYS.join(", ")}.`,
    );
  }

  if (isProduction && value !== "credit_libanais") {
    throw new PaymentProviderConfigurationError(
      `PAYMENT_PROVIDER="${value}" is not allowed in production. Oraya production must use \`credit_libanais\`.`,
    );
  }

  return value;
}

export function getConfiguredHostedCheckoutProvider(): HostedCheckoutProvider {
  return hostedCheckoutProviders[readConfiguredHostedCheckoutProviderKey()];
}

export function getHostedCheckoutProviderByKey(
  providerKey: string,
): HostedCheckoutProvider | null {
  return isHostedCheckoutProviderKey(providerKey)
    ? hostedCheckoutProviders[providerKey]
    : null;
}

export interface HostedCheckoutAdminStatus {
  provider_key: HostedCheckoutProviderKey | null;
  provider_display_name: string | null;
  persisted_link_provider: PaymentLinkProvider | null;
  configured: boolean;
  implemented: boolean;
  checkout_ready: boolean;
  environment: HostedCheckoutEnvironment | null;
  guest_message: string;
  admin_message: string;
  missing_requirements: string[];
}

async function getHostedCheckoutStatusFromProvider(provider: HostedCheckoutProvider): Promise<HostedCheckoutAdminStatus> {
  const readiness = await provider.getReadiness();
  return {
    provider_key: provider.key,
    provider_display_name: provider.display_name,
    persisted_link_provider: provider.persisted_link_provider,
    configured: readiness.configured,
    implemented: readiness.implemented,
    checkout_ready: readiness.checkout_ready && provider.checkout_ready,
    environment: readiness.environment,
    guest_message: readiness.guest_message,
    admin_message: readiness.admin_message,
    missing_requirements: readiness.missing_requirements,
  };
}

export async function getHostedCheckoutAdminStatus(): Promise<HostedCheckoutAdminStatus> {
  try {
    const provider = getConfiguredHostedCheckoutProvider();
    return await getHostedCheckoutStatusFromProvider(provider);
  } catch (error) {
    const message =
      error instanceof PaymentProviderConfigurationError
        ? error.message
        : "Online payment setup is in progress.";
    return {
      provider_key: null,
      provider_display_name: null,
      persisted_link_provider: null,
      configured: false,
      implemented: false,
      checkout_ready: false,
      environment: null,
      guest_message: "Online payment setup is in progress.",
      admin_message: message,
      missing_requirements: [message],
    };
  }
}

export async function getHostedCheckoutPublicStatus() {
  const status = await getHostedCheckoutAdminStatus();
  return {
    provider_key: status.provider_key,
    provider_display_name: status.provider_display_name,
    online_checkout_ready: status.checkout_ready && status.persisted_link_provider !== null,
    online_checkout_message:
      status.checkout_ready && status.persisted_link_provider !== null
        ? ""
        : status.guest_message || "Online payment setup is in progress.",
  };
}
