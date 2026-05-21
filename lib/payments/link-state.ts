import type {
  HostedSessionLifecycleStatus,
  BookingPaymentLifecycleStatus,
} from "@/lib/payments/domain";
import {
  isPaymentLinkProvider,
  isPaymentLinkStatus,
  type PaymentLinkProvider,
  type PaymentLinkStatus,
} from "@/lib/payments/provider";

export interface PaymentLinkStateInput {
  payment_link_status?: PaymentLinkStatus | null;
  payment_link_expires_at?: string | null;
  payment_link_provider?: PaymentLinkProvider | null;
  payment_link_url?: string | null;
  payment_status?: BookingPaymentLifecycleStatus | null;
}

export interface PaymentLinkState {
  status: HostedSessionLifecycleStatus;
  is_expired_by_time: boolean;
  has_url: boolean;
  provider: PaymentLinkProvider | null;
  url: string | null;
  expires_at: string | null;
  payment_status: BookingPaymentLifecycleStatus | null;
}

export function isPaymentLinkExpired(
  paymentLinkExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!paymentLinkExpiresAt) return false;
  const expiresAtMs = Date.parse(paymentLinkExpiresAt);
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs < nowMs;
}

export function derivePaymentLinkState(input: PaymentLinkStateInput): PaymentLinkState {
  const storedStatus = isPaymentLinkStatus(input.payment_link_status)
    ? input.payment_link_status
    : "none";
  const provider = isPaymentLinkProvider(input.payment_link_provider)
    ? input.payment_link_provider
    : null;
  const url =
    typeof input.payment_link_url === "string" && input.payment_link_url.trim()
      ? input.payment_link_url.trim()
      : null;
  const expiresAt =
    typeof input.payment_link_expires_at === "string" && input.payment_link_expires_at.trim()
      ? input.payment_link_expires_at
      : null;
  const isExpiredByTime = isPaymentLinkExpired(expiresAt);

  let status: HostedSessionLifecycleStatus = storedStatus;
  if (storedStatus === "active" && isExpiredByTime) {
    status = "expired";
  }

  return {
    status,
    is_expired_by_time: isExpiredByTime,
    has_url: Boolean(url),
    provider,
    url,
    expires_at: expiresAt,
    payment_status: input.payment_status ?? null,
  };
}
