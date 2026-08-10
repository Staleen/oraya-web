import { roundMoney } from "../money.ts";

export const PAYMENT_REQUEST_STATUSES = [
  "draft", "active", "partially_paid", "paid", "expired", "cancelled",
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const PAYMENT_REQUEST_PURPOSES = [
  "deposit", "balance", "full", "addon", "event", "damage", "other",
] as const;
export type LedgerPaymentPurpose = (typeof PAYMENT_REQUEST_PURPOSES)[number];

export const PAYMENT_CURRENCIES = ["USD", "LBP"] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export const PAYMENT_METHODS = [
  "cash", "bank_transfer", "card", "wallet", "transfer", "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = [
  "manual", "credit_libanais", "whish", "omt", "western_union", "suyool", "other",
] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_ALLOWED_METHODS = [
  "cash", "bank_transfer", "card", "apple_pay", "whish", "omt", "western_union", "suyool",
] as const;
export type PaymentAllowedMethod = (typeof PAYMENT_ALLOWED_METHODS)[number];

export interface PaymentRequestRow {
  id: string;
  booking_id: string | null;
  member_id: string | null;
  payer_name: string;
  payer_email: string | null;
  payer_phone: string | null;
  description: string;
  purpose: LedgerPaymentPurpose;
  amount: number;
  currency: PaymentCurrency;
  allowed_methods: PaymentAllowedMethod[];
  status: PaymentRequestStatus;
  amount_paid: number;
  amount_refunded: number;
  expires_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  public_token_ciphertext?: string;
  payment_provider?: "credit_libanais" | null;
  payment_provider_session_id?: string | null;
  checkout_started_at?: string | null;
}

export interface PaymentTransactionRow {
  id: string;
  payment_request_id: string | null;
  booking_id: string | null;
  transaction_type: "payment" | "refund" | "reversal" | "adjustment";
  status: "pending" | "confirmed" | "failed" | "reversed" | "refunded";
  amount: number;
  currency: PaymentCurrency;
  applied_amount: number;
  applied_currency: PaymentCurrency;
  exchange_rate: number | null;
  method: PaymentMethod;
  provider: PaymentProviderId;
  wallet_presentation: "apple_pay" | "google_pay" | null;
  provider_reference: string | null;
  receipt_reference: string | null;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  verified_source: "operator" | "provider" | "reconciliation";
  effective_at: string;
  created_by: string | null;
  reverses_transaction_id: string | null;
  idempotency_key?: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreatePaymentRequestInput {
  booking_id: string | null;
  member_id: string | null;
  payer_name: string;
  payer_email: string | null;
  payer_phone: string | null;
  description: string;
  purpose: LedgerPaymentPurpose;
  amount: number;
  currency: PaymentCurrency;
  allowed_methods: PaymentAllowedMethod[];
  expires_at: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max: number) {
  const parsed = text(value, max);
  return parsed || null;
}

export function parseCreatePaymentRequestInput(value: unknown):
  | { ok: true; value: CreatePaymentRequestInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid request." };
  }
  const raw = value as Record<string, unknown>;
  const payerName = text(raw.payer_name, 160);
  const description = text(raw.description, 500);
  const amount = roundMoney(Number(raw.amount));
  const allowed = Array.isArray(raw.allowed_methods)
    ? Array.from(new Set(raw.allowed_methods.filter((m): m is PaymentAllowedMethod => oneOf(PAYMENT_ALLOWED_METHODS, m))))
    : [];

  if (!payerName) return { ok: false, error: "Enter who the payment request is for." };
  if (!description) return { ok: false, error: "Enter what the payment is for." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid amount." };
  if (!oneOf(PAYMENT_CURRENCIES, raw.currency)) return { ok: false, error: "Choose USD or LBP." };
  if (!oneOf(PAYMENT_REQUEST_PURPOSES, raw.purpose)) return { ok: false, error: "Choose a payment purpose." };
  if (allowed.length === 0) return { ok: false, error: "Choose at least one way to pay." };

  const bookingId = nullableText(raw.booking_id, 64);
  if (bookingId && !UUID_PATTERN.test(bookingId)) {
    return { ok: false, error: "Choose a valid booking." };
  }
  if (bookingId && raw.currency !== "USD") {
    return {
      ok: false,
      error: "Booking balances are recorded in USD. Use USD for a booking-linked request, or create a standalone LBP request.",
    };
  }

  const payerEmail = nullableText(raw.payer_email, 320);
  if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return { ok: false, error: "Enter a valid email address, or leave it blank." };
  }

  const expiresAt = nullableText(raw.expires_at, 64);
  if (expiresAt && (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
    return { ok: false, error: "The expiry must be in the future." };
  }

  return {
    ok: true,
    value: {
      booking_id: bookingId,
      member_id: nullableText(raw.member_id, 64),
      payer_name: payerName,
      payer_email: payerEmail,
      payer_phone: nullableText(raw.payer_phone, 80),
      description,
      purpose: raw.purpose,
      amount,
      currency: raw.currency,
      allowed_methods: allowed,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    },
  };
}

export function manualRailToLedger(method: string):
  | { method: PaymentMethod; provider: PaymentProviderId }
  | null {
  switch (method.trim().toLowerCase().replace(/\s+/g, "_")) {
    case "cash": return { method: "cash", provider: "manual" };
    case "bank_transfer": return { method: "bank_transfer", provider: "manual" };
    case "whish": return { method: "wallet", provider: "whish" };
    case "omt":
    case "omt_pay": return { method: "wallet", provider: "omt" };
    case "western_union": return { method: "transfer", provider: "western_union" };
    case "suyool": return { method: "wallet", provider: "suyool" };
    case "other": return { method: "other", provider: "other" };
    default: return null;
  }
}

export function deriveRequestStatus(amount: number, paid: number): PaymentRequestStatus {
  if (paid <= 0) return "active";
  return roundMoney(paid) >= roundMoney(amount) ? "paid" : "partially_paid";
}

export function remainingRequestAmount(amount: number, paid: number) {
  return Math.max(0, roundMoney(roundMoney(amount) - roundMoney(paid)));
}

export function formatPaymentAmount(amount: number, currency: PaymentCurrency) {
  return currency === "LBP"
    ? `${Math.round(amount).toLocaleString("en-US")} LBP`
    : `$${roundMoney(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function isPublicRequestPayable(row: Pick<PaymentRequestRow, "status" | "expires_at">, now = Date.now()) {
  if (row.status !== "active" && row.status !== "partially_paid") return false;
  return !row.expires_at || Date.parse(row.expires_at) > now;
}
