import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBookingPaymentSuccessUrl,
  buildPaymentRequestSuccessUrl,
  mintBookingPaymentSuccessUrl,
} from "./payment-success-redirect.ts";

test("standalone payment success URL stays on /pay", () => {
  assert.equal(
    buildPaymentRequestSuccessUrl("https://www.stayoraya.com", "tok_abc"),
    "https://www.stayoraya.com/pay/tok_abc?payment=success",
  );
});

test("booking payment success URL uses the view token", () => {
  assert.equal(
    buildBookingPaymentSuccessUrl("https://www.stayoraya.com", "view.token"),
    "https://www.stayoraya.com/booking/view/view.token?payment=success",
  );
});

test("mintBookingPaymentSuccessUrl requires BOOKING_ACTION_SECRET and returns a view URL", () => {
  const previous = process.env.BOOKING_ACTION_SECRET;
  process.env.BOOKING_ACTION_SECRET = "test-booking-action-secret-for-redirect";
  try {
    const url = mintBookingPaymentSuccessUrl({
      origin: "https://www.stayoraya.com",
      booking_id: "11111111-1111-4111-8111-111111111111",
      check_out: "2026-09-01",
    });
    assert.match(url ?? "", /^https:\/\/www\.stayoraya\.com\/booking\/view\/[^?]+\?payment=success$/);
  } finally {
    if (previous === undefined) delete process.env.BOOKING_ACTION_SECRET;
    else process.env.BOOKING_ACTION_SECRET = previous;
  }
});
