import crypto from "crypto";
import { roundMoney } from "@/lib/money";
import { expandTargetOrigins } from "@/lib/payments/target-origin";
import { verifyAuthorizedAmountDetails } from "@/lib/payments/authorized-amount";
import {
  classifyProviderAuthorizationOutcome,
  type ProviderAuthorizationOutcome,
} from "@/lib/payments/unified-checkout-completion";
import { decideCreditLibanaisCheckoutReady } from "@/lib/payments/live-rollout";
import { readPaymentsLiveSetting } from "@/lib/payments/live-rollout-setting";
import {
  buildCyberSourceJwtAuthorization,
  decryptCyberSourceResponse,
  encryptCyberSourceRequest,
} from "@/lib/payments/cybersource-jwt-mle";
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

const CREDIT_LIBANAIS_DISPLAY_NAME = "Credit Libanais / NetCommerce Unified Checkout";
const CYBERSOURCE_SESSIONS_PATH = "/uc/v1/sessions";
const CYBERSOURCE_PAYMENTS_PATH = "/pts/v2/payments";
const CYBERSOURCE_UNIFIED_CHECKOUT_LIBRARY_PATH = "/uc/v1/assets/1.0.0/UnifiedCheckout.js";
const DEFAULT_CAPTURE_CONTEXT_TTL_MINUTES = 20;
const CYBERSOURCE_CARD_PAYMENT_TYPE = "PANENTRY" as const;
const CYBERSOURCE_APPLE_PAY_PAYMENT_TYPE = "APPLEPAY" as const;

type NetCommerceEnvironment = "sandbox" | "production";

interface NetCommerceConfig {
  environment: NetCommerceEnvironment | null;
  merchantId: string | null;
  keyId: string | null;
  sharedSecret: string | null;
  apiBaseUrl: string | null;
  country: string | null;
  locale: string | null;
  requestMleCertificate: string | null;
  requestMleKeyId: string | null;
  responseMleKeyId: string | null;
  responseMlePrivateKey: string | null;
  webhookMleKeyId: string | null;
  webhookMlePrivateKey: string | null;
  webhookMleCertificateId: string | null;
  webhookSignatureKeyId: string | null;
  webhookSignatureSecret: string | null;
  applePayEnabled: boolean;
}

export interface CreditLibanaisUnifiedCheckoutSession {
  capture_context: string;
  client_library: string;
  client_library_integrity: string | null;
  provider_session_id: string;
  expires_at: string;
}

export interface CreditLibanaisTransientTokenPaymentInput {
  booking_id: string;
  provider_session_id: string;
  transient_token: string;
  amount_due: number;
  currency: "USD" | "LBP";
  guest_name?: string | null;
  guest_email?: string | null;
  /**
   * Plan 3 Phase 3 (KNOWN_BUGS #14): deterministic per-attempt merchant
   * reference (deriveMerchantReference in unified-checkout-completion.ts).
   * When set it is sent as clientReferenceInformation.code so a retry can be
   * reconciled against exactly one provider operation.
   */
  merchant_reference?: string | null;
}

export interface CreditLibanaisTransientTokenPaymentResult {
  ok: boolean;
  approved: boolean;
  outcome: ProviderAuthorizationOutcome;
  status: string | null;
  transaction_id: string | null;
  reference: string;
  message: string;
}

interface CyberSourcePaymentResponse {
  id?: string;
  status?: string;
  errorInformation?: {
    reason?: string;
    message?: string;
  };
  processorInformation?: {
    responseCode?: string;
    approvalCode?: string;
  };
  clientReferenceInformation?: {
    code?: string;
  };
  orderInformation?: {
    amountDetails?: {
      totalAmount?: string;
      authorizedAmount?: string;
      currency?: string;
    };
  };
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readNetCommerceConfig(): NetCommerceConfig {
  const environmentValue = readEnv("NETCOMMERCE_CYBERSOURCE_ENVIRONMENT");
  const environment =
    environmentValue === "sandbox" || environmentValue === "production"
      ? environmentValue
      : null;

  return {
    environment,
    merchantId: readEnv("NETCOMMERCE_CYBERSOURCE_MERCHANT_ID"),
    keyId: readEnv("NETCOMMERCE_CYBERSOURCE_KEY_ID"),
    sharedSecret: readEnv("NETCOMMERCE_CYBERSOURCE_SHARED_SECRET"),
    apiBaseUrl: readEnv("NETCOMMERCE_CYBERSOURCE_API_BASE_URL"),
    country: readEnv("NETCOMMERCE_CYBERSOURCE_COUNTRY"),
    locale: readEnv("NETCOMMERCE_CYBERSOURCE_LOCALE"),
    requestMleCertificate: readEnv("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_CERTIFICATE"),
    requestMleKeyId: readEnv("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_KEY_ID"),
    responseMleKeyId: readEnv("NETCOMMERCE_CYBERSOURCE_RESPONSE_MLE_KEY_ID"),
    responseMlePrivateKey: readEnv("NETCOMMERCE_CYBERSOURCE_RESPONSE_MLE_PRIVATE_KEY"),
    webhookMleKeyId: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID"),
    webhookMlePrivateKey: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY"),
    webhookMleCertificateId: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID"),
    webhookSignatureKeyId: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_KEY_ID"),
    webhookSignatureSecret: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_SECRET"),
    // Exact opt-in only. Set this after Business Center enrollment, domain
    // verification, and a successful Apple sandbox-device test.
    applePayEnabled: readEnv("NETCOMMERCE_CYBERSOURCE_APPLE_PAY_ENABLED") === "true",
  };
}

export function getCreditLibanaisPaymentCapabilities() {
  const config = readNetCommerceConfig();
  return { apple_pay_enabled: config.applePayEnabled } as const;
}

function toHostedEnvironment(environment: NetCommerceEnvironment | null): HostedCheckoutEnvironment {
  if (environment === "sandbox") return "sandbox";
  if (environment === "production") return "live";
  return "unknown";
}

function getSessionMissingRequirements(config: NetCommerceConfig) {
  const missing: string[] = [];
  if (!config.environment) {
    missing.push("NETCOMMERCE_CYBERSOURCE_ENVIRONMENT must be sandbox or production");
  }
  if (!config.merchantId) missing.push("NETCOMMERCE_CYBERSOURCE_MERCHANT_ID is not configured");
  if (!config.keyId) missing.push("NETCOMMERCE_CYBERSOURCE_KEY_ID is not configured");
  if (!config.sharedSecret) missing.push("NETCOMMERCE_CYBERSOURCE_SHARED_SECRET is not configured");
  if (!config.apiBaseUrl) missing.push("NETCOMMERCE_CYBERSOURCE_API_BASE_URL is not configured");
  if (!config.country) missing.push("NETCOMMERCE_CYBERSOURCE_COUNTRY is not configured");
  if (!config.locale) missing.push("NETCOMMERCE_CYBERSOURCE_LOCALE is not configured");
  if (!config.requestMleCertificate) {
    missing.push("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_CERTIFICATE is not configured");
  }
  if (!config.requestMleKeyId) {
    missing.push("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_KEY_ID is not configured");
  }
  if (!config.responseMleKeyId) {
    missing.push("NETCOMMERCE_CYBERSOURCE_RESPONSE_MLE_KEY_ID is not configured");
  }
  if (!config.responseMlePrivateKey) {
    missing.push("NETCOMMERCE_CYBERSOURCE_RESPONSE_MLE_PRIVATE_KEY is not configured");
  }
  return missing;
}

function getWebhookMissingRequirements(config: NetCommerceConfig) {
  const missing: string[] = [];
  if (!config.webhookMleKeyId) {
    missing.push("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID is not configured");
  }
  if (!config.webhookMlePrivateKey) {
    missing.push("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY is not configured");
  }
  if (!config.webhookMleCertificateId) {
    missing.push("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID is not configured");
  }
  if (!config.webhookSignatureKeyId) {
    missing.push("NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_KEY_ID is not configured");
  }
  if (!config.webhookSignatureSecret) {
    missing.push("NETCOMMERCE_CYBERSOURCE_WEBHOOK_SIGNATURE_SECRET is not configured");
  }
  return missing;
}

/**
 * Plan 4 Phase 3 (3.1) — async readiness with the fail-closed live rollout
 * switch. Checkout is ready when (a) session env config is complete AND
 * (b) environment is sandbox, OR (c) environment is production AND all
 * webhook/MLE env vars are present AND the `payments_live_enabled` settings
 * row reads exactly "true" (missing row / other value / unreadable settings
 * ⇒ NOT ready). The settings row is the kill switch — flipping it away from
 * "true" disables live checkout instantly, without a deploy.
 */
export async function getCreditLibanaisReadiness(): Promise<HostedCheckoutProviderReadiness> {
  const config = readNetCommerceConfig();
  const sessionMissing = getSessionMissingRequirements(config);
  const webhookEnvMissing = getWebhookMissingRequirements(config);
  const configured = sessionMissing.length === 0;

  // Only production consults the settings row — sandbox never reads it, so a
  // DB hiccup cannot block sandbox verification work.
  const liveSetting =
    configured && config.environment === "production"
      ? await readPaymentsLiveSetting()
      : ({ ok: true, value: null } as const);

  const decision = decideCreditLibanaisCheckoutReady({
    environment: config.environment,
    session_missing: sessionMissing,
    webhook_env_missing: webhookEnvMissing,
    live_setting: liveSetting,
  });

  // In sandbox the webhook/MLE vars are not gating, but they ARE required for
  // production go-live — keep them visible in the readiness panel.
  const sandboxAdvisories =
    config.environment === "sandbox"
      ? webhookEnvMissing.map((item) => `${item} (required for production go-live)`)
      : [];

  const adminMessage = decision.checkout_ready
    ? config.environment === "production"
      ? "LIVE card payments are ENABLED — production checkout is active. Kill switch: admin Settings → Live card payments."
      : "CyberSource Unified Checkout sandbox session creation, transient-token server authorization, and webhook reconciliation are configured. Production go-live additionally requires the webhook/MLE env vars and the Live card payments switch."
    : configured && config.environment === "production"
      ? `Production checkout is DISABLED (fail closed). Outstanding: ${decision.missing.join("; ")}.`
      : "Credit Libanais / NetCommerce Unified Checkout is selected, but required CyberSource sandbox/production configuration is incomplete.";

  return {
    configured,
    implemented: true,
    checkout_ready: decision.checkout_ready,
    environment: toHostedEnvironment(config.environment),
    guest_message:
      configured
        ? ""
        : "Secure online payment by Credit Libanais / NetCommerce is being prepared.",
    admin_message: adminMessage,
    missing_requirements: [...decision.missing, ...sandboxAdvisories],
  };
}

function requireSessionConfig() {
  const config = readNetCommerceConfig();
  const missing = getSessionMissingRequirements(config);
  if (
    missing.length > 0 ||
    !config.merchantId ||
    !config.keyId ||
    !config.sharedSecret ||
    !config.apiBaseUrl ||
    !config.country ||
    !config.locale ||
    !config.requestMleCertificate ||
    !config.requestMleKeyId ||
    !config.responseMleKeyId ||
    !config.responseMlePrivateKey
  ) {
    throw new PaymentProviderConfigurationError(
      `Credit Libanais / NetCommerce Unified Checkout is not configured: ${missing.join("; ")}.`,
    );
  }
  return {
    merchantId: config.merchantId,
    keyId: config.keyId,
    sharedSecret: config.sharedSecret,
    apiBaseUrl: config.apiBaseUrl.replace(/\/+$/, ""),
    country: config.country,
    locale: config.locale,
    requestMleCertificate: config.requestMleCertificate,
    requestMleKeyId: config.requestMleKeyId,
    responseMleKeyId: config.responseMleKeyId,
    responseMlePrivateKey: config.responseMlePrivateKey,
    applePayEnabled: config.applePayEnabled,
  };
}

async function getReadinessError() {
  const readiness = await getCreditLibanaisReadiness();
  return new PaymentProviderConfigurationError(
    `Credit Libanais / NetCommerce checkout is not ready. Outstanding requirements: ${readiness.missing_requirements.join("; ")}.`,
  );
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readObjectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUnifiedCheckoutContextData(payload: Record<string, unknown> | null) {
  const topLevelData = readObjectField(payload?.data);
  if (topLevelData) return topLevelData;

  const contexts = Array.isArray(payload?.ctx) ? payload?.ctx : [];
  for (const context of contexts) {
    const row = readObjectField(context);
    if (!row) continue;

    const data = readObjectField(row.data);
    if (data) return data;
  }

  return null;
}

function buildCaptureContextRequest(
  input: CreateCheckoutSessionInput,
  config: { country: string; locale: string; applePayEnabled: boolean },
) {
  const targetOrigin = new URL(input.payment_page_url ?? input.return_url).origin;
  if (!targetOrigin.startsWith("https://")) {
    throw new PaymentProviderConfigurationError(
      "CyberSource Unified Checkout requires an HTTPS payment page origin. Use Vercel Preview, production, or a local HTTPS tunnel for browser sandbox testing.",
    );
  }

  const requestedMethods = input.allowed_payment_methods?.length
    ? [...new Set(input.allowed_payment_methods)]
    : ["card" as const];
  const allowedPaymentTypes: Array<"PANENTRY" | "APPLEPAY"> = [];
  if (requestedMethods.includes("card")) allowedPaymentTypes.push(CYBERSOURCE_CARD_PAYMENT_TYPE);
  if (requestedMethods.includes("apple_pay")) {
    if (!config.applePayEnabled) {
      throw new PaymentProviderConfigurationError(
        "Apple Pay is not enrolled and verified for this CyberSource merchant/domain.",
      );
    }
    allowedPaymentTypes.push(CYBERSOURCE_APPLE_PAY_PAYMENT_TYPE);
  }
  if (allowedPaymentTypes.length === 0) {
    throw new PaymentProviderConfigurationError("No enabled online payment method was requested.");
  }

  return {
    targetOrigins: expandTargetOrigins(targetOrigin),
    country: config.country,
    locale: config.locale,
    allowedPaymentTypes,
    captureMandate: {
      billingType: "FULL",
      requestEmail: true,
      requestPhone: true,
      requestShipping: false,
      requestSaveCredentials: false,
      showAcceptedNetworkIcons: true,
    },
    data: {
      orderInformation: {
        amountDetails: {
          totalAmount: roundMoney(input.amount_due).toFixed(2),
          currency: input.currency,
        },
      },
    },
  };
}

function splitGuestName(name: string | null | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) {
    return { firstName: "Oraya", lastName: "Guest" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Guest" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function buildPaymentRequest(
  input: CreditLibanaisTransientTokenPaymentInput,
  config: { country: string },
) {
  const { firstName, lastName } = splitGuestName(input.guest_name);
  const billTo: Record<string, string> = {
    firstName,
    lastName,
    country: config.country,
  };
  if (input.guest_email?.trim()) {
    billTo.email = input.guest_email.trim();
  }

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
      billTo,
    },
  };
}

function getUnifiedCheckoutLibraryUrl(apiBaseUrl: string) {
  return new URL(CYBERSOURCE_UNIFIED_CHECKOUT_LIBRARY_PATH, `${apiBaseUrl}/`).toString();
}

export async function authorizeCreditLibanaisTransientToken(
  input: CreditLibanaisTransientTokenPaymentInput,
): Promise<CreditLibanaisTransientTokenPaymentResult> {
  const config = requireSessionConfig();
  const apiUrl = new URL(CYBERSOURCE_PAYMENTS_PATH, `${config.apiBaseUrl}/`);
  const paymentRequest = JSON.stringify(buildPaymentRequest(input, { country: config.country }));
  const body = await encryptCyberSourceRequest({
    payload: paymentRequest,
    requestMleCertificate: config.requestMleCertificate,
    requestMleKeyId: config.requestMleKeyId,
  });
  const authorization = await buildCyberSourceJwtAuthorization({
    body,
    host: apiUrl.host,
    keyId: config.keyId,
    merchantId: config.merchantId,
    path: apiUrl.pathname,
    responseMleKeyId: config.responseMleKeyId,
    sharedSecret: config.sharedSecret,
  });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      Host: apiUrl.host,
    },
    body,
    cache: "no-store",
    // Remediation 2.2: bound gateway latency (payment authorization).
    signal: AbortSignal.timeout(15_000),
  });

  const responseBody = await response.text();
  const payload = await decryptCyberSourceResponse<CyberSourcePaymentResponse>({
    body: responseBody,
    expectedKeyId: config.responseMleKeyId,
    responseMlePrivateKey: config.responseMlePrivateKey,
  });

  const status = typeof payload?.status === "string" ? payload.status : null;
  const transactionId = typeof payload?.id === "string" ? payload.id : null;
  const apparentApproval = response.ok && (status === "AUTHORIZED" || status === "CAPTURED");
  let approvalVerified = false;

  // Remediation 1.7: never record a payment whose authorized amount/currency
  // differs from the requested charge (fail closed on missing details too).
  if (apparentApproval) {
    const verification = verifyAuthorizedAmountDetails({
      requested_amount: input.amount_due,
      requested_currency: input.currency,
      response_amount_details: payload?.orderInformation?.amountDetails,
    });
    approvalVerified = verification.ok;
    if (!verification.ok) {
      console.error(
        "[payments/credit-libanais] authorized amount verification failed - outcome is ambiguous:",
        {
          reason: verification.reason,
          booking_id: input.booking_id,
          provider_session_id: input.provider_session_id,
          transaction_id: transactionId,
        },
      );
    }
  }

  const outcome = classifyProviderAuthorizationOutcome({
    response_ok: response.ok,
    status,
    approved_statuses: ["AUTHORIZED", "CAPTURED"],
    // Only the provider's explicit terminal decline is proven retry-safe.
    retry_safe_decline_statuses: ["DECLINED"],
    approval_verified: approvalVerified,
  });
  const approved = outcome === "approved";
  const message =
    outcome === "approved"
      ? "Payment was approved by the gateway."
      : outcome === "declined"
        ? "Payment was declined by the gateway."
        : "Payment outcome could not be verified with the gateway.";

  return {
    ok: response.ok,
    approved,
    outcome,
    status,
    transaction_id: transactionId,
    reference: transactionId ?? input.provider_session_id,
    message,
  };
}

export async function createCreditLibanaisUnifiedCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreditLibanaisUnifiedCheckoutSession> {
  const config = requireSessionConfig();
  const apiUrl = new URL(CYBERSOURCE_SESSIONS_PATH, `${config.apiBaseUrl}/`);
  const providerSessionId = `oraya_${crypto.randomUUID()}`;
  const body = JSON.stringify(
    buildCaptureContextRequest(input, {
      country: config.country,
      locale: config.locale,
      applePayEnabled: config.applePayEnabled,
    }),
  );
  const authorization = await buildCyberSourceJwtAuthorization({
    body,
    host: apiUrl.host,
    keyId: config.keyId,
    merchantId: config.merchantId,
    path: apiUrl.pathname,
    sharedSecret: config.sharedSecret,
  });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      Host: apiUrl.host,
    },
    body,
    cache: "no-store",
    // Remediation 2.2: bound gateway latency (session creation).
    signal: AbortSignal.timeout(10_000),
  });

  const sessionJwt = (await response.text()).trim();
  if (!response.ok || !sessionJwt) {
    throw new Error(`CyberSource Unified Checkout session could not be created. Status: ${response.status}.`);
  }

  const sessionPayload = decodeJwtPayload(sessionJwt);
  const data = readUnifiedCheckoutContextData(sessionPayload);
  const clientLibrary = data ? readStringField(data, "clientLibrary") : null;
  const clientLibraryIntegrity = data ? readStringField(data, "clientLibraryIntegrity") : null;

  return {
    capture_context: sessionJwt,
    client_library: clientLibrary ?? getUnifiedCheckoutLibraryUrl(config.apiBaseUrl),
    client_library_integrity: clientLibraryIntegrity,
    provider_session_id: providerSessionId,
    expires_at:
      input.expires_at ??
      new Date(Date.now() + DEFAULT_CAPTURE_CONTEXT_TTL_MINUTES * 60 * 1000).toISOString(),
  };
}

export const creditLibanaisPaymentProvider: HostedCheckoutProvider = {
  key: "credit_libanais",
  display_name: CREDIT_LIBANAIS_DISPLAY_NAME,
  checkout_ready: true,
  guest_setup_message:
    "Secure online payment by Credit Libanais / NetCommerce is being prepared.",
  persisted_link_provider: "credit_libanais",

  getReadiness() {
    return getCreditLibanaisReadiness();
  },

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    const readiness = await getCreditLibanaisReadiness();
    if (!readiness.checkout_ready) {
      throw await getReadinessError();
    }
    if (!input.payment_page_url) {
      throw new PaymentProviderConfigurationError("Credit Libanais checkout requires an internal Oraya payment page URL.");
    }
    return {
      payment_link_url: input.payment_page_url,
      expires_at:
        input.expires_at ??
        new Date(Date.now() + DEFAULT_CAPTURE_CONTEXT_TTL_MINUTES * 60 * 1000).toISOString(),
      provider_session_id: `pending_${crypto.randomUUID()}`,
    };
  },

  async verifyWebhook(): Promise<WebhookVerificationResult> {
    // Plan 4 Phase 2: credit_libanais webhooks never reach the generic
    // provider path — webhook-handler.ts routes them to the dedicated
    // fail-closed handler (lib/payments/credit-libanais-webhook-handler.ts).
    throw new PaymentProviderConfigurationError(
      "Credit Libanais webhooks are verified and reconciled by the dedicated webhook handler.",
    );
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
