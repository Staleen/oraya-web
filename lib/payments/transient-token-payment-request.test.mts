/**
 * Transient-token payment request shape — must not override UC billing data.
 *
 *   node --experimental-strip-types --test lib/payments/transient-token-payment-request.test.mts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTransientTokenPaymentRequest } from "./transient-token-payment-request.ts";

test("transient-token payment request omits billTo so UC billing survives", () => {
  const body = buildTransientTokenPaymentRequest({
    booking_id: "booking-1",
    provider_session_id: "oraya_session_1",
    transient_token: "tt-jwt",
    amount_due: 1,
    currency: "USD",
    merchant_reference: "oraya-att-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  });

  assert.deepEqual(body.orderInformation, {
    amountDetails: { totalAmount: "1.00", currency: "USD" },
  });
  assert.equal(
    "billTo" in body.orderInformation,
    false,
    "incomplete billTo must not supersede the transient token",
  );
  assert.equal(body.tokenInformation.transientTokenJwt, "tt-jwt");
  assert.equal(
    body.clientReferenceInformation.code,
    "oraya-att-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  );
  assert.equal(body.processingInformation.capture, true);
});

test("merchant reference falls back to the provider session id", () => {
  const body = buildTransientTokenPaymentRequest({
    booking_id: "booking-2",
    provider_session_id: "oraya_session_2",
    transient_token: "tt-jwt-2",
    amount_due: 240.5,
    currency: "USD",
  });
  assert.equal(body.clientReferenceInformation.code, "oraya_session_2");
  assert.equal(body.orderInformation.amountDetails.totalAmount, "240.50");
});
