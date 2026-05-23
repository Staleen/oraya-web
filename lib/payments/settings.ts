import { roundMoney } from "@/lib/money";

export const PAYMENT_PUBLIC_SETTINGS_KEY = "payment_public_settings";

export const PAYMENT_MODE_VALUES = [
  "request_only",
  "manual_payment",
  "online_payment",
  "hybrid",
] as const;

export type PaymentMode = (typeof PAYMENT_MODE_VALUES)[number];

export const GUEST_MANUAL_PAYMENT_RAILS = [
  "bank_transfer",
  "whish",
  "omt",
  "western_union",
  "cash",
] as const;

export type GuestManualPaymentRail = (typeof GUEST_MANUAL_PAYMENT_RAILS)[number];

export interface PaymentPublicSettings {
  active_payment_mode: PaymentMode;
  deposit_minimum_percentage: number;
  allow_full_payment: boolean;
  allow_custom_deposit: boolean;
  manual_payment_rails: GuestManualPaymentRail[];
  payment_instructions: string;
  bank_transfer_public_details: string;
  provider_display_name: string;
  online_payment_enabled: boolean;
}

export interface PaymentPublicRuntimeSettings extends PaymentPublicSettings {
  online_checkout_ready: boolean;
  online_checkout_message: string;
}

export const DEFAULT_PAYMENT_PUBLIC_SETTINGS: PaymentPublicSettings = {
  active_payment_mode: "request_only",
  deposit_minimum_percentage: 40,
  allow_full_payment: true,
  allow_custom_deposit: true,
  manual_payment_rails: ["bank_transfer", "whish", "omt", "western_union", "cash"],
  payment_instructions: "",
  bank_transfer_public_details: "",
  provider_display_name: "Credit Libanais / Online Card Payment",
  online_payment_enabled: false,
};

function isPaymentMode(value: unknown): value is PaymentMode {
  return typeof value === "string" && (PAYMENT_MODE_VALUES as readonly string[]).includes(value);
}

function isGuestManualPaymentRail(value: unknown): value is GuestManualPaymentRail {
  return typeof value === "string" && (GUEST_MANUAL_PAYMENT_RAILS as readonly string[]).includes(value);
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function parseText(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseDepositMinimumPercentage(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(100, Math.max(1, Math.round(value)));
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(1, Math.round(parsed)));
    }
  }
  return DEFAULT_PAYMENT_PUBLIC_SETTINGS.deposit_minimum_percentage;
}

function parseManualRails(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_PAYMENT_PUBLIC_SETTINGS.manual_payment_rails;
  const rails = value.filter(isGuestManualPaymentRail);
  return rails.length > 0 ? Array.from(new Set(rails)) : DEFAULT_PAYMENT_PUBLIC_SETTINGS.manual_payment_rails;
}

function parseRawSettingsObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return null;
}

export function parsePaymentPublicSettings(value: unknown): PaymentPublicSettings {
  const raw = parseRawSettingsObject(value);
  if (!raw) return { ...DEFAULT_PAYMENT_PUBLIC_SETTINGS };

  return {
    active_payment_mode: isPaymentMode(raw.active_payment_mode)
      ? raw.active_payment_mode
      : DEFAULT_PAYMENT_PUBLIC_SETTINGS.active_payment_mode,
    deposit_minimum_percentage: parseDepositMinimumPercentage(raw.deposit_minimum_percentage),
    allow_full_payment: parseBoolean(raw.allow_full_payment, DEFAULT_PAYMENT_PUBLIC_SETTINGS.allow_full_payment),
    allow_custom_deposit: parseBoolean(
      raw.allow_custom_deposit,
      DEFAULT_PAYMENT_PUBLIC_SETTINGS.allow_custom_deposit,
    ),
    manual_payment_rails: parseManualRails(raw.manual_payment_rails),
    payment_instructions: parseText(
      raw.payment_instructions,
      DEFAULT_PAYMENT_PUBLIC_SETTINGS.payment_instructions,
    ),
    bank_transfer_public_details: parseText(
      raw.bank_transfer_public_details,
      DEFAULT_PAYMENT_PUBLIC_SETTINGS.bank_transfer_public_details,
    ),
    provider_display_name:
      parseText(raw.provider_display_name, "") || DEFAULT_PAYMENT_PUBLIC_SETTINGS.provider_display_name,
    online_payment_enabled: parseBoolean(
      raw.online_payment_enabled,
      DEFAULT_PAYMENT_PUBLIC_SETTINGS.online_payment_enabled,
    ),
  };
}

export function serializePaymentPublicSettings(value: PaymentPublicSettings) {
  const normalized = parsePaymentPublicSettings(value);
  return JSON.stringify(normalized);
}

export function paymentModeAllowsPayNow(mode: PaymentMode) {
  return mode === "online_payment" || mode === "hybrid";
}

export function paymentModePrefersManualFollowUp(mode: PaymentMode) {
  return mode === "request_only" || mode === "manual_payment" || mode === "hybrid";
}

export function getManualRailLabel(rail: GuestManualPaymentRail) {
  switch (rail) {
    case "bank_transfer":
      return "Bank transfer";
    case "whish":
      return "Whish";
    case "omt":
      return "OMT";
    case "western_union":
      return "Western Union";
    case "cash":
      return "Cash";
  }
}

export function getMinimumDepositRatioFromPercentage(percentage: number) {
  const clamped = Math.min(100, Math.max(1, Math.round(percentage)));
  return clamped / 100;
}

export function formatDepositPercentageLabel(percentage: number) {
  const clamped = Math.min(100, Math.max(1, Math.round(percentage)));
  return `${clamped}%`;
}

export function getMinimumDepositAmountFromPercentage(amountTotal: number, percentage: number) {
  return roundMoney(roundMoney(amountTotal) * getMinimumDepositRatioFromPercentage(percentage));
}

export async function fetchPublicPaymentSettings(): Promise<PaymentPublicRuntimeSettings> {
  const response = await fetch(`/api/settings?key=${encodeURIComponent(PAYMENT_PUBLIC_SETTINGS_KEY)}`);
  if (!response.ok) {
    return {
      ...DEFAULT_PAYMENT_PUBLIC_SETTINGS,
      online_checkout_ready: false,
      online_checkout_message:
        "Secure card payment is not available yet. Oraya will follow up with the approved payment step after reviewing your booking.",
    };
  }
  const data = (await response.json().catch(() => ({}))) as { value?: unknown };
  const value = data.value;
  const base = parsePaymentPublicSettings(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    const ready = typeof raw.online_checkout_ready === "boolean" ? raw.online_checkout_ready : false;
    const message =
      typeof raw.online_checkout_message === "string" && raw.online_checkout_message.trim()
        ? raw.online_checkout_message.trim()
        : "Secure card payment is not available yet. Oraya will follow up with the approved payment step after reviewing your booking.";
    return {
      ...base,
      online_checkout_ready: ready,
      online_checkout_message: message,
    };
  }
  return {
    ...base,
    online_checkout_ready: false,
    online_checkout_message:
      "Secure card payment is not available yet. Oraya will follow up with the approved payment step after reviewing your booking.",
  };
}
