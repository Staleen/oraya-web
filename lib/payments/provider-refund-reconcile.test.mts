import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRefundSearchQuery,
  isRefundTransaction,
  readRefundIdFromSearchResults,
  reconcileRefundFromProviderRecord,
} from "./provider-refund-reconcile.ts";

const REF = "oraya-rfnd-8bf1297f-msoy4gu9";

function refundRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "7864700292896974704899",
    status: "PENDING",
    clientReferenceInformation: { code: REF },
    applicationInformation: { applications: [{ name: "ics_credit", status: "PENDING" }] },
    creditAmountDetails: { creditAmount: "240.00", currency: "USD" },
    ...overrides,
  };
}

test("a matching credit of the exact amount confirms the refund", () => {
  const result = reconcileRefundFromProviderRecord({
    payload: refundRecord(),
    requested_amount: 240,
    requested_currency: "USD",
    merchant_reference: REF,
  });
  assert.deepEqual(result, { kind: "confirmed", refund_id: "7864700292896974704899" });
});

test("a different amount is never accepted as our refund", () => {
  const result = reconcileRefundFromProviderRecord({
    payload: refundRecord({ creditAmountDetails: { creditAmount: "120.00", currency: "USD" } }),
    requested_amount: 240,
    requested_currency: "USD",
    merchant_reference: REF,
  });
  assert.equal(result.kind, "unproven");
});

test("a different currency is never accepted", () => {
  const result = reconcileRefundFromProviderRecord({
    payload: refundRecord({ creditAmountDetails: { creditAmount: "240.00", currency: "LBP" } }),
    requested_amount: 240,
    requested_currency: "USD",
    merchant_reference: REF,
  });
  assert.equal(result.kind, "unproven");
});

test("someone else's credit on the same card is rejected by merchant reference", () => {
  const result = reconcileRefundFromProviderRecord({
    payload: refundRecord({ clientReferenceInformation: { code: "oraya-rfnd-someone-else" } }),
    requested_amount: 240,
    requested_currency: "USD",
    merchant_reference: REF,
  });
  assert.deepEqual(result, { kind: "unproven", reason: "merchant_reference_mismatch" });
});

test("an authorization is never mistaken for a refund", () => {
  const result = reconcileRefundFromProviderRecord({
    payload: {
      id: "786469",
      status: "AUTHORIZED",
      applicationInformation: { applications: [{ name: "ics_auth", status: "PENDING" }] },
      orderInformation: { amountDetails: { totalAmount: "240.00", currency: "USD" } },
    },
    requested_amount: 240,
    requested_currency: "USD",
  });
  assert.deepEqual(result, { kind: "unproven", reason: "not_a_refund_transaction" });
});

test("a declined or failed credit is not a refund", () => {
  const result = reconcileRefundFromProviderRecord({
    payload: refundRecord({ status: "DECLINED" }),
    requested_amount: 240,
    requested_currency: "USD",
    merchant_reference: REF,
  });
  assert.equal(result.kind, "unproven");
});

test("an empty or unreadable record proves nothing", () => {
  for (const payload of [null, undefined, "", {}, { id: "1" }]) {
    assert.equal(
      reconcileRefundFromProviderRecord({
        payload,
        requested_amount: 240,
        requested_currency: "USD",
      }).kind,
      "unproven",
    );
  }
});

test("search results yield only the credit transaction", () => {
  const payload = {
    _embedded: {
      transactionSummaries: [
        { id: "auth-1", applicationInformation: { applications: [{ name: "ics_auth" }] } },
        { id: "credit-1", applicationInformation: { applications: [{ name: "ics_credit" }] } },
      ],
    },
  };
  assert.equal(readRefundIdFromSearchResults(payload), "credit-1");
  assert.equal(readRefundIdFromSearchResults({}), null);
  assert.equal(readRefundIdFromSearchResults(null), null);
});

test("the search query is scoped to our merchant reference", () => {
  assert.equal(
    buildRefundSearchQuery(REF),
    `clientReferenceInformation.code:"${REF}"`,
  );
  // Quotes cannot be used to break out of the query.
  assert.equal(
    buildRefundSearchQuery('a" OR x:"y'),
    'clientReferenceInformation.code:"a OR x:y"',
  );
});

test("refund detection covers both application names and the credit echo", () => {
  assert.equal(isRefundTransaction({ creditAmountDetails: { creditAmount: "1.00" } }), true);
  assert.equal(
    isRefundTransaction({ applicationInformation: { applications: [{ name: "ics_refund" }] } }),
    true,
  );
  assert.equal(
    isRefundTransaction({ applicationInformation: { applications: [{ name: "ics_auth" }] } }),
    false,
  );
});
