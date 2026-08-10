import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/ops/payments/requests/route.ts", "utf8");
const workspace = readFileSync("components/ops/PaymentWorkspace.tsx", "utf8");
const completion = readFileSync("app/api/payments/requests/unified-checkout-complete/route.ts", "utf8");
const webhookHandler = readFileSync("lib/payments/credit-libanais-webhook-handler.ts", "utf8");
const appleLedgerMigration = readFileSync("sql/phase-16b-apple-pay-provider-ledger.sql", "utf8");

test("operations receives provider attempts and events without secret payloads", () => {
  assert.match(route, /from\("payment_attempts"\)/);
  assert.match(route, /from\("payment_provider_events"\)/);
  assert.match(route, /verification_status, processing_status/);
  assert.doesNotMatch(route, /safe_metadata/);
});

test("operations preserves readiness data after loading the ledger", () => {
  assert.match(workspace, /checkout: body\.checkout/);
  assert.match(workspace, /missing_requirements/);
  assert.match(workspace, /Provider readiness and reconciliation/);
});

test("ambiguous attempts and failed provider events are visible for reconciliation", () => {
  assert.match(workspace, /\["claimed", "authorized", "ambiguous"\]/);
  assert.match(workspace, /\["pending", "failed"\]/);
  assert.match(workspace, /Merchant reference:.*provider_reference.*idempotency_key/);
  assert.match(workspace, /Check the matching merchant reference in CyberSource Business Center/);
});

test("Apple Pay remains independently gated from ordinary card readiness", () => {
  assert.match(route, /apple_pay_ready/);
  assert.match(route, /getCreditLibanaisPaymentCapabilities\(\)\.apple_pay_enabled/);
  assert.match(workspace, /method !== "apple_pay" \|\| ledger\.checkout\?\.apple_pay_ready/);
  assert.match(route, /Create separate card and Apple Pay links/);
});

test("Apple-only browser and webhook reconciliation record the wallet presentation", () => {
  for (const source of [completion, webhookHandler]) {
    assert.match(source, /allowed_methods/);
    assert.match(source, /includes\("apple_pay"\)/);
    assert.match(source, /!.*includes\("card"\)/s);
    assert.match(source, /wallet_presentation: walletPresentation/);
  }
  assert.match(webhookHandler, /payment request lookup for method classification failed/);
  assert.match(webhookHandler, /return "failed"/);
});

test("operations exposes one-click card refund for NetCommerce receipts", () => {
  assert.match(workspace, /Refund card/);
  assert.match(workspace, /\/api\/ops\/payments\/transactions\/\$\{refundFor\.id\}\/refund/);
  assert.match(workspace, /Refund now/);
  assert.match(workspace, /Already refunded in Business Center\?/);
  assert.match(workspace, /transaction\.provider === "credit_libanais"/);
  // Cash/manual reverse stays available; card receipts use Refund card instead.
  assert.match(workspace, /transaction\.provider === "manual"/);
});

test("provider ledger accepts Apple Pay only for an Apple-enabled request", () => {
  assert.match(appleLedgerMigration, /p_wallet_presentation = 'apple_pay'/);
  assert.match(appleLedgerMigration, /'apple_pay' = any\(v_request\.allowed_methods\)/);
  assert.match(appleLedgerMigration, /message = 'apple_pay_not_allowed'/);
  assert.match(appleLedgerMigration, /payment_method = case when p_wallet_presentation = 'apple_pay' then 'apple_pay'/);
  assert.match(appleLedgerMigration, /wallet_presentation is distinct from p_wallet_presentation/);
  assert.match(appleLedgerMigration, /payment_requests_one_active_apple_pay_collection/);
});
