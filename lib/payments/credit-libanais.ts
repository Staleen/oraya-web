import crypto from "crypto";
import { roundMoney } from "@/lib/money";
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
import {
  APPROVED_PROVIDER_PAYMENT_STATUSES,
  isApprovedProviderPaymentStatus,
  readCyberSourcePaymentStatus,
} from "@/lib/payments/provider-payment-status";
import {
  classifyProviderRefundOutcome,
  verifyRefundAmountDetails,
} from "@/lib/payments/provider-refund";
import {
  buildRefundSearchQuery,
  readRefundIdFromSearchResults,
  reconcileRefundFromProviderRecord,
} from "@/lib/payments/provider-refund-reconcile";
import {
  classifyCardSettlementState,
  classifyProviderReversalOutcome,
  isDecisionManagerReject,
  readCapturePresent,
  readProviderReasonCode,
  readReversalResponseAmountDetails,
  readRiskDecision,
  type CardSettlementState,
} from "@/lib/payments/provider-settlement";
import {
  buildTransientTokenPaymentRequest,
  isRetrySafeNonChargeHttp,
} from "@/lib/payments/transient-token-payment-request";
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

export {
  buildTransientTokenPaymentRequest,
  isRetrySafeNonChargeHttp,
} from "@/lib/payments/transient-token-payment-request";

const CREDIT_LIBANAIS_DISPLAY_NAME = "Credit Libanais / NetCommerce Unified Checkout";
const CYBERSOURCE_SESSIONS_PATH = "/uc/v1/sessions";
const CYBERSOURCE_PAYMENTS_PATH = "/pts/v2/payments";
/** Transaction Details / Transaction Search (TSS) — used only to reconcile. */
const CYBERSOURCE_TSS_TRANSACTIONS_PATH = "/tss/v2/transactions";
const CYBERSOURCE_TSS_SEARCH_PATH = "/tss/v2/searches";
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
  /** Exact opt-in. Default off — org contract has request MLE disabled. */
  requestMleEnabled: boolean;
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
  /** Unified Checkout sometimes echoes the decision here instead of/in addition to status. */
  outcome?: string;
  reason?: string;
  message?: string;
  errorInformation?: {
    reason?: string;
    message?: string;
  };
  /** Older/gateway auth failure shape — no payment resource is created. */
  response?: {
    rmsg?: string;
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
      settlementAmount?: string;
      amount?: string;
      currency?: string;
    };
  };
  creditAmountDetails?: {
    creditAmount?: string;
    currency?: string;
  };
  /** Phase 16B M1 — authorization reversal echo + settlement/risk classification. */
  reversalAmountDetails?: {
    reversedAmount?: string;
    currency?: string;
  };
  reasonCode?: string | number;
  riskInformation?: {
    profile?: { decision?: string };
  };
  applicationInformation?: {
    reasonCode?: string | number;
    applications?: Array<{
      name?: string;
      status?: string;
      reasonCode?: string | number;
    }>;
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
    // Exact opt-in only. Live evidence 2026-08-10: encrypting /pts/v2/payments
    // while the org has request MLE off yields HTTP 401 UNAUTHORIZED_USER.
    requestMleEnabled: readEnv("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_ENABLED") === "true",
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
  // Request MLE is opt-in only (org contract default: plaintext payment body).
  if (config.requestMleEnabled) {
    if (!config.requestMleCertificate) {
      missing.push("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_CERTIFICATE is not configured");
    }
    if (!config.requestMleKeyId) {
      missing.push("NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_KEY_ID is not configured");
    }
  }
  // Response MLE keys stay required so encryptedResponse can still be decrypted
  // if CyberSource enables it later; plaintext responses ignore them.
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
    !config.responseMleKeyId ||
    !config.responseMlePrivateKey ||
    (config.requestMleEnabled && (!config.requestMleCertificate || !config.requestMleKeyId))
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
    requestMleEnabled: config.requestMleEnabled,
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
    // Exactly the origin in use — the v2 client rejects unused origins
    // (UNUSED_TARGET_ORIGINS) and mismatched origins alike. The session
    // routes resolve this from the live request within the canonical family.
    targetOrigins: [targetOrigin],
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

function readProviderStringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readProviderStatus(payload: CyberSourcePaymentResponse): string | null {
  const fromPayments = readCyberSourcePaymentStatus(payload);
  if (fromPayments) return fromPayments;
  const errorReason = payload.errorInformation?.reason;
  if (typeof errorReason === "string" && errorReason.trim()) {
    return errorReason.trim().toUpperCase();
  }
  if (typeof payload.reason === "string" && payload.reason.trim()) {
    return payload.reason.trim().toUpperCase();
  }
  const rmsg = payload.response?.rmsg;
  if (typeof rmsg === "string" && rmsg.trim()) {
    // Gateway-level refusal (auth/MLE/parse) — never created a payment id.
    return "INVALID_REQUEST";
  }
  return null;
}

function verifyPaymentPayloadAmount(input: {
  requested_amount: number;
  requested_currency: string;
  payload: CyberSourcePaymentResponse | null | undefined;
}) {
  return verifyAuthorizedAmountDetails({
    requested_amount: input.requested_amount,
    requested_currency: input.requested_currency,
    response_amount_details: input.payload?.orderInformation?.amountDetails,
  });
}

/**
 * When the create-payment response is an apparent approval (or has a payment id
 * but incomplete amount details), re-fetch GET /pts/v2/payments/{id} and
 * re-verify amount/currency before classifying approved. Fail closed if the
 * follow-up cannot prove the charge.
 */
async function retrieveCyberSourcePayment(input: {
  config: ReturnType<typeof requireSessionConfig>;
  transaction_id: string;
}): Promise<CyberSourcePaymentResponse | null> {
  const path = `${CYBERSOURCE_PAYMENTS_PATH}/${encodeURIComponent(input.transaction_id)}`;
  const apiUrl = new URL(path, `${input.config.apiBaseUrl}/`);
  const authorization = await buildCyberSourceJwtAuthorization({
    body: "",
    host: apiUrl.host,
    keyId: input.config.keyId,
    merchantId: input.config.merchantId,
    path: apiUrl.pathname,
    sharedSecret: input.config.sharedSecret,
    requestMethod: "get",
  });
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: { Authorization: authorization },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    console.error("[payments/credit-libanais] payment retrieval follow-up failed:", {
      transaction_id: input.transaction_id,
      http_status: response.status,
      correlation_id: response.headers.get("v-c-correlation-id"),
    });
    return null;
  }
  try {
    return await decryptCyberSourceResponse<CyberSourcePaymentResponse>({
      body: responseBody,
      expectedKeyId: input.config.responseMleKeyId,
      responseMlePrivateKey: input.config.responseMlePrivateKey,
    });
  } catch (error) {
    console.error("[payments/credit-libanais] payment retrieval decrypt failed:", {
      transaction_id: input.transaction_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export type CreditLibanaisRefundInput = {
  payment_id: string;
  amount: number;
  currency: "USD" | "LBP";
  merchant_reference: string;
};

export type CreditLibanaisRefundResult =
  | {
      ok: true;
      outcome: "approved";
      status: string;
      refund_id: string;
      reference: string;
    }
  | {
      ok: false;
      outcome: "declined" | "ambiguous";
      status: string | null;
      refund_id: string | null;
      message: string;
      correlation_id?: string | null;
    };

/**
 * Execute a card refund against a CyberSource payment id.
 * Uses the same JWT + plaintext default contract as /pts/v2/payments.
 * Amount/currency must echo before outcome=approved (fail closed → ambiguous).
 */
export async function refundCreditLibanaisPayment(
  input: CreditLibanaisRefundInput,
): Promise<CreditLibanaisRefundResult> {
  const config = requireSessionConfig();
  const paymentId = input.payment_id.trim();
  if (!paymentId) {
    return {
      ok: false,
      outcome: "declined",
      status: null,
      refund_id: null,
      message: "Missing provider payment id.",
    };
  }
  const path = `${CYBERSOURCE_PAYMENTS_PATH}/${encodeURIComponent(paymentId)}/refunds`;
  const apiUrl = new URL(path, `${config.apiBaseUrl}/`);
  const paymentRequest = JSON.stringify({
    clientReferenceInformation: {
      code: input.merchant_reference.trim().slice(0, 50),
    },
    orderInformation: {
      amountDetails: {
        totalAmount: roundMoney(input.amount).toFixed(2),
        currency: input.currency,
      },
    },
  });
  let body = paymentRequest;
  if (config.requestMleEnabled) {
    if (!config.requestMleCertificate || !config.requestMleKeyId) {
      throw new PaymentProviderConfigurationError(
        "Request MLE is enabled but certificate/key id are not configured.",
      );
    }
    body = await encryptCyberSourceRequest({
      payload: paymentRequest,
      requestMleCertificate: config.requestMleCertificate,
      requestMleKeyId: config.requestMleKeyId,
    });
  }
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
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.text();
  const correlationId = response.headers.get("v-c-correlation-id");
  let payload: CyberSourcePaymentResponse | null = null;
  let decryptFailed = false;
  try {
    payload = await decryptCyberSourceResponse<CyberSourcePaymentResponse>({
      body: responseBody,
      expectedKeyId: config.responseMleKeyId,
      responseMlePrivateKey: config.responseMlePrivateKey,
    });
  } catch (error) {
    decryptFailed = true;
    console.error("[payments/credit-libanais] refund response decrypt failed:", {
      payment_id: paymentId,
      http_status: response.status,
      correlation_id: correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const status = payload ? readProviderStatus(payload) : null;
  const refundId = payload ? readProviderStringId(payload?.id) : null;
  const errorMessage = payload ? readProviderErrorMessage(payload) : null;
  const amountVerification = payload
    ? verifyRefundAmountDetails({
        requested_amount: input.amount,
        requested_currency: input.currency,
        payload,
      })
    : { ok: false as const, reason: "response_missing_amount_details" };
  const outcome = classifyProviderRefundOutcome({
    http_ok: response.ok,
    http_status: response.status,
    status,
    refund_id: refundId,
    amount_verified: amountVerification.ok,
    decrypt_failed: decryptFailed,
  });
  if (outcome === "approved" && refundId) {
    return {
      ok: true,
      outcome: "approved",
      status: status ?? "PENDING",
      refund_id: refundId,
      reference: refundId,
    };
  }
  console.error("[payments/credit-libanais] refund not approved:", {
    payment_id: paymentId,
    http_status: response.status,
    provider_status: status,
    refund_id: refundId,
    error_message: errorMessage,
    correlation_id: correlationId,
    outcome,
    amount_ok: amountVerification.ok,
    amount_reason: amountVerification.ok ? null : amountVerification.reason,
  });
  const failureOutcome = outcome === "declined" ? "declined" as const : "ambiguous" as const;
  return {
    ok: false,
    outcome: failureOutcome,
    status,
    refund_id: refundId,
    correlation_id: correlationId,
    message:
      failureOutcome === "ambiguous"
        ? "Refund outcome could not be confirmed. Do NOT retry — check Business Center and record the refund reference."
        : errorMessage || "The gateway did not accept the refund.",
  };
}

function readProviderErrorMessage(payload: CyberSourcePaymentResponse): string | null {
  const candidates = [
    payload.errorInformation?.message,
    payload.message,
    payload.response?.rmsg,
  ];
  for (const value of candidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    // CyberSource sometimes nests JSON in rmsg: {"error":"UNAUTHORIZED_USER",...}
    try {
      const nested = JSON.parse(trimmed) as { error?: unknown; error_description?: unknown };
      if (nested && typeof nested === "object") {
        const code = typeof nested.error === "string" ? nested.error : null;
        const description =
          typeof nested.error_description === "string" ? nested.error_description : null;
        const joined = [code, description].filter(Boolean).join(": ");
        if (joined) return joined.slice(0, 180);
      }
    } catch {
      // plain string message
    }
    return trimmed.slice(0, 180);
  }
  return null;
}

/** Non-charge CyberSource statuses — safe to release the attempt for retry. */
const RETRY_SAFE_PROVIDER_STATUSES = [
  "DECLINED",
  "INVALID_REQUEST",
  "INVALID_DATA",
  "VALIDATION_ERROR",
  "MISSING_FIELD",
] as const;

function getUnifiedCheckoutLibraryUrl(apiBaseUrl: string) {
  return new URL(CYBERSOURCE_UNIFIED_CHECKOUT_LIBRARY_PATH, `${apiBaseUrl}/`).toString();
}

export async function authorizeCreditLibanaisTransientToken(
  input: CreditLibanaisTransientTokenPaymentInput,
): Promise<CreditLibanaisTransientTokenPaymentResult> {
  const config = requireSessionConfig();
  const apiUrl = new URL(CYBERSOURCE_PAYMENTS_PATH, `${config.apiBaseUrl}/`);
  const paymentRequest = JSON.stringify(buildTransientTokenPaymentRequest(input));
  // Org contract 2026-08-10: request MLE is OFF unless explicitly enabled.
  // Live attempt cb5c93bb returned HTTP 401 UNAUTHORIZED_USER while encrypting
  // the body; /uc/v1/sessions with the same JWT shared-secret (plaintext body)
  // succeeds. /pts/v2/payments MLE is optional per CyberSource. Still encrypt
  // when NETCOMMERCE_CYBERSOURCE_REQUEST_MLE_ENABLED=true.
  let body = paymentRequest;
  if (config.requestMleEnabled) {
    if (!config.requestMleCertificate || !config.requestMleKeyId) {
      throw new PaymentProviderConfigurationError(
        "Request MLE is enabled but certificate/key id are not configured.",
      );
    }
    body = await encryptCyberSourceRequest({
      payload: paymentRequest,
      requestMleCertificate: config.requestMleCertificate,
      requestMleKeyId: config.requestMleKeyId,
    });
  }
  // Do not request response MLE (v-c-response-mle-kid) — org has it off.
  // Still decrypt when an encryptedResponse is present.
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
    },
    body,
    cache: "no-store",
    // Remediation 2.2: bound gateway latency (payment authorization).
    signal: AbortSignal.timeout(15_000),
  });

  const responseBody = await response.text();
  const correlationId = response.headers.get("v-c-correlation-id");
  const payload = await decryptCyberSourceResponse<CyberSourcePaymentResponse>({
    body: responseBody,
    expectedKeyId: config.responseMleKeyId,
    responseMlePrivateKey: config.responseMlePrivateKey,
  });

  let workingPayload = payload;
  let status = readProviderStatus(workingPayload);
  let transactionId = readProviderStringId(workingPayload?.id);
  const errorMessage = readProviderErrorMessage(workingPayload);
  if (
    !status &&
    isRetrySafeNonChargeHttp({ http_status: response.status, transaction_id: transactionId })
  ) {
    status = "INVALID_REQUEST";
  }

  // Remediation 1.7: never record a payment whose authorized amount/currency
  // differs from the requested charge (fail closed on missing details too).
  // When the create-payment body is incomplete but a payment id exists, GET
  // the payment resource once and re-verify before classifying unknown.
  let approvalVerified = false;
  let apparentApproval = response.ok && isApprovedProviderPaymentStatus(status);
  if (apparentApproval || (response.ok && Boolean(transactionId))) {
    let verification = verifyPaymentPayloadAmount({
      requested_amount: input.amount_due,
      requested_currency: input.currency,
      payload: workingPayload,
    });
    const shouldRetrievePayment =
      Boolean(transactionId) &&
      (!apparentApproval ||
        (!verification.ok &&
          (verification.reason === "response_missing_amount_details" ||
            verification.reason === "response_amount_unparsable" ||
            verification.reason === "response_currency_missing")));
    if (shouldRetrievePayment && transactionId) {
      const retrieved = await retrieveCyberSourcePayment({
        config,
        transaction_id: transactionId,
      });
      if (retrieved) {
        workingPayload = retrieved;
        const retrievedStatus = readProviderStatus(retrieved);
        if (retrievedStatus) status = retrievedStatus;
        transactionId = readProviderStringId(retrieved.id) ?? transactionId;
        apparentApproval = isApprovedProviderPaymentStatus(status);
        verification = verifyPaymentPayloadAmount({
          requested_amount: input.amount_due,
          requested_currency: input.currency,
          payload: workingPayload,
        });
      }
    }
    approvalVerified = apparentApproval && verification.ok;
    if (apparentApproval && !verification.ok) {
      const amountDetails = workingPayload?.orderInformation?.amountDetails;
      console.error(
        "[payments/credit-libanais] authorized amount verification failed - outcome is ambiguous:",
        {
          reason: verification.reason,
          booking_id: input.booking_id,
          provider_session_id: input.provider_session_id,
          transaction_id: transactionId,
          correlation_id: correlationId,
          amount_detail_keys:
            amountDetails && typeof amountDetails === "object"
              ? Object.keys(amountDetails).slice(0, 12)
              : [],
        },
      );
    }
  }

  const outcome = classifyProviderAuthorizationOutcome({
    response_ok: response.ok,
    status,
    approved_statuses: APPROVED_PROVIDER_PAYMENT_STATUSES,
    // Explicit non-charge / decline statuses release the claim for retry.
    retry_safe_decline_statuses: RETRY_SAFE_PROVIDER_STATUSES,
    approval_verified: approvalVerified,
  });

  if (outcome !== "approved") {
    console.error("[payments/credit-libanais] payment authorization not approved:", {
      booking_id: input.booking_id,
      provider_session_id: input.provider_session_id,
      http_ok: response.ok,
      http_status: response.status,
      provider_status: status,
      error_reason: workingPayload?.errorInformation?.reason ?? workingPayload?.reason ?? null,
      error_message: errorMessage,
      transaction_id: transactionId,
      correlation_id: correlationId,
      outcome,
      // Safe shape only — never log the full body (may contain PAN tokens).
      body_keys:
        workingPayload && typeof workingPayload === "object"
          ? Object.keys(workingPayload).slice(0, 12)
          : [],
    });
  }

  const approved = outcome === "approved";
  const message =
    outcome === "approved"
      ? "Payment was approved by the gateway."
      : outcome === "declined"
        ? "Payment was declined by the gateway."
        : "Payment outcome could not be verified with the gateway.";

  const diagnosticReference = [
    correlationId,
    status,
    `http${response.status}`,
    errorMessage,
  ]
    .filter((part): part is string => Boolean(part))
    .join("|")
    .slice(0, 240);

  return {
    ok: response.ok,
    approved,
    outcome,
    status,
    transaction_id: transactionId,
    // Prefer a real payment id; otherwise keep correlation + safe diagnostics
    // so ops can search Business Center / Vercel without implying a charge.
    reference: transactionId ?? (diagnosticReference || input.provider_session_id),
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

// ---------------------------------------------------------------------------
// Phase 16B M1 — settlement truth + authorization reversal (void)
// ---------------------------------------------------------------------------

export type CreditLibanaisSettlementAssessment = {
  /** false when the provider could not be reached / is not configured. */
  ok: boolean;
  state: CardSettlementState;
  provider_status: string | null;
  reason_code: string | null;
  decision_manager_reject: boolean;
};

/**
 * Ask CyberSource what actually happened to an authorization before offering
 * an owner a money-return action. Business Center is the source of truth for
 * whether money moved; this is the API view of the same record.
 *
 * Never throws for provider-side failure: an unreadable answer is "unknown",
 * and the caller must not assert either instrument on an unknown.
 */
export async function getCreditLibanaisPaymentSettlement(input: {
  payment_id: string;
}): Promise<CreditLibanaisSettlementAssessment> {
  const unknown: CreditLibanaisSettlementAssessment = {
    ok: false,
    state: "unknown",
    provider_status: null,
    reason_code: null,
    decision_manager_reject: false,
  };
  const paymentId = input.payment_id.trim();
  if (!paymentId) return unknown;

  let config: ReturnType<typeof requireSessionConfig>;
  try {
    config = requireSessionConfig();
  } catch {
    return unknown;
  }

  const payload = await retrieveCyberSourcePayment({ config, transaction_id: paymentId });
  if (!payload) return unknown;

  const status = readProviderStatus(payload);
  const reasonCode = readProviderReasonCode(payload);
  const decisionManagerReject = isDecisionManagerReject({
    reason_code: reasonCode,
    error_reason: payload.errorInformation?.reason ?? payload.reason ?? null,
    risk_decision: readRiskDecision(payload),
    status,
  });
  return {
    ok: true,
    state: classifyCardSettlementState({
      status,
      capture_present: readCapturePresent(payload),
    }),
    provider_status: status,
    reason_code: reasonCode,
    decision_manager_reject: decisionManagerReject,
  };
}

export type CreditLibanaisReversalInput = {
  payment_id: string;
  amount: number;
  currency: "USD" | "LBP";
  merchant_reference: string;
  reason?: string | null;
};

export type CreditLibanaisReversalResult =
  | {
      ok: true;
      outcome: "approved";
      status: string;
      reversal_id: string;
      reference: string;
    }
  | {
      ok: false;
      outcome: "declined" | "ambiguous";
      status: string | null;
      reversal_id: string | null;
      message: string;
      correlation_id?: string | null;
    };

/**
 * Release an approved-but-unsettled card authorization
 * (POST /pts/v2/payments/{id}/reversals).
 *
 * This is NOT a refund: no money ever left the guest's account, so nothing is
 * returned — the hold is released. Same JWT + plaintext-by-default contract as
 * /pts/v2/payments. Amount/currency must echo before outcome=approved.
 */
export async function reverseCreditLibanaisAuthorization(
  input: CreditLibanaisReversalInput,
): Promise<CreditLibanaisReversalResult> {
  const config = requireSessionConfig();
  const paymentId = input.payment_id.trim();
  if (!paymentId) {
    return {
      ok: false,
      outcome: "declined",
      status: null,
      reversal_id: null,
      message: "Missing provider payment id.",
    };
  }
  const path = `${CYBERSOURCE_PAYMENTS_PATH}/${encodeURIComponent(paymentId)}/reversals`;
  const apiUrl = new URL(path, `${config.apiBaseUrl}/`);
  const reversalRequest = JSON.stringify({
    clientReferenceInformation: {
      code: input.merchant_reference.trim().slice(0, 50),
    },
    reversalInformation: {
      amountDetails: {
        totalAmount: roundMoney(input.amount).toFixed(2),
        currency: input.currency,
      },
      reason: (input.reason?.trim() || "Authorization reversed by Oraya").slice(0, 100),
    },
  });
  let body = reversalRequest;
  if (config.requestMleEnabled) {
    if (!config.requestMleCertificate || !config.requestMleKeyId) {
      throw new PaymentProviderConfigurationError(
        "Request MLE is enabled but certificate/key id are not configured.",
      );
    }
    body = await encryptCyberSourceRequest({
      payload: reversalRequest,
      requestMleCertificate: config.requestMleCertificate,
      requestMleKeyId: config.requestMleKeyId,
    });
  }
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
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.text();
  const correlationId = response.headers.get("v-c-correlation-id");
  let payload: CyberSourcePaymentResponse | null = null;
  let decryptFailed = false;
  try {
    payload = await decryptCyberSourceResponse<CyberSourcePaymentResponse>({
      body: responseBody,
      expectedKeyId: config.responseMleKeyId,
      responseMlePrivateKey: config.responseMlePrivateKey,
    });
  } catch (error) {
    decryptFailed = true;
    console.error("[payments/credit-libanais] reversal response decrypt failed:", {
      payment_id: paymentId,
      http_status: response.status,
      correlation_id: correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const status = payload ? readProviderStatus(payload) : null;
  const reversalId = payload ? readProviderStringId(payload?.id) : null;
  const errorMessage = payload ? readProviderErrorMessage(payload) : null;
  const amountVerification = payload
    ? verifyAuthorizedAmountDetails({
        requested_amount: input.amount,
        requested_currency: input.currency,
        response_amount_details: readReversalResponseAmountDetails(payload),
      })
    : { ok: false as const, reason: "response_missing_amount_details" };
  const outcome = classifyProviderReversalOutcome({
    http_ok: response.ok,
    http_status: response.status,
    status,
    reversal_id: reversalId,
    amount_verified: amountVerification.ok,
    decrypt_failed: decryptFailed,
  });

  if (outcome === "approved" && reversalId) {
    return {
      ok: true,
      outcome: "approved",
      status: status ?? "REVERSED",
      reversal_id: reversalId,
      reference: reversalId,
    };
  }

  console.error("[payments/credit-libanais] authorization reversal not approved:", {
    payment_id: paymentId,
    http_status: response.status,
    provider_status: status,
    reversal_id: reversalId,
    error_message: errorMessage,
    correlation_id: correlationId,
    outcome,
    amount_ok: amountVerification.ok,
  });
  const failureOutcome = outcome === "declined" ? ("declined" as const) : ("ambiguous" as const);
  return {
    ok: false,
    outcome: failureOutcome,
    status,
    reversal_id: reversalId,
    correlation_id: correlationId,
    message:
      failureOutcome === "ambiguous"
        ? "Void outcome could not be confirmed. Do NOT retry — check Business Center and record the reversal reference if the hold was released."
        : errorMessage || "The gateway did not accept the void.",
  };
}


// ---------------------------------------------------------------------------
// Refund self-reconciliation (Transaction Details / Transaction Search)
// ---------------------------------------------------------------------------

/**
 * Read-only TSS call. Returns null on any failure — the caller must treat a
 * null as "still unproven" and keep the manual Business Center path.
 */
async function fetchCyberSourceJson(input: {
  config: ReturnType<typeof requireSessionConfig>;
  path: string;
  method: "GET" | "POST";
  body?: string;
}): Promise<unknown | null> {
  const apiUrl = new URL(input.path, `${input.config.apiBaseUrl}/`);
  const body = input.method === "POST" ? (input.body ?? "{}") : "";
  const authorization = await buildCyberSourceJwtAuthorization({
    body,
    host: apiUrl.host,
    keyId: input.config.keyId,
    merchantId: input.config.merchantId,
    path: apiUrl.pathname,
    sharedSecret: input.config.sharedSecret,
    ...(input.method === "GET" ? { requestMethod: "get" as const } : {}),
  });
  try {
    const response = await fetch(apiUrl, {
      method: input.method,
      headers: {
        Authorization: authorization,
        ...(input.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(input.method === "POST" ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!response.ok) {
      // 403 here usually means Transaction Search is not enabled for the
      // merchant account. That is a provider entitlement, not a bug.
      console.error("[payments/credit-libanais] transaction lookup failed:", {
        path: input.path,
        http_status: response.status,
        correlation_id: response.headers.get("v-c-correlation-id"),
      });
      return null;
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    console.error("[payments/credit-libanais] transaction lookup threw:", {
      path: input.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export type RefundReconcileResult =
  | { ok: true; refund_id: string }
  | { ok: false; reason: string };

/**
 * Ask CyberSource whether the refund we just attempted actually exists.
 *
 * Tried in order:
 *   1. Transaction Details on the refund id the gateway returned, when it
 *      returned one.
 *   2. Transaction Search by the merchant reference we sent, when it did not.
 *
 * Never asserts a refund on its own: the pure reconciler must prove a credit
 * of the exact amount and currency. Any doubt returns ok:false and the caller
 * keeps the pending claim, the retry lock, and the manual path.
 */
export async function reconcileAmbiguousCreditLibanaisRefund(input: {
  refund_id: string | null;
  merchant_reference: string;
  amount: number;
  currency: "USD" | "LBP";
}): Promise<RefundReconcileResult> {
  let config: ReturnType<typeof requireSessionConfig>;
  try {
    config = requireSessionConfig();
  } catch {
    return { ok: false, reason: "provider_not_configured" };
  }

  let refundId = input.refund_id?.trim() || null;

  if (!refundId) {
    const search = await fetchCyberSourceJson({
      config,
      path: CYBERSOURCE_TSS_SEARCH_PATH,
      method: "POST",
      body: JSON.stringify({
        query: buildRefundSearchQuery(input.merchant_reference),
        offset: 0,
        limit: 20,
        sort: "submitTimeUtc:desc",
      }),
    });
    refundId = search ? readRefundIdFromSearchResults(search) : null;
    if (!refundId) return { ok: false, reason: "refund_not_found" };
  }

  const details = await fetchCyberSourceJson({
    config,
    path: `${CYBERSOURCE_TSS_TRANSACTIONS_PATH}/${encodeURIComponent(refundId)}`,
    method: "GET",
  });
  if (!details) return { ok: false, reason: "details_unavailable" };

  const reconciliation = reconcileRefundFromProviderRecord({
    payload: details,
    requested_amount: input.amount,
    requested_currency: input.currency,
    merchant_reference: input.merchant_reference,
  });
  return reconciliation.kind === "confirmed"
    ? { ok: true, refund_id: reconciliation.refund_id }
    : { ok: false, reason: reconciliation.reason };
}
