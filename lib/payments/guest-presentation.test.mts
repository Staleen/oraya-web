import assert from "node:assert/strict";
import test from "node:test";
import { VIEW_CONFIRMED_LINES, VIEW_PENDING_LINES } from "../booking-trust-messaging.ts";
import {
  buildGuestPaymentPresentation,
  paymentReturnMessage,
  type GuestPaymentPresentationInput,
} from "./guest-presentation.ts";

const baseInput: GuestPaymentPresentationInput = {
  paymentStatus: "unpaid",
  paymentLinkStatus: "none",
  paymentLinkUrl: null,
  hasActivePaymentLink: false,
  paymentLinkExpiresAt: null,
  depositAmount: null,
  amountPaid: null,
  balanceDue: 320,
  paymentDueAt: null,
  paymentRequestedAt: null,
  paymentReceivedAt: null,
  paymentMethod: null,
  paymentReference: null,
};

function present(overrides: Partial<GuestPaymentPresentationInput>) {
  return buildGuestPaymentPresentation({ ...baseInput, ...overrides });
}

test("recorded payment state wins over stale payment-link state", () => {
  const paid = present({
    paymentStatus: "paid_in_full",
    paymentLinkStatus: "failed",
    amountPaid: 320,
    paymentMethod: "card_manual",
    paymentReference: "gateway-ref",
    paymentReceivedAt: "17 Jul 2026, 01:54",
  });
  assert.equal(paid.label, "Paid in full");
  assert.equal(paid.tone, "paid");
  assert.equal(paid.isPaid, true);
  assert.deepEqual(paid.rows.find(([label]) => label === "Method"), [
    "Method",
    "Debit / Credit Card",
  ]);

  const deposit = present({
    paymentStatus: "deposit_paid",
    paymentLinkStatus: "expired",
    amountPaid: 128,
    balanceDue: 192,
  });
  assert.equal(deposit.label, "Deposit paid");
  assert.equal(deposit.tone, "deposit");
  assert.equal(deposit.isPaid, true);
});

test("unpaid link lifecycle maps to one conservative guest state", () => {
  assert.equal(present({ paymentLinkStatus: "expired" }).label, "Payment link expired");
  assert.equal(present({ paymentLinkStatus: "failed" }).label, "Payment could not be completed");
  assert.equal(present({ paymentLinkStatus: "cancelled" }).label, "Payment could not be completed");

  const active = present({
    paymentStatus: "payment_requested",
    paymentLinkStatus: "active",
    paymentLinkUrl: "/payments/checkout/token",
    hasActivePaymentLink: true,
  });
  assert.equal(active.label, "Payment pending");
  assert.equal(active.actionLabel, "Continue to secure payment");
  assert.equal(active.actionUrl, "/payments/checkout/token");

  const providerOnlyPaid = present({ paymentLinkStatus: "paid" });
  assert.equal(providerOnlyPaid.label, "Payment pending");
  assert.match(providerOnlyPaid.body, /provider approval/);
  assert.equal(providerOnlyPaid.isPaid, false);

  const requested = present({
    paymentStatus: "payment_requested",
    depositAmount: 128,
    paymentDueAt: "30 Jul 2026, 23:59",
  });
  assert.equal(requested.label, "Payment pending");
  assert.deepEqual(requested.rows[0], ["Deposit amount", "USD 128"]);
});

test("browser return text cannot turn an unpaid state into payment success", () => {
  assert.deepEqual(paymentReturnMessage("success", present({})), {
    text: "Your payment was submitted. Oraya is verifying it now.",
    tone: "neutral",
  });
  assert.deepEqual(
    paymentReturnMessage("success", present({ paymentStatus: "paid_in_full", amountPaid: 320 })),
    { text: "Thank you — your payment has been received.", tone: "success" },
  );
  assert.match(paymentReturnMessage("pending", present({}))?.text ?? "", /No payment has been collected/);
});

test("booking-status trust copy stays payment-neutral for every booking state", () => {
  for (const line of [...VIEW_CONFIRMED_LINES, ...VIEW_PENDING_LINES]) {
    assert.doesNotMatch(line, /payment|paid|deposit|refund/i);
  }
});
