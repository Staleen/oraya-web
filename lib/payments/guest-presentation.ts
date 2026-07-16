import { formatPaymentMethodLabel } from "../payment-method-labels.ts";
import type {
  BookingPaymentLifecycleStatus,
  HostedSessionLifecycleStatus,
} from "./domain.ts";

export type GuestPaymentPresentationTone = "pending" | "deposit" | "paid" | "attention";

export type GuestPaymentPresentation = {
  label: string;
  body: string;
  tone: GuestPaymentPresentationTone;
  actionUrl: string | null;
  actionLabel: string | null;
  rows: Array<[string, string]>;
  isPaid: boolean;
};

export type GuestPaymentPresentationInput = {
  paymentStatus: BookingPaymentLifecycleStatus | null;
  paymentLinkStatus: HostedSessionLifecycleStatus;
  paymentLinkUrl: string | null;
  hasActivePaymentLink: boolean;
  paymentLinkExpiresAt: string | null;
  depositAmount: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  paymentDueAt: string | null;
  paymentRequestedAt: string | null;
  paymentReceivedAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
};

function formatMoney(value: number): string {
  return `USD ${Math.round(value).toLocaleString("en-US")}`;
}

function appendPaymentDetail(
  rows: Array<[string, string]>,
  label: string,
  value: string | null | undefined,
) {
  if (value?.trim()) {
    rows.push([label, value]);
  }
}

/**
 * Canonical guest-facing payment projection.
 *
 * Authoritative recorded payment state wins over stale link state. A link marked
 * `paid` without a recorded paid lifecycle remains "being verified" so a browser
 * return or partial write cannot claim that money was received.
 */
export function buildGuestPaymentPresentation(
  input: GuestPaymentPresentationInput,
): GuestPaymentPresentation {
  const rows: Array<[string, string]> = [];
  const method = input.paymentMethod?.trim()
    ? formatPaymentMethodLabel(input.paymentMethod.trim())
    : null;
  const reference = input.paymentReference?.trim() || null;

  if (input.paymentStatus === "paid_in_full") {
    appendPaymentDetail(
      rows,
      "Amount paid",
      input.amountPaid !== null ? formatMoney(input.amountPaid) : null,
    );
    appendPaymentDetail(rows, "Method", method);
    appendPaymentDetail(rows, "Reference", reference);
    appendPaymentDetail(rows, "Received on", input.paymentReceivedAt);
    return {
      label: "Paid in full",
      body: "Payment has been recorded for this booking.",
      tone: "paid",
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: true,
    };
  }

  if (input.paymentStatus === "deposit_paid") {
    appendPaymentDetail(
      rows,
      "Amount paid",
      input.amountPaid !== null ? formatMoney(input.amountPaid) : null,
    );
    appendPaymentDetail(
      rows,
      "Remaining balance",
      input.balanceDue !== null ? formatMoney(input.balanceDue) : null,
    );
    appendPaymentDetail(rows, "Method", method);
    appendPaymentDetail(rows, "Reference", reference);
    appendPaymentDetail(rows, "Received on", input.paymentReceivedAt);
    return {
      label: "Deposit paid",
      body: "Your deposit has been recorded. Oraya will confirm any remaining balance directly.",
      tone: "deposit",
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: true,
    };
  }

  if (input.paymentLinkStatus === "expired") {
    return {
      label: "Payment link expired",
      body: "No payment has been collected yet. Oraya will send a fresh secure payment link when it is ready.",
      tone: "attention",
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: false,
    };
  }

  if (input.paymentLinkStatus === "failed" || input.paymentLinkStatus === "cancelled") {
    return {
      label: "Payment could not be completed",
      body: "No payment has been collected yet. Oraya will send a fresh secure payment link when it is ready.",
      tone: "attention",
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: false,
    };
  }

  if (input.hasActivePaymentLink && input.paymentLinkUrl) {
    appendPaymentDetail(rows, "Link expires", input.paymentLinkExpiresAt);
    appendPaymentDetail(
      rows,
      "Deposit amount",
      input.depositAmount !== null ? formatMoney(input.depositAmount) : null,
    );
    appendPaymentDetail(rows, "Due date", input.paymentDueAt);
    appendPaymentDetail(rows, "Requested on", input.paymentRequestedAt);
    return {
      label: "Payment pending",
      body: "Your secure payment link is ready. You will complete payment on Oraya's hosted payment page.",
      tone: "pending",
      actionUrl: input.paymentLinkUrl,
      actionLabel: "Continue to secure payment",
      rows,
      isPaid: false,
    };
  }

  if (input.paymentLinkStatus === "paid") {
    return {
      label: "Payment pending",
      body: "Your payment was submitted. Oraya will show it as received only after provider approval is recorded.",
      tone: "pending",
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: false,
    };
  }

  if (input.paymentStatus === "payment_requested") {
    appendPaymentDetail(
      rows,
      "Deposit amount",
      input.depositAmount !== null ? formatMoney(input.depositAmount) : null,
    );
    appendPaymentDetail(rows, "Due date", input.paymentDueAt);
    appendPaymentDetail(rows, "Requested on", input.paymentRequestedAt);
  }

  return {
    label: "Payment pending",
    body: "No payment has been collected yet. Oraya will send your secure payment link when it is ready.",
    tone: "pending",
    actionUrl: null,
    actionLabel: null,
    rows,
    isPaid: false,
  };
}

export function paymentReturnMessage(
  state: string | null,
  payment: Pick<GuestPaymentPresentation, "isPaid">,
): { text: string; tone: "success" | "neutral" } | null {
  if (!state) return null;
  if (state === "success") {
    return payment.isPaid
      ? { text: "Payment received successfully.", tone: "success" }
      : { text: "Your payment was submitted. Oraya is verifying it now.", tone: "neutral" };
  }
  if (state === "cancelled") {
    return { text: "Payment was not completed. No payment has been collected yet.", tone: "neutral" };
  }
  if (state === "pending" || state === "setup_failed") {
    return {
      text: "Your booking request is in. No payment has been collected yet. Oraya will send your secure payment link when it is ready.",
      tone: "neutral",
    };
  }
  return null;
}
