import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bookPage = readFileSync("app/book/page.tsx", "utf8");
const bookingViewPage = readFileSync("app/booking/view/[token]/page.tsx", "utf8");
const checkoutPage = readFileSync("app/payments/checkout/[token]/page.tsx", "utf8");
const checkoutRoute = readFileSync("app/api/payments/checkout/route.ts", "utf8");
const sessionRoute = readFileSync("app/api/payments/unified-checkout-session/route.ts", "utf8");
const completionRoute = readFileSync("app/api/payments/unified-checkout-complete/route.ts", "utf8");
const requestCompletionRoute = readFileSync("app/api/payments/requests/unified-checkout-complete/route.ts", "utf8");
const cardRequestMigration = readFileSync("sql/phase-16b-card-payment-requests.sql", "utf8");
const guestPresentation = readFileSync("lib/payments/guest-presentation.ts", "utf8");
const trustMessaging = readFileSync("lib/booking-trust-messaging.ts", "utf8");

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
    assert.match(guestPresentation, new RegExp(label));
  }

  for (const retiredCopy of [
    "Online payment portal (coming soon)",
    "Payment not requested yet.",
    "Payment link unavailable",
    "Payment link cancelled",
    "No payment link",
  ]) {
    assert.equal(
      bookingViewPage.includes(retiredCopy) || guestPresentation.includes(retiredCopy),
      false,
      `${retiredCopy} should not be guest-visible`,
    );
  }
});

test("browser payment return copy stays informational unless server payment state is paid", () => {
  assert.match(guestPresentation, /payment\.isPaid/);
  assert.match(guestPresentation, /Your payment was submitted\. Oraya is verifying it now\./);
  assert.match(guestPresentation, /No payment has been collected yet\./);
});

test("booking-status trust copy does not make payment claims", () => {
  assert.doesNotMatch(trustMessaging, /Payment received \/ booking confirmed/);
  assert.doesNotMatch(trustMessaging, /No payment required yet/);
  assert.match(trustMessaging, /Oraya has confirmed this booking/);
  assert.match(trustMessaging, /Oraya is reviewing this booking request/);
});

test("public checkout failures do not echo provider or configuration detail", () => {
  assert.doesNotMatch(checkoutPage, /message:\s*payload\.error/);
  assert.match(checkoutPage, /typeof completion\.message === "string"/);
  assert.doesNotMatch(checkoutPage, /message:\s*completion\.error/);
  assert.doesNotMatch(checkoutRoute, /\{\s*error:\s*message\s*\}/);
  assert.doesNotMatch(sessionRoute, /\{\s*error:\s*error\.message\s*\}/);
  assert.doesNotMatch(completionRoute, /\{\s*error:\s*error\.message\s*\}/);
});

test("checkout preserves authoritative do-not-retry messages after payment submission", () => {
  assert.match(
    checkoutPage,
    /completionRequestSubmitted = true;\s*const completionResponse = await fetch\(\s*isPaymentRequest/,
  );
  assert.match(checkoutPage, /"\/api\/payments\/requests\/unified-checkout-complete"/);
  assert.match(checkoutPage, /"\/api\/payments\/unified-checkout-complete"/);
  assert.match(checkoutPage, /completionRequestSubmitted\s*\?\s*"We could not confirm the payment outcome\. Do NOT retry or pay again/);
  assert.match(checkoutPage, /completion\.message\.trim\(\)/);

  const unknownCase = completionRoute.slice(
    completionRoute.indexOf('case "provider_unknown"'),
    completionRoute.indexOf('case "approved_unrecorded"'),
  );
  const reconciliationCase = completionRoute.slice(
    completionRoute.indexOf('case "approved_unrecorded"'),
    completionRoute.indexOf('case "already_recorded"'),
  );
  for (const safeCase of [unknownCase, reconciliationCase]) {
    assert.match(safeCase, /do NOT retry|Do NOT retry/);
    assert.doesNotMatch(safeCase, /try again/i);
  }
  assert.match(requestCompletionRoute, /Do NOT retry or pay again/);
  assert.doesNotMatch(requestCompletionRoute, /approved but needs reconciliation[^\n]*try again/i);
});

test("booking pay-now retries cannot create two active card requests", () => {
  assert.match(cardRequestMigration, /payment_requests_one_active_card_collection/);
  assert.match(cardRequestMigration, /status in \('active', 'partially_paid'\)/);
  assert.match(checkoutRoute, /createRequestError\?\.code === "23505"/);
  assert.match(checkoutRoute, /concurrent canonical request recovery failed/);
  assert.match(checkoutRoute, /createdNewRequest/);
});
