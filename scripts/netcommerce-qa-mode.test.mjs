import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/payments/netcommerce-qa-mode.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const helperModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("parseNetCommerceQaMode enables only explicit true strings", () => {
  assert.equal(helperModule.parseNetCommerceQaMode("true"), true);
  assert.equal(helperModule.parseNetCommerceQaMode(" TRUE "), true);
  assert.equal(helperModule.parseNetCommerceQaMode("false"), false);
  assert.equal(helperModule.parseNetCommerceQaMode("1"), false);
  assert.equal(helperModule.parseNetCommerceQaMode(undefined), false);
});

test("review bypass follows the public QA flag only", () => {
  assert.equal(helperModule.shouldBypassOrayaReviewBeforePaymentForNetCommerceQa(true), true);
  assert.equal(helperModule.shouldBypassOrayaReviewBeforePaymentForNetCommerceQa(false), false);
});

test("server QA confirmation requires QA mode and approved payment", () => {
  assert.equal(
    helperModule.shouldConfirmBookingAfterNetCommerceQaPayment({
      qaModeEnabled: true,
      paymentApproved: true,
      bookingStatus: "pending",
    }),
    true,
  );
  assert.equal(
    helperModule.shouldConfirmBookingAfterNetCommerceQaPayment({
      qaModeEnabled: false,
      paymentApproved: true,
      bookingStatus: "pending",
    }),
    false,
  );
  assert.equal(
    helperModule.shouldConfirmBookingAfterNetCommerceQaPayment({
      qaModeEnabled: true,
      paymentApproved: false,
      bookingStatus: "pending",
    }),
    false,
  );
  assert.equal(
    helperModule.shouldConfirmBookingAfterNetCommerceQaPayment({
      qaModeEnabled: true,
      paymentApproved: true,
      bookingStatus: "cancelled",
    }),
    false,
  );
});
