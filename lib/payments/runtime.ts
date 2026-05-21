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
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new PaymentProviderConfigurationError(
        "PAYMENT_PROVIDER is required in production. Set it to `credit_libanais` for the target bank gateway or `stripe` only if Stripe is the intentional production provider.",
      );
    }
    return DEFAULT_NON_PRODUCTION_PROVIDER;
  }

  if (!isHostedCheckoutProviderKey(value)) {
    throw new PaymentProviderConfigurationError(
      `Unsupported PAYMENT_PROVIDER value "${value}". Allowed values: ${HOSTED_CHECKOUT_PROVIDER_KEYS.join(", ")}.`,
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
