import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/ops/payments/requests/route.ts", "utf8");
const workspace = readFileSync("components/ops/PaymentWorkspace.tsx", "utf8");
const paymentsPage = readFileSync("app/ops/payments/page.tsx", "utf8");
const attemptRoute = readFileSync("app/api/ops/payments/attempts/[id]/route.ts", "utf8");
const requestIdRoute = readFileSync("app/api/ops/payments/requests/[id]/route.ts", "utf8");
const reverseRoute = readFileSync("app/api/ops/payments/transactions/[id]/reverse/route.ts", "utf8");
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
  assert.match(workspace, /Card checkout/);
  assert.match(workspace, /Needs your attention/);
});

test("ambiguous attempts and failed provider events are visible for reconciliation", () => {
  assert.match(workspace, /\["claimed", "authorized", "ambiguous"\]/);
  assert.match(workspace, /processing_status === "pending"/);
  assert.match(workspace, /processing_status === "failed"/);
  assert.match(workspace, /processing_status === "ignored"/);
  assert.match(workspace, /Business Center reference:/);
  assert.match(workspace, /provider_reference \?\? attempt\.idempotency_key/);
  assert.match(workspace, /Check CyberSource Business Center first/);
  assert.match(workspace, /No charge in BC/);
  assert.match(workspace, /Charge already in Oraya/);
  assert.match(workspace, /FRESH_CLAIM_MS/);
});

test("owner can resolve stuck attempts and release unfinished refunds", () => {
  assert.match(attemptRoute, /requiredRole: "owner"/);
  assert.match(attemptRoute, /mark_failed/);
  assert.match(attemptRoute, /mark_cleared/);
  assert.match(attemptRoute, /status: "failed"/);
  assert.match(attemptRoute, /status: "recorded"/);
  assert.match(workspace, /refundMode === "fail"/);
  assert.match(workspace, /No refund in Business Center/);
  assert.match(workspace, /Release refund lock/);
});

test("Ops Payments separates collect desk from website settings", () => {
  assert.match(paymentsPage, /Collect money/);
  assert.match(paymentsPage, /Website settings/);
  assert.match(workspace, /Collecting/);
  assert.match(workspace, /Collected/);
  assert.match(workspace, /Closed/);
  assert.match(requestIdRoute, /export async function DELETE/);
  assert.match(requestIdRoute, /\["claimed", "authorized", "ambiguous"\]/);
});

test("Ops Payments polish: search, purge unused closed, dismiss events, settlement toggle", () => {
  assert.match(workspace, /Search guest, villa, email, or description/);
  assert.match(workspace, /purge-closed/);
  assert.match(workspace, /Clear \{unusedClosedCount\} unused/);
  assert.match(workspace, /Show settlement totals/);
  assert.match(workspace, /\/api\/ops\/payments\/events\/\$\{dismissEventId\}/);
  const purgeRoute = readFileSync("app/api/ops/payments/requests/purge-closed/route.ts", "utf8");
  assert.match(purgeRoute, /export async function POST/);
  assert.match(purgeRoute, /\["cancelled", "expired", "draft"\]/);
  const eventRoute = readFileSync("app/api/ops/payments/events/[id]/route.ts", "utf8");
  assert.match(eventRoute, /processing_status: "ignored"/);
  assert.match(eventRoute, /action !== "ignore"/);
});

test("Reverse is hard-locked to manual receipts", () => {
  assert.match(reverseRoute, /provider !== "manual"/);
  assert.match(reverseRoute, /use Refund card/);
  const reverseSql = readFileSync("sql/phase-16b-reverse-manual-only.sql", "utf8");
  assert.match(reverseSql, /card_use_refund_not_reverse/);
  assert.match(reverseSql, /provider is distinct from 'manual'/);
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
  assert.match(workspace, /provider_blocked/);
  assert.match(workspace, /Do not retry the card refund/);
  assert.match(workspace, /Resolve refund/);
  assert.match(workspace, /ledger reversed \(card not refunded\)/);
  assert.match(workspace, /status === "reversed"/);
  assert.match(workspace, /transaction\.provider === "credit_libanais"/);
  // Cash/manual reverse stays available; card receipts use Refund card instead.
  assert.match(workspace, /transaction\.provider === "manual"/);
});

test("card refund route claims before provider and owner-gates live refunds", () => {
  const refundRoute = readFileSync("app/api/ops/payments/transactions/[id]/refund/route.ts", "utf8");
  assert.match(refundRoute, /requiredRole: "owner"/);
  assert.match(refundRoute, /claimProviderRefund/);
  assert.match(refundRoute, /confirmProviderRefund/);
  assert.match(refundRoute, /failProviderRefund/);
  assert.match(refundRoute, /provider_blocked: true/);
  assert.match(refundRoute, /Do NOT retry/);
  assert.match(refundRoute, /mode === "fail"/);
  assert.match(refundRoute, /payment_transaction_facts_are_immutable/);
  assert.match(refundRoute, /phase-16b-provider-refund-settle-protect\.sql/);
});

test("pending refund settle/fail is allowed by ledger protect facts", () => {
  const settleProtect = readFileSync("sql/phase-16b-provider-refund-settle-protect.sql", "utf8");
  assert.match(settleProtect, /settling_pending_refund/);
  assert.match(settleProtect, /new\.status in \('confirmed', 'failed'\)/);
  assert.match(settleProtect, /old\.status = 'failed'/);
  assert.match(settleProtect, /new\.status = 'pending'/);
});

test("provider ledger accepts Apple Pay only for an Apple-enabled request", () => {
  assert.match(appleLedgerMigration, /p_wallet_presentation = 'apple_pay'/);
  assert.match(appleLedgerMigration, /'apple_pay' = any\(v_request\.allowed_methods\)/);
  assert.match(appleLedgerMigration, /message = 'apple_pay_not_allowed'/);
  assert.match(appleLedgerMigration, /payment_method = case when p_wallet_presentation = 'apple_pay' then 'apple_pay'/);
  assert.match(appleLedgerMigration, /wallet_presentation is distinct from p_wallet_presentation/);
  assert.match(appleLedgerMigration, /payment_requests_one_active_apple_pay_collection/);
});

test("M1: an unsettled authorization is voided, never refunded", () => {
  const refundRoute = readFileSync(
    "app/api/ops/payments/transactions/[id]/refund/route.ts",
    "utf8",
  );
  const voidRoute = readFileSync(
    "app/api/ops/payments/transactions/[id]/void/route.ts",
    "utf8",
  );

  // The refund path asks the provider what happened BEFORE claiming or calling
  // the bank, and refuses when the authorization never settled.
  assert.match(refundRoute, /getCreditLibanaisPaymentSettlement/);
  assert.match(refundRoute, /requires_void/);
  const gateIndex = refundRoute.indexOf("getCreditLibanaisPaymentSettlement({");
  const claimIndex = refundRoute.indexOf("await claimProviderRefund({");
  assert.ok(gateIndex > 0 && claimIndex > gateIndex, "settlement gate must precede the refund claim");

  // Void is owner-only, claim-before-provider, and never writes a refund.
  assert.match(voidRoute, /requiredRole: "owner"/);
  const voidClaimIndex = voidRoute.indexOf("claimProviderAuthorizationReversal({");
  const providerCallIndex = voidRoute.indexOf("reverseCreditLibanaisAuthorization({");
  assert.ok(
    voidClaimIndex > 0 && providerCallIndex > voidClaimIndex,
    "the void claim must precede the provider call",
  );
  assert.doesNotMatch(voidRoute, /ProviderRefund|transaction_type: "refund"/);

  // Ambiguous void outcomes keep the claim and forbid a retry.
  assert.match(voidRoute, /Do NOT retry/);

  // Ops offers the void action with copy that says why.
  assert.match(workspace, /Void authorization/);
  assert.match(workspace, /Record void/);
  assert.match(workspace, /Release void lock/);
  assert.match(workspace, /hold on the guest's card/);
});

test("M1: Decision Manager reject 481 is classified, never treated as money in", () => {
  const settlement = readFileSync("lib/payments/provider-settlement.ts", "utf8");
  const webhookParser = readFileSync("lib/payments/credit-libanais-webhook.ts", "utf8");

  assert.match(settlement, /DECISION_MANAGER_REJECT_REASON_CODE = "481"/);
  // A DM rejection never becomes a webhook "success".
  assert.match(webhookParser, /decisionManagerReject \? "unknown" : classifyOutcome/);
  assert.match(webhookHandler, /decision_manager_reject: event\.decision_manager_reject/);
  assert.match(workspace, /Decision Manager rejected \(481\)/);
});

test("M1: the void migration keeps Reverse manual-only and the ledger append-only", () => {
  const voidSql = readFileSync("sql/phase-16b-provider-authorization-reversal.sql", "utf8");
  // The manual Reverse lock is untouched by this migration.
  assert.doesNotMatch(voidSql, /create or replace function public\.oraya_reverse_manual_payment/);
  // The refund settle-protect exception survives verbatim alongside the new one.
  assert.match(voidSql, /settling_pending_refund/);
  assert.match(voidSql, /settling_pending_reversal/);
  // Voids are recorded as reversals, never as refunds.
  assert.match(voidSql, /'reversal', 'pending'/);
  assert.doesNotMatch(voidSql, /transaction_type, 'refund'/);
  // A recorded refund blocks a void rather than silently rewriting history.
  assert.match(voidSql, /refund_already_recorded/);
});

test("M2: every money path notifies through the one dispatcher", () => {
  const bookingLink = readFileSync("app/api/payments/unified-checkout-complete/route.ts", "utf8");
  const paymentLink = readFileSync(
    "app/api/payments/requests/unified-checkout-complete/route.ts",
    "utf8",
  );
  const opsManual = readFileSync("app/api/ops/payments/transactions/route.ts", "utf8");

  for (const [name, source] of [
    ["booking card link", bookingLink],
    ["payment link", paymentLink],
    ["ops manual receipt", opsManual],
    ["webhook", webhookHandler],
  ]) {
    assert.match(source, /notifyMoneyEvent\(/, `${name} must notify`);
  }

  // The old per-path receipt calls are gone — one dispatcher, not three.
  assert.doesNotMatch(paymentLink, /sendLedgerBookingReceipt/);
  assert.doesNotMatch(opsManual, /sendLedgerBookingReceipt/);

  // The webhook notifies the operator about failed and ambiguous money too.
  assert.match(webhookHandler, /outcome: outcome\.kind === "marked_failed" \? "failed" : "ambiguous"/);
  // ...and it uses the provider transaction id, so the browser and the webhook
  // claim the same identity.
  assert.match(webhookHandler, /provider_transaction_id: event\.provider_transaction_id/);
});

test("M2: the dispatcher sends nothing it has not claimed and changes no money state", () => {
  const core = readFileSync("lib/payments/money-event-dispatch.ts", "utf8");
  const server = readFileSync("lib/payments/money-event-dispatch-server.ts", "utf8");
  const migration = readFileSync("sql/phase-16b-money-event-notifications.sql", "utf8");

  // Claim strictly before either send.
  const claimIndex = core.indexOf("await deps.claim(event)");
  const guestIndex = core.indexOf("await deps.sendGuestReceipt(event)");
  const alertIndex = core.indexOf("await deps.sendOperatorAlert(event)");
  assert.ok(claimIndex > 0 && guestIndex > claimIndex && alertIndex > claimIndex);

  // Only a recorded payment reaches the guest.
  assert.match(core, /if \(event\.outcome === "recorded"\) \{/);

  // This module talks about money; it never writes it. Strip comments first so
  // the prose about status is not mistaken for code that writes it.
  const coreCode = core.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const serverCode = server.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/\.update\(/, /\.from\(/, /payment_status/, /oraya_record/, /\brpc\(/]) {
    assert.doesNotMatch(coreCode, forbidden);
  }
  // The server wiring reads bookings and requests; it updates only its own
  // notification bookkeeping table.
  assert.doesNotMatch(serverCode, /from\("bookings"\)[\s\S]{0,80}\.update\(/);
  assert.doesNotMatch(serverCode, /from\("payment_transactions"\)[\s\S]{0,80}\.update\(/);
  assert.doesNotMatch(serverCode, /payment_status/);
  const updates = serverCode.match(/from\("([a-z_]+)"\)[\s\S]{0,120}?\.update\(/g) ?? [];
  assert.deepEqual(
    updates.map((entry) => entry.match(/from\("([a-z_]+)"\)/)[1]),
    ["payment_notifications"],
  );

  // Fail-closed until the human runs the migration.
  assert.match(server, /return "unavailable"/);
  assert.match(migration, /create table if not exists payment_notifications/);
  assert.match(migration, /notification_key\s+text not null unique/);
  assert.match(migration, /enable row level security/);
});

test("refunds reconcile themselves before troubling a human", () => {
  const refundRoute = readFileSync(
    "app/api/ops/payments/transactions/[id]/refund/route.ts",
    "utf8",
  );
  // Both unproven paths — gateway ambiguity and post-claim network failure —
  // ask the provider before returning the manual Business Center flow.
  assert.equal(refundRoute.match(/tryReconcileAmbiguousRefund\(/g)?.length, 3);
  // The pending claim and the do-not-retry lock survive a failed reconcile.
  assert.match(refundRoute, /Still unproven — keep the pending claim/);
  assert.match(refundRoute, /provider_blocked: true/);
  // Reconciliation may only confirm with a provider-verified reference.
  assert.match(refundRoute, /verified_source: "provider"/);
});
