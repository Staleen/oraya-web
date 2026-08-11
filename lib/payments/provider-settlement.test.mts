import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCardSettlementState,
  classifyProviderReversalOutcome,
  describeCardReturnAction,
  explainRefundFailure,
  isDecisionManagerReject,
  isRefundInvalidDataFailure,
  readCapturePresent,
  readProviderReasonCode,
  readReversalResponseAmountDetails,
  readRiskDecision,
} from "./provider-settlement.ts";

/**
 * Phase 16B M1 — the settled-vs-unsettled decision and the 481 classification.
 * Live evidence these encode (merchant 06385000, 2026-08-10):
 *   7863958223886680704897 / 7863969294066269704890 — Auth SUCCESS,
 *   Decision Manager REJECT 481, Settlement "Not Run"; a refund against the
 *   first failed with reason 102 DINVALIDDATA.
 */

test("an approved-but-uncaptured authorization is never refundable", () => {
  assert.equal(classifyCardSettlementState({ status: "AUTHORIZED" }), "authorized_only");
  assert.equal(
    classifyCardSettlementState({ status: "AUTHORIZED_RISK_DECLINED" }),
    "authorized_only",
  );
  assert.equal(
    classifyCardSettlementState({ status: "AUTHORIZED_PENDING_REVIEW" }),
    "authorized_only",
  );
});

test("a captured or settled payment stays refundable", () => {
  for (const status of ["CAPTURED", "TRANSMITTED", "SETTLED", "PENDING", "REFUNDED"]) {
    assert.equal(classifyCardSettlementState({ status }), "settled", status);
  }
});

test("an executed capture application outranks an AUTHORIZED status", () => {
  assert.equal(
    classifyCardSettlementState({ status: "AUTHORIZED", capture_present: true }),
    "settled",
  );
});

test("already-released authorizations are neither refundable nor voidable", () => {
  assert.equal(classifyCardSettlementState({ status: "REVERSED" }), "reversed");
  assert.equal(classifyCardSettlementState({ status: "VOIDED" }), "reversed");
  assert.equal(describeCardReturnAction({ state: "reversed" }).action, "none");
});

test("an unreadable status is unknown — never assumed settled", () => {
  assert.equal(classifyCardSettlementState({ status: null }), "unknown");
  assert.equal(classifyCardSettlementState({ status: "" }), "unknown");
  assert.equal(classifyCardSettlementState({ status: "SOMETHING_NEW" }), "unknown");
  assert.equal(describeCardReturnAction({ state: "unknown" }).action, "unknown");
});

test("settlement state decides the instrument offered to the owner", () => {
  assert.equal(describeCardReturnAction({ state: "settled" }).action, "refund");
  assert.equal(describeCardReturnAction({ state: "authorized_only" }).action, "void");
  assert.match(
    describeCardReturnAction({ state: "authorized_only" }).copy,
    /never taken|never actually taken/i,
  );
});

test("reason 481 is classified as a Decision Manager rejection", () => {
  assert.equal(isDecisionManagerReject({ reason_code: "481" }), true);
  assert.equal(isDecisionManagerReject({ reason_code: 481 as unknown as string }), false);
  assert.equal(isDecisionManagerReject({ error_reason: "DECISION_PROFILE_REJECT" }), true);
  assert.equal(isDecisionManagerReject({ risk_decision: "REJECT" }), true);
  assert.equal(isDecisionManagerReject({ status: "AUTHORIZED_RISK_DECLINED" }), true);
});

test("a clean approval is never mistaken for a Decision Manager rejection", () => {
  assert.equal(
    isDecisionManagerReject({
      reason_code: "100",
      error_reason: null,
      risk_decision: "ACCEPT",
      status: "AUTHORIZED",
    }),
    false,
  );
  assert.equal(isDecisionManagerReject({}), false);
});

test("a 481 rejection carries the void instruction, not a generic message", () => {
  const guidance = describeCardReturnAction({
    state: "authorized_only",
    decision_manager_reject: true,
  });
  assert.equal(guidance.action, "void");
  assert.match(guidance.copy, /481/);
  assert.match(guidance.copy, /void/i);
});

test("reason 102 refund failures point at void instead of inviting a retry", () => {
  assert.equal(isRefundInvalidDataFailure({ reason_code: "102" }), true);
  assert.equal(isRefundInvalidDataFailure({ message: "DINVALIDDATA" }), true);
  assert.equal(isRefundInvalidDataFailure({ message: "Insufficient funds" }), false);

  const copy = explainRefundFailure({ reason_code: "102", message: "DINVALIDDATA" });
  assert.match(copy, /void the authorization/i);
  // Must tell the operator to stop, not to try the same instrument again.
  assert.match(copy, /Do not retry the refund/i);

  // A genuine decline keeps the gateway's own message.
  assert.equal(
    explainRefundFailure({ message: "The gateway did not accept the refund." }),
    "The gateway did not accept the refund.",
  );
});

test("a refund on a known-unsettled auth is explained as the wrong instrument", () => {
  assert.match(
    explainRefundFailure({ message: "Declined", settlement_state: "authorized_only" }),
    /void the authorization/i,
  );
});

test("reason codes are read from every shape CyberSource uses", () => {
  assert.equal(readProviderReasonCode({ reasonCode: "481" }), "481");
  assert.equal(readProviderReasonCode({ applicationInformation: { reasonCode: 481 } }), "481");
  assert.equal(
    readProviderReasonCode({
      applicationInformation: {
        applications: [
          { name: "ics_auth", reasonCode: "100" },
          { name: "ics_decision", reasonCode: "481" },
        ],
      },
    }),
    "481",
  );
  assert.equal(readProviderReasonCode(null), null);
  assert.equal(readProviderReasonCode({}), null);
});

test("risk decision and capture presence are read defensively", () => {
  assert.equal(readRiskDecision({ riskInformation: { profile: { decision: "REJECT" } } }), "REJECT");
  assert.equal(readRiskDecision({}), null);
  assert.equal(
    readCapturePresent({
      applicationInformation: {
        applications: [
          { name: "ics_auth", status: "PENDING", reasonCode: "100" },
          { name: "ics_bill", status: "NOT_RUN" },
        ],
      },
    }),
    false,
  );
  assert.equal(
    readCapturePresent({
      applicationInformation: {
        applications: [{ name: "ics_bill", status: "PENDING", reasonCode: "100" }],
      },
    }),
    true,
  );
  assert.equal(readCapturePresent({}), false);
});

test("reversal outcomes fail closed the same way refunds do", () => {
  const base = { http_ok: true, http_status: 201, amount_verified: true };
  assert.equal(
    classifyProviderReversalOutcome({ ...base, status: "REVERSED", reversal_id: "123" }),
    "approved",
  );
  // Apparent success without a verifiable amount echo is never approved.
  assert.equal(
    classifyProviderReversalOutcome({
      ...base,
      amount_verified: false,
      status: "REVERSED",
      reversal_id: "123",
    }),
    "ambiguous",
  );
  // A clean 4xx with no reversal id releases the claim.
  assert.equal(
    classifyProviderReversalOutcome({
      http_ok: false,
      http_status: 400,
      status: "INVALID_REQUEST",
      reversal_id: null,
      amount_verified: false,
    }),
    "declined",
  );
  // A reversal id with an unclear status must never be retried.
  assert.equal(
    classifyProviderReversalOutcome({
      http_ok: false,
      http_status: 500,
      status: null,
      reversal_id: "123",
      amount_verified: false,
    }),
    "ambiguous",
  );
  assert.equal(
    classifyProviderReversalOutcome({
      ...base,
      status: "REVERSED",
      reversal_id: "123",
      decrypt_failed: true,
    }),
    "ambiguous",
  );
});

test("reversal amount echo is read from reversalAmountDetails", () => {
  assert.deepEqual(
    readReversalResponseAmountDetails({
      reversalAmountDetails: { reversedAmount: "1.00", currency: "USD" },
    }),
    { authorizedAmount: "1.00", totalAmount: "1.00", currency: "USD" },
  );
  assert.equal(readReversalResponseAmountDetails(null), null);
});
