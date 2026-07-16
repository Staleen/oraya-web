import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bookPage = readFileSync("app/book/page.tsx", "utf8");
const bookingViewPage = readFileSync("app/booking/view/[token]/page.tsx", "utf8");

test("/book pay-now fallback creates a pending-payment booking handoff", () => {
  assert.match(bookPage, /\?payment=pending/);
  assert.match(bookPage, /Guest selected secure payment; Oraya follow-up payment link required/);
  assert.doesNotMatch(bookPage, /This stay needs Oraya review before payment can be collected/);
  assert.doesNotMatch(bookPage, /paymentSettings\.online_checkout_message\s*\|\|/);
});

test("booking-view uses one guest-facing payment presentation vocabulary", () => {
  assert.match(bookingViewPage, /buildGuestPaymentPresentation/);
  for (const label of [
    "Payment pending",
    "Deposit paid",
    "Paid in full",
    "Payment link expired",
    "Payment could not be completed",
  ]) {
    assert.match(bookingViewPage, new RegExp(label));
  }

  for (const retiredCopy of [
    "Online payment portal (coming soon)",
    "Payment not requested yet.",
    "Payment link unavailable",
    "Payment link cancelled",
    "No payment link",
  ]) {
    assert.equal(bookingViewPage.includes(retiredCopy), false, `${retiredCopy} should not be guest-visible`);
  }
});

test("browser payment return copy stays informational unless server payment state is paid", () => {
  assert.match(bookingViewPage, /payment\.isPaid/);
  assert.match(bookingViewPage, /Your payment was submitted\. Oraya is verifying it now\./);
  assert.match(bookingViewPage, /No payment has been collected yet\./);
});
