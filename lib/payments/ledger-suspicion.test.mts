/**
 * Ledger entries that assert money nobody has proven exists.
 * Fixtures are the real live rows from 2026-08-12, ids shortened.
 *
 * Runner: node --experimental-strip-types --test lib/payments/ledger-suspicion.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSuspectLedgerEntries, type LedgerEntry } from "./ledger-suspicion.ts";

function entry(over: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    booking_id: null,
    transaction_type: "payment",
    status: "confirmed",
    amount: 1,
    method: "card",
    provider: "credit_libanais",
    provider_reference: null,
    verified_source: "provider",
    reverses_transaction_id: null,
    notes: null,
    created_at: "2026-08-10T21:00:00.000Z",
    ...over,
  };
}

// The four live rows.
const LIVE: LedgerEntry[] = [
  entry({
    id: "99ba8ae6",
    status: "refunded",
    amount: 1,
    provider_reference: "7863958223886680704897",
    created_at: "2026-08-10T21:06:34.504Z",
  }),
  entry({
    id: "339bbbb0",
    transaction_type: "reversal",
    amount: 1,
    provider_reference: "7863958223886680704897",
    reverses_transaction_id: "99ba8ae6",
    notes: "rejected",
    verified_source: "operator",
    created_at: "2026-08-10T21:20:38.862Z",
  }),
  entry({
    id: "2f605db7",
    transaction_type: "refund",
    amount: 1,
    provider_reference: "7863958223886680704897",
    reverses_transaction_id: "99ba8ae6",
    notes: "Card refund via Oraya / NetCommerce",
    verified_source: "operator",
    created_at: "2026-08-10T22:04:38.873Z",
  }),
  entry({
    id: "8bf1297f",
    booking_id: "53896156",
    amount: 240,
    provider_reference: "7864693288166594704898",
    created_at: "2026-08-11T17:28:50.597Z",
  }),
  entry({
    id: "3a40abab",
    booking_id: "53896156",
    amount: 240,
    method: "bank_transfer",
    provider: "manual",
    provider_reference: null,
    verified_source: "operator",
    notes: "Recorded from the booking payment dialog.",
    created_at: "2026-08-11T17:32:25.264Z",
  }),
  entry({
    id: "ab111140",
    booking_id: "53896156",
    transaction_type: "refund",
    status: "failed",
    amount: 240,
    provider_reference: "pending:oraya-rfnd-8bf1297f-msoy4gu9",
    reverses_transaction_id: "8bf1297f",
    notes: "Card refund via Oraya / NetCommerce\ncredit failed 102 DINVAL",
    created_at: "2026-08-11T17:40:29.080Z",
  }),
];

test("the $1 refund is flagged: its reference is the payment it was meant to undo", () => {
  const found = findSuspectLedgerEntries(LIVE).find((s) => s.entry.id === "2f605db7");
  assert.ok(found, "the phantom refund should be flagged");
  assert.ok(found.suspicions.includes("reference_is_the_payment_it_reverses"));
  assert.equal(found.overstated_by, 1);
});

test("the $1 reversal is flagged twice — bad reference and notes that say rejected", () => {
  const found = findSuspectLedgerEntries(LIVE).find((s) => s.entry.id === "339bbbb0");
  assert.ok(found);
  assert.ok(found.suspicions.includes("reference_is_the_payment_it_reverses"));
  assert.ok(found.suspicions.includes("notes_contradict_confirmed_status"));
});

test("the duplicate $240 manual receipt is flagged, and the real card payment is not", () => {
  const suspects = findSuspectLedgerEntries(LIVE);
  const manual = suspects.find((s) => s.entry.id === "3a40abab");
  assert.ok(manual, "the manual re-record should be flagged");
  assert.ok(manual.suspicions.includes("duplicate_of_a_card_payment"));
  assert.match(manual.remedy, /compensating reversal/);
  assert.equal(
    suspects.some((s) => s.entry.id === "8bf1297f"),
    false,
    "the genuine card payment must not be accused",
  );
});

test("a failed refund asserts nothing, so it is never flagged", () => {
  assert.equal(
    findSuspectLedgerEntries(LIVE).some((s) => s.entry.id === "ab111140"),
    false,
  );
});

test("a payment already marked refunded is not double-counted as suspect", () => {
  assert.equal(
    findSuspectLedgerEntries(LIVE).some((s) => s.entry.id === "99ba8ae6"),
    false,
  );
});

test("a clean ledger produces no accusations", () => {
  const clean: LedgerEntry[] = [
    entry({ id: "p1", booking_id: "b1", amount: 500, provider_reference: "111" }),
    entry({
      id: "r1",
      booking_id: "b1",
      transaction_type: "refund",
      amount: 500,
      provider_reference: "222",
      reverses_transaction_id: "p1",
      notes: "Card refund via Oraya / NetCommerce",
    }),
  ];
  assert.deepEqual(findSuspectLedgerEntries(clean), []);
});

test("a manual receipt far away in time from a card payment is not called a duplicate", () => {
  const spaced: LedgerEntry[] = [
    entry({ id: "p1", booking_id: "b1", amount: 240, created_at: "2026-08-01T10:00:00.000Z" }),
    entry({
      id: "m1",
      booking_id: "b1",
      amount: 240,
      method: "bank_transfer",
      provider: "manual",
      created_at: "2026-08-05T10:00:00.000Z",
    }),
  ];
  assert.deepEqual(findSuspectLedgerEntries(spaced), []);
});

test("a placeholder reference on a confirmed row is flagged", () => {
  const rows = [entry({ id: "x", provider_reference: "pending:oraya-rfnd-abc", transaction_type: "refund" })];
  const found = findSuspectLedgerEntries(rows);
  assert.equal(found.length, 1);
  assert.ok(found[0].suspicions.includes("placeholder_reference_on_confirmed_row"));
});
