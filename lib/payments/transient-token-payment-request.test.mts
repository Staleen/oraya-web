/**
 * Transient-token payment request shape — must not override UC billing data.
 *
 *   node --experimental-strip-types --test lib/payments/transient-token-payment-request.test.mts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTransientTokenPaymentRequest,
  isRetrySafeNonChargeHttp,
} from "./transient-token-payment-request.ts";

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

test("HTTP 4xx without a payment id is retry-safe; 5xx is not", () => {
  assert.equal(isRetrySafeNonChargeHttp({ http_status: 400, transaction_id: null }), true);
  assert.equal(isRetrySafeNonChargeHttp({ http_status: 401, transaction_id: null }), true);
  assert.equal(isRetrySafeNonChargeHttp({ http_status: 500, transaction_id: null }), false);
  assert.equal(isRetrySafeNonChargeHttp({ http_status: 400, transaction_id: "txn-1" }), false);
  assert.equal(isRetrySafeNonChargeHttp({ http_status: 201, transaction_id: null }), false);
});

test("Decision Manager is skipped by default (reason 481 blocks every live capture)", () => {
  const body = buildTransientTokenPaymentRequest({
    booking_id: "b1",
    provider_session_id: "s1",
    transient_token: "t1",
    amount_due: 270,
    currency: "USD",
  }) as { processingInformation: { actionList?: string[]; capture?: boolean } };
  assert.deepEqual(body.processingInformation.actionList, ["DECISION_SKIP"]);
  // The skip must not disturb anything else about the request.
  assert.equal(body.processingInformation.capture, true);
});

test("Decision Manager screening can be re-enabled with one flag", () => {
  const body = buildTransientTokenPaymentRequest({
    booking_id: "b1",
    provider_session_id: "s1",
    transient_token: "t1",
    amount_due: 270,
    currency: "USD",
    skip_decision_manager: false,
  }) as { processingInformation: { actionList?: string[] } };
  assert.equal(body.processingInformation.actionList, undefined);
});
