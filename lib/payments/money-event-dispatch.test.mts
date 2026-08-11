import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMoneyNotificationKey,
  dispatchMoneyEvent,
  type MoneyEvent,
  type MoneyEventClaimResult,
  type MoneyEventDeps,
} from "./money-event-dispatch.ts";

/**
 * Phase 16B M2 — the at-most-once contract.
 * The case that matters: the browser completion route and the CyberSource
 * webhook both observe the same payment. Exactly one receipt, one alert.
 */

function makeEvent(overrides: Partial<MoneyEvent> = {}): MoneyEvent {
  return {
    notification_key: "recorded:7863958223886680704897",
    outcome: "recorded",
    source: "booking_link",
    amount: 500,
    currency: "USD",
    method: "card",
    booking_id: "b0000000-0000-4000-8000-000000000000",
    payment_request_id: null,
    payment_transaction_id: null,
    provider_reference: "7863958223886680704897",
    ...overrides,
  };
}

/** A shared claim store, exactly like the unique index in Postgres. */
function makeDeps(options: {
  claimed?: Set<string>;
  claimResult?: MoneyEventClaimResult;
  guestReceipt?: () => Promise<boolean>;
  operatorAlert?: () => Promise<boolean>;
} = {}) {
  const claimed = options.claimed ?? new Set<string>();
  const calls = { guest: 0, operator: 0, logs: [] as string[], marked: [] as unknown[] };
  const deps: MoneyEventDeps = {
    async claim(event) {
      if (options.claimResult && options.claimResult !== "claimed") return options.claimResult;
      if (claimed.has(event.notification_key)) return "already";
      claimed.add(event.notification_key);
      return "claimed";
    },
    async markSent(_event, sent) {
      calls.marked.push(sent);
    },
    async sendGuestReceipt() {
      calls.guest += 1;
      return options.guestReceipt ? options.guestReceipt() : true;
    },
    async sendOperatorAlert() {
      calls.operator += 1;
      return options.operatorAlert ? options.operatorAlert() : true;
    },
    log(message) {
      calls.logs.push(message);
    },
  };
  return { deps, calls, claimed };
}

test("both observers of the same payment produce exactly one receipt and one alert", async () => {
  const shared = new Set<string>();
  const browser = makeDeps({ claimed: shared });
  const webhook = makeDeps({ claimed: shared });

  const key = buildMoneyNotificationKey({
    outcome: "recorded",
    provider_transaction_id: "7863958223886680704897",
  })!;

  const first = await dispatchMoneyEvent(
    browser.deps,
    makeEvent({ notification_key: key, source: "booking_link" }),
  );
  const second = await dispatchMoneyEvent(
    webhook.deps,
    makeEvent({ notification_key: key, source: "webhook" }),
  );

  assert.deepEqual(first, { kind: "sent", guest_receipt: true, operator_alert: true });
  assert.deepEqual(second, { kind: "already_notified" });
  assert.equal(browser.calls.guest + webhook.calls.guest, 1);
  assert.equal(browser.calls.operator + webhook.calls.operator, 1);
});

test("the two observers agree on the identity of the same payment", () => {
  const fromBrowser = buildMoneyNotificationKey({
    outcome: "recorded",
    provider_transaction_id: "786395",
  });
  const fromWebhook = buildMoneyNotificationKey({
    outcome: "recorded",
    provider_transaction_id: "786395",
    idempotency_key: "oraya-att-8b5bd95c",
  });
  assert.equal(fromBrowser, fromWebhook);

  // A failed attempt and a later recorded payment are different things to say.
  assert.notEqual(
    buildMoneyNotificationKey({ outcome: "failed", provider_transaction_id: "786395" }),
    fromBrowser,
  );
  // No identity at all means nothing is sent (the caller refuses).
  assert.equal(buildMoneyNotificationKey({ outcome: "recorded" }), null);
});

test("a payment with no booking still sends the guest a receipt", async () => {
  const { deps, calls } = makeDeps();
  const result = await dispatchMoneyEvent(
    deps,
    makeEvent({
      booking_id: null,
      payment_request_id: "r0000000-0000-4000-8000-000000000000",
      source: "payment_link",
    }),
  );
  assert.deepEqual(result, { kind: "sent", guest_receipt: true, operator_alert: true });
  assert.equal(calls.guest, 1);
});

test("a receipt failure never fails the payment and never blocks the operator alert", async () => {
  const { deps, calls } = makeDeps({
    guestReceipt: () => Promise.reject(new Error("resend exploded")),
  });
  const result = await dispatchMoneyEvent(deps, makeEvent());
  assert.deepEqual(result, { kind: "sent", guest_receipt: false, operator_alert: true });
  assert.equal(calls.operator, 1);
  assert.ok(calls.logs.some((line) => /guest receipt failed/.test(line)));
});

test("an operator alert failure never throws either", async () => {
  const { deps } = makeDeps({
    operatorAlert: () => Promise.reject(new Error("resend exploded")),
  });
  const result = await dispatchMoneyEvent(deps, makeEvent());
  assert.deepEqual(result, { kind: "sent", guest_receipt: true, operator_alert: false });
});

test("nothing is sent when the claim cannot be made", async () => {
  for (const claimResult of ["unavailable", "error"] as const) {
    const { deps, calls } = makeDeps({ claimResult });
    const result = await dispatchMoneyEvent(deps, makeEvent());
    assert.deepEqual(result, { kind: "not_claimed", reason: claimResult });
    assert.equal(calls.guest, 0, claimResult);
    assert.equal(calls.operator, 0, claimResult);
  }
});

test("a claim that throws sends nothing rather than risking a duplicate", async () => {
  const calls = { guest: 0, operator: 0 };
  const result = await dispatchMoneyEvent(
    {
      claim: () => Promise.reject(new Error("supabase down")),
      sendGuestReceipt: async () => {
        calls.guest += 1;
        return true;
      },
      sendOperatorAlert: async () => {
        calls.operator += 1;
        return true;
      },
      log: () => {},
    },
    makeEvent(),
  );
  assert.deepEqual(result, { kind: "not_claimed", reason: "error" });
  assert.equal(calls.guest, 0);
  assert.equal(calls.operator, 0);
});

test("failed and ambiguous outcomes alert the operator and never the guest", async () => {
  for (const outcome of ["failed", "ambiguous"] as const) {
    const { deps, calls } = makeDeps();
    const result = await dispatchMoneyEvent(
      deps,
      makeEvent({ outcome, notification_key: `${outcome}:786395` }),
    );
    assert.deepEqual(result, { kind: "sent", guest_receipt: false, operator_alert: true });
    assert.equal(calls.guest, 0, outcome);
    assert.equal(calls.operator, 1, outcome);
  }
});

test("an empty notification key is refused before anything is claimed", async () => {
  const { deps, calls } = makeDeps();
  const result = await dispatchMoneyEvent(deps, makeEvent({ notification_key: "  " }));
  assert.deepEqual(result, { kind: "not_claimed", reason: "error" });
  assert.equal(calls.guest, 0);
  assert.equal(calls.operator, 0);
});
