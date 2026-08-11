/**
 * Ledger entries that assert money nobody has proven exists.
 *
 * Live evidence, 2026-08-12 — four rows in `payment_transactions` claim money
 * that the bank does not agree with:
 *
 *   1. A $240 manual "bank transfer" recorded from the booking dialog minutes
 *      after a card payment of the identical amount, because the paid light
 *      had not turned green. No transfer ever happened; the booking now reads
 *      $480 received.
 *   2. A $1 refund marked `confirmed` whose `provider_reference` is the
 *      PAYMENT's id — the credit actually failed (102 DINVAL) and the
 *      authorization never settled. KNOWN_BUGS #17.
 *   3. A $1 reversal marked `confirmed` with notes "rejected", carrying the
 *      same payment id as its reference.
 *   4. A $240 card payment recorded `confirmed` and later voided directly in
 *      Business Center, so Oraya still counts money the bank released.
 *
 * The ledger is append-only and its history is immutable on purpose, so
 * nothing here edits a row. This module only CLASSIFIES: it names the entries
 * that cannot be trusted and what would put each right. Appending the
 * compensating entry stays a human decision, because every one of them moves
 * recorded money.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type LedgerEntry = {
  id: string;
  booking_id: string | null;
  transaction_type: string;
  status: string;
  amount: number;
  method: string | null;
  provider: string | null;
  provider_reference: string | null;
  verified_source: string | null;
  reverses_transaction_id: string | null;
  notes: string | null;
  created_at: string;
};

export type LedgerSuspicion =
  /** A credit/void whose only reference is the payment it was meant to undo. */
  | "reference_is_the_payment_it_reverses"
  /** A confirmed row still carrying a placeholder reference. */
  | "placeholder_reference_on_confirmed_row"
  /** Notes record a rejection while the row claims success. */
  | "notes_contradict_confirmed_status"
  /** A manual receipt duplicating a card payment for the same booking+amount. */
  | "duplicate_of_a_card_payment";

export type SuspectEntry = {
  entry: LedgerEntry;
  suspicions: LedgerSuspicion[];
  /** Signed effect on recorded money if this entry is wrong. */
  overstated_by: number;
  remedy: string;
};

const MONEY_ASSERTING_STATUSES = new Set(["confirmed"]);
const REJECTION_WORDS = /\b(rejected|declined|failed|dinval)\b/i;
/** A manual receipt this close to an identical card payment is a re-record. */
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

function isMoneyAsserting(entry: LedgerEntry): boolean {
  return MONEY_ASSERTING_STATUSES.has(String(entry.status ?? "").toLowerCase());
}

function cents(value: number): number {
  return Math.round(Number(value) * 100);
}

/**
 * Which entries cannot be trusted, and why.
 *
 * Conservative by construction: an entry is only named when the ledger's own
 * contents contradict it. Nothing here reaches the provider, so nothing here
 * can be wrong about what the bank says — it reports what Oraya has already
 * written down about itself.
 */
export function findSuspectLedgerEntries(entries: LedgerEntry[]): SuspectEntry[] {
  const suspects: SuspectEntry[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));

  for (const entry of entries) {
    if (!isMoneyAsserting(entry)) continue;
    const suspicions: LedgerSuspicion[] = [];

    const type = String(entry.transaction_type ?? "").toLowerCase();
    const isUndo = type === "refund" || type === "reversal";

    if (isUndo && entry.reverses_transaction_id) {
      const target = byId.get(entry.reverses_transaction_id);
      // A real credit or void gets its OWN id from the provider. Carrying the
      // payment's id means nothing came back — the undo was never proven.
      if (
        target &&
        entry.provider_reference &&
        target.provider_reference &&
        entry.provider_reference === target.provider_reference
      ) {
        suspicions.push("reference_is_the_payment_it_reverses");
      }
    }

    if (entry.provider_reference?.toLowerCase().startsWith("pending:")) {
      suspicions.push("placeholder_reference_on_confirmed_row");
    }

    if (entry.notes && REJECTION_WORDS.test(entry.notes)) {
      suspicions.push("notes_contradict_confirmed_status");
    }

    if (type === "payment" && String(entry.provider ?? "").toLowerCase() === "manual") {
      const twin = entries.find(
        (other) =>
          other.id !== entry.id &&
          other.booking_id &&
          other.booking_id === entry.booking_id &&
          String(other.transaction_type ?? "").toLowerCase() === "payment" &&
          String(other.method ?? "").toLowerCase() === "card" &&
          cents(other.amount) === cents(entry.amount) &&
          Math.abs(Date.parse(other.created_at) - Date.parse(entry.created_at)) <= DUPLICATE_WINDOW_MS,
      );
      if (twin) suspicions.push("duplicate_of_a_card_payment");
    }

    if (suspicions.length === 0) continue;

    // A payment overstates what Oraya holds; a phantom refund overstates what
    // Oraya gave back. Both are reported as the size of the error.
    suspects.push({
      entry,
      suspicions,
      overstated_by: Number(entry.amount),
      remedy: remedyFor(type, suspicions),
    });
  }

  return suspects;
}

function remedyFor(type: string, suspicions: LedgerSuspicion[]): string {
  if (suspicions.includes("duplicate_of_a_card_payment")) {
    return "Append a compensating reversal for the manual receipt. The card payment beside it is the real one.";
  }
  if (type === "refund" || type === "reversal") {
    return "Confirm in Business Center whether this credit or void actually ran. If it did not, append a compensating entry so the ledger stops claiming the guest was paid back.";
  }
  return "Confirm in Business Center that this capture still stands. If it was voided there, append a compensating reversal.";
}

/** One-line operator summary. */
export function describeSuspicion(suspicion: LedgerSuspicion): string {
  switch (suspicion) {
    case "reference_is_the_payment_it_reverses":
      return "Its provider reference is the payment it was meant to undo — the bank never returned one of its own.";
    case "placeholder_reference_on_confirmed_row":
      return "It is marked confirmed but still carries a placeholder reference.";
    case "notes_contradict_confirmed_status":
      return "Its own notes record a rejection while the row claims success.";
    case "duplicate_of_a_card_payment":
      return "It repeats a card payment of the same amount on the same booking, minutes apart.";
  }
}
