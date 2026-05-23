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
} from "@/lib/payments/provider";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

interface StripeCheckoutSession {
  id: string;
  object: "checkout.session";
  url: string | null;
  expires_at: number | null;
  amount_total: number | null;
  payment_intent?: string | null;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
}

interface StripeEventEnvelope {
  id: string;
  type: string;
  data?: {
    object?: StripeCheckoutSession;
  };
}

function getStripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return value;
}

function getStripeWebhookSecret() {
  const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!value) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return value;
}

function detectStripeEnvironment(secretKey: string | null): HostedCheckoutEnvironment {
  if (!secretKey) return "unknown";
  if (secretKey.startsWith("sk_test_")) return "sandbox";
  if (secretKey.startsWith("sk_live_")) return "live";
  return "unknown";
}

function getStripeReadiness(): HostedCheckoutProviderReadiness {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const missingRequirements: string[] = [];
  if (!secretKey) missingRequirements.push("Stripe secret key is not configured");
  if (!webhookSecret) missingRequirements.push("Stripe webhook secret is not configured");
  const configured = missingRequirements.length === 0;

  return {
    configured,
    implemented: true,
    checkout_ready: configured,
    environment: detectStripeEnvironment(secretKey),
    guest_message: configured
      ? ""
      : "Secure card payment is not available yet. Oraya will follow up with the approved payment step after reviewing your booking.",
    admin_message: configured
      ? "Stripe dev/test checkout is configured."
      : "Stripe dev/test checkout is selected, but one or more required Stripe secrets are missing.",
    missing_requirements: missingRequirements,
  };
}

function buildCheckoutLineItemName(input: CreateCheckoutSessionInput) {
  return input.purpose === "full"
    ? "Oraya booking payment"
    : "Oraya booking deposit";
}

function buildCheckoutRequestBody(input: CreateCheckoutSessionInput) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.return_url);
  params.set("cancel_url", input.cancel_url);
  params.set("client_reference_id", input.booking_id);
  params.set("locale", "en");
  params.set("submit_type", "pay");
  params.set("metadata[booking_id]", input.booking_id);
  params.set("metadata[purpose]", input.purpose);
  params.set("metadata[currency]", input.currency);
  params.set("metadata[amount_due]", roundMoney(input.amount_due).toFixed(2));
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(roundMoney(input.amount_due) * 100)));
  params.set("line_items[0][price_data][product_data][name]", buildCheckoutLineItemName(input));

  return params;
}

function parseStripeSignatureHeader(value: string | null) {
  if (!value) return null;
  const parts = value.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!timestampPart || signatures.length === 0) return null;
  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return null;

  return { timestamp, signatures };
}

function timingSafeHexMatch(expectedHex: string, candidateHex: string) {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const candidate = Buffer.from(candidateHex, "hex");
    if (expected.length !== candidate.length) return false;
    return crypto.timingSafeEqual(expected, candidate);
  } catch {
    return false;
  }
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, webhookSecret: string) {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return parsed.signatures.some((signature) => timingSafeHexMatch(expected, signature));
}

function toStripeEvent(rawBody: string): StripeEventEnvelope | null {
  try {
    const parsed = JSON.parse(rawBody) as StripeEventEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toProviderEvent(event: StripeEventEnvelope): PaymentProviderEvent | null {
  const object = event.data?.object;
  if (!object || object.object !== "checkout.session" || typeof object.id !== "string") {
    return null;
  }

  if (event.type === "checkout.session.completed") {
    return {
      kind: "session.completed",
      provider_session_id: object.id,
      amount_paid: roundMoney((object.amount_total ?? 0) / 100),
      paid_at: new Date().toISOString(),
    };
  }

  if (event.type === "checkout.session.expired") {
    return {
      kind: "session.expired",
      provider_session_id: object.id,
    };
  }

  return null;
}

export const stripePaymentProvider: HostedCheckoutProvider = {
  key: "stripe",
  display_name: "Stripe",
  checkout_ready: true,
  guest_setup_message: null,
  persisted_link_provider: "stripe",

  getReadiness() {
    return getStripeReadiness();
  },

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    const secretKey = getStripeSecretKey();
    const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `oraya-booking-${input.booking_id}-${input.purpose}-${Math.round(roundMoney(input.amount_due) * 100)}`,
      },
      body: buildCheckoutRequestBody(input),
      cache: "no-store",
    });

    const payload = (await response.json()) as StripeCheckoutSession & { error?: { message?: string } };
    if (!response.ok || !payload || typeof payload.id !== "string" || typeof payload.url !== "string" || typeof payload.expires_at !== "number") {
      throw new Error(payload?.error?.message || "Stripe checkout session could not be created.");
    }

    return {
      payment_link_url: payload.url,
      expires_at: new Date(payload.expires_at * 1000).toISOString(),
      provider_session_id: payload.id,
    };
  },

  async verifyWebhook(input) {
    let webhookSecret: string;
    try {
      webhookSecret = getStripeWebhookSecret();
    } catch {
      return { ok: false } as const;
    }

    const signatureHeader = input.headers["stripe-signature"] ?? null;
    if (!verifyStripeSignature(input.rawBody, signatureHeader, webhookSecret)) {
      return { ok: false } as const;
    }

    const parsedEvent = toStripeEvent(input.rawBody);
    if (!parsedEvent) {
      return { ok: false } as const;
    }

    const providerEvent = toProviderEvent(parsedEvent);
    if (!providerEvent) {
      return { ok: false } as const;
    }

    return { ok: true, event: providerEvent } as const;
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
