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
  // Vocabulary change 2026-08-11: four different guest situations used to all
  // read "Payment pending". A guest with a usable link is "Ready to pay".
  assert.equal(active.label, "Ready to pay");
  assert.equal(active.actionLabel, "Continue to secure payment");
  assert.equal(active.actionUrl, "/payments/checkout/token");

  const providerOnlyPaid = present({ paymentLinkStatus: "paid" });
  assert.equal(providerOnlyPaid.label, "Payment being verified");
  assert.match(providerOnlyPaid.body, /provider approval/);
  assert.equal(providerOnlyPaid.isPaid, false);

  const requested = present({
    paymentStatus: "payment_requested",
    depositAmount: 128,
    paymentDueAt: "30 Jul 2026, 23:59",
  });
  // No link and no self-serve capability: the guest is simply not paid yet.
  assert.equal(requested.label, "Not paid yet");
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

/**
 * Guest self-serve payment. Before this, a guest who reserved without paying
 * was told to wait for Oraya to send a link, and a guest who had paid a deposit
 * had no way to settle the balance — while POST /api/payments/checkout already
 * accepted their own booking token.
 */

test("a guest who reserved without paying can pay when Oraya can take a card", () => {
  const p = buildGuestPaymentPresentation({ ...baseInput, canPayNow: true });
  assert.deepEqual(p.selfServePay, { purpose: "deposit", label: "Pay now" });
  assert.equal(p.label, "Ready to pay");
  assert.equal(p.isPaid, false);
});

test("without the capability the guest is told to wait, exactly as before", () => {
  const p = buildGuestPaymentPresentation({ ...baseInput, canPayNow: false });
  assert.equal(p.selfServePay, null);
  assert.match(p.body, /Oraya will send your secure payment link/);
});

test("omitting the capability keeps the old behaviour (no accidental payment button)", () => {
  const p = buildGuestPaymentPresentation(baseInput);
  assert.equal(p.selfServePay, null);
});

test("a deposit-paid guest can settle the remaining balance themselves", () => {
  const p = buildGuestPaymentPresentation({
    ...baseInput,
    paymentStatus: "deposit_paid",
    amountPaid: 100,
    balanceDue: 140,
    canPayNow: true,
  });
  assert.deepEqual(p.selfServePay, { purpose: "balance", label: "Pay remaining balance" });
  assert.match(p.body, /pay the remaining balance here/i);
});

test("a deposit-paid guest with nothing outstanding is offered nothing", () => {
  const p = buildGuestPaymentPresentation({
    ...baseInput,
    paymentStatus: "deposit_paid",
    amountPaid: 240,
    balanceDue: 0,
    canPayNow: true,
  });
  assert.equal(p.selfServePay, null);
});

test("a fully paid guest is never offered a payment button", () => {
  const p = buildGuestPaymentPresentation({
    ...baseInput,
    paymentStatus: "paid_in_full",
    amountPaid: 240,
    balanceDue: 0,
    canPayNow: true,
  });
  assert.equal(p.selfServePay, null);
  assert.equal(p.isPaid, true);
});

test("an expired or failed link becomes a retry the guest can drive", () => {
  const expired = buildGuestPaymentPresentation({
    ...baseInput,
    paymentLinkStatus: "expired",
    canPayNow: true,
  });
  assert.deepEqual(expired.selfServePay, { purpose: "deposit", label: "Pay now" });

  const failed = buildGuestPaymentPresentation({
    ...baseInput,
    paymentLinkStatus: "failed",
    canPayNow: true,
  });
  assert.deepEqual(failed.selfServePay, { purpose: "deposit", label: "Try payment again" });
  assert.match(failed.body, /no money was taken/i);
});

test("a submitted payment awaiting verification never invites a second payment", () => {
  const p = buildGuestPaymentPresentation({
    ...baseInput,
    paymentLinkStatus: "paid",
    canPayNow: true,
  });
  assert.equal(p.selfServePay, null);
  assert.equal(p.label, "Payment being verified");
  assert.match(p.body, /do not pay again/i);
});

test("'Payment pending' no longer means four different things", () => {
  const canPay = buildGuestPaymentPresentation({ ...baseInput, canPayNow: true }).label;
  const cannotPay = buildGuestPaymentPresentation({ ...baseInput, canPayNow: false }).label;
  const submitted = buildGuestPaymentPresentation({
    ...baseInput,
    paymentLinkStatus: "paid",
  }).label;
  const linkReady = buildGuestPaymentPresentation({
    ...baseInput,
    hasActivePaymentLink: true,
    paymentLinkUrl: "https://pay.example/x",
    paymentLinkStatus: "active",
  }).label;

  // "Can pay now" and "a link is waiting" are the same situation for a guest,
  // so they legitimately share one label. The other two must be distinct.
  assert.equal(canPay, linkReady);
  assert.equal(new Set([canPay, cannotPay, submitted]).size, 3);
  for (const label of [canPay, cannotPay, submitted]) {
    assert.notEqual(label, "Payment pending");
  }
});
