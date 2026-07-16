import crypto from "crypto";
import { roundMoney } from "@/lib/money";
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
const CYBERSOURCE_ALLOWED_PAYMENT_TYPES = ["PANENTRY"] as const;

type NetCommerceEnvironment = "sandbox" | "production";

interface NetCommerceConfig {
  environment: NetCommerceEnvironment | null;
  merchantId: string | null;
  keyId: string | null;
  sharedSecret: string | null;
  apiBaseUrl: string | null;
  country: string | null;
  locale: string | null;
  webhookMleKeyId: string | null;
  webhookMlePrivateKey: string | null;
  webhookMleCertificateId: string | null;
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
}

export interface CreditLibanaisTransientTokenPaymentResult {
  ok: boolean;
  approved: boolean;
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
    webhookMleKeyId: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_KEY_ID"),
    webhookMlePrivateKey: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_PRIVATE_KEY"),
    webhookMleCertificateId: readEnv("NETCOMMERCE_CYBERSOURCE_WEBHOOK_MLE_CERTIFICATE_ID"),
  };
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
  missing.push("CyberSource webhook MLE decryption/verification must be confirmed for asynchronous reconciliation and production hardening");
  return missing;
}

export function getCreditLibanaisReadiness(): HostedCheckoutProviderReadiness {
  const config = readNetCommerceConfig();
  const sessionMissing = getSessionMissingRequirements(config);
  const webhookMissing = getWebhookMissingRequirements(config);
  const configured = sessionMissing.length === 0;
  const checkoutReady = configured && config.environment === "sandbox";
  const productionGate =
    config.environment === "production"
      ? ["Production checkout remains disabled until webhook/MLE reconciliation and live rollout controls are implemented and approved"]
      : [];

  return {
    configured,
    implemented: true,
    checkout_ready: checkoutReady,
    environment: toHostedEnvironment(config.environment),
    guest_message:
      configured
        ? ""
        : "Secure online payment by Credit Libanais / NetCommerce is being prepared.",
    admin_message: checkoutReady
      ? "CyberSource Unified Checkout sandbox session creation and transient-token server authorization are configured. Webhook/MLE verification remains required for asynchronous reconciliation and production hardening."
      : configured && config.environment === "production"
        ? "CyberSource production credentials are configured, but live checkout remains disabled until webhook/MLE reconciliation and production rollout controls are implemented and approved."
      : "Credit Libanais / NetCommerce Unified Checkout is selected, but required CyberSource sandbox/production configuration is incomplete.",
    missing_requirements: [...sessionMissing, ...webhookMissing, ...productionGate],
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
    !config.locale
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
  };
}

function getReadinessError() {
  const readiness = getCreditLibanaisReadiness();
  return new PaymentProviderConfigurationError(
    `Credit Libanais / NetCommerce checkout is not configured. Outstanding requirements: ${readiness.missing_requirements.join("; ")}.`,
  );
}

function buildDigest(body: string) {
  return `SHA-256=${crypto.createHash("sha256").update(body, "utf8").digest("base64")}`;
}

function buildCyberSourceSignature({
  body,
  date,
  host,
  keyId,
  merchantId,
  path,
  sharedSecret,
}: {
  body: string;
  date: string;
  host: string;
  keyId: string;
  merchantId: string;
  path: string;
  sharedSecret: string;
}) {
  const digest = buildDigest(body);
  const signedHeaders = [
    `host: ${host}`,
    `date: ${date}`,
    `(request-target): post ${path}`,
    `digest: ${digest}`,
    `v-c-merchant-id: ${merchantId}`,
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", Buffer.from(sharedSecret, "base64"))
    .update(signedHeaders, "utf8")
    .digest("base64");

  return {
    digest,
    signature: `keyid="${keyId}", algorithm="HmacSHA256", headers="host date (request-target) digest v-c-merchant-id", signature="${signature}"`,
  };
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
  config: { country: string; locale: string },
) {
  const targetOrigin = new URL(input.payment_page_url ?? input.return_url).origin;
  if (!targetOrigin.startsWith("https://")) {
    throw new PaymentProviderConfigurationError(
      "CyberSource Unified Checkout requires an HTTPS payment page origin. Use Vercel Preview, production, or a local HTTPS tunnel for browser sandbox testing.",
    );
  }

  return {
    targetOrigins: [targetOrigin],
    country: config.country,
    locale: config.locale,
    allowedPaymentTypes: CYBERSOURCE_ALLOWED_PAYMENT_TYPES,
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
      code: input.provider_session_id,
      comments: `Oraya booking ${input.booking_id}`,
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
  const body = JSON.stringify(buildPaymentRequest(input, { country: config.country }));
  const date = new Date().toUTCString();
  const { digest, signature } = buildCyberSourceSignature({
    body,
    date,
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
      Date: date,
      Digest: digest,
      Host: apiUrl.host,
      Signature: signature,
      "v-c-merchant-id": config.merchantId,
    },
    body,
    cache: "no-store",
  });

  let payload: CyberSourcePaymentResponse | null = null;
  try {
    payload = (await response.json()) as CyberSourcePaymentResponse;
  } catch {
    payload = null;
  }

  const status = typeof payload?.status === "string" ? payload.status : null;
  const transactionId = typeof payload?.id === "string" ? payload.id : null;
  const approved = response.ok && (status === "AUTHORIZED" || status === "CAPTURED");

  return {
    ok: response.ok,
    approved,
    status,
    transaction_id: transactionId,
    reference: transactionId ?? input.provider_session_id,
    message: approved
      ? "Payment was approved by the gateway."
      : "Payment was not approved by the gateway.",
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
    }),
  );
  const date = new Date().toUTCString();
  const { digest, signature } = buildCyberSourceSignature({
    body,
    date,
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
      Date: date,
      Digest: digest,
      Host: apiUrl.host,
      Signature: signature,
      "v-c-merchant-id": config.merchantId,
    },
    body,
    cache: "no-store",
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
    const readiness = getCreditLibanaisReadiness();
    if (!readiness.checkout_ready) {
      throw getReadinessError();
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
    throw getReadinessError();
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
