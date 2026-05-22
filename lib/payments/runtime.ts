import { creditLibanaisPaymentProvider } from "@/lib/payments/credit-libanais";
import {
  HOSTED_CHECKOUT_PROVIDER_KEYS,
  isHostedCheckoutProviderKey,
  PaymentProviderConfigurationError,
  type HostedCheckoutProvider,
  type HostedCheckoutProviderKey,
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

export function getHostedCheckoutPublicStatus() {
  try {
    const provider = getConfiguredHostedCheckoutProvider();
    return {
      provider_key: provider.key,
      provider_display_name: provider.display_name,
      online_checkout_ready: provider.checkout_ready && provider.persisted_link_provider !== null,
      online_checkout_message:
        provider.checkout_ready && provider.persisted_link_provider !== null
          ? ""
          : provider.guest_setup_message ??
            `${provider.display_name} secure payment is not available yet.`,
    };
  } catch (error) {
    const message =
      error instanceof PaymentProviderConfigurationError
        ? error.message
        : "Online payment setup is in progress.";
    return {
      provider_key: null,
      provider_display_name: null,
      online_checkout_ready: false,
      online_checkout_message: message,
    };
  }
}
