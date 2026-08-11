/**
 * Ledger drift — money the provider says is gone, that Oraya still counts.
 *
 * Anything done directly in Business Center is invisible to Oraya. The webhook
 * cannot fire for this integration, and the in-flight reconciler deliberately
 * never re-examines a `recorded` attempt, because re-opening settled history is
 * how ledgers get corrupted.
 *
 * So a void performed in Business Center leaves Oraya believing a guest paid.
 * Live proof 2026-08-11: booking 52f5b602 (a real guest) still read
 * `paid_in_full`, $240, with no reversal, after the authorization was voided at
 * the bank.
 *
 * This module decides — conservatively — when a recorded card payment has been
 * undone at the provider. The caller then appends a **compensating reversal**
 * through the existing authorization-reversal RPCs. Nothing is ever edited or
 * deleted: the payment stays, the reversal is added beside it, and the story
 * reads correctly in both directions.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

import { classifyCardSettlementState } from "./provider-settlement.ts";

/** Provider statuses that prove the money is no longer coming. */
export const PROVIDER_UNDONE_STATUSES = [
  "VOIDED",
  "REVERSED",
  "CANCELLED",
  "AUTHORIZED_REVERSED",
] as const;

export type DriftDecision =
  /** The provider says this money is gone and Oraya still counts it. */
  | { drifted: true; reason: "provider_voided" }
  /** No action. Either it still stands, or we cannot prove otherwise. */
  | { drifted: false; reason: DriftSkipReason };

export type DriftSkipReason =
  | "provider_unreachable"
  | "still_valid"
  | "already_reversed_in_oraya"
  | "already_refunded_in_oraya"
  | "not_a_card_payment"
  | "not_confirmed"
  | "unknown_provider_state";

export type DriftInput = {
  /** Oraya's view. */
  transaction_type: string | null;
  status: string | null;
  provider: string | null;
  /** A reversal or refund already recorded against this payment in Oraya. */
  has_reversal: boolean;
  has_refund: boolean;
  /** The provider's view — null when it could not be reached. */
  provider_status: string | null;
  provider_reachable: boolean;
};

/**
 * Decide whether Oraya's ledger has drifted from the provider.
 *
 * Fails closed in every direction: an unreachable provider, an unrecognised
 * status, or anything already corrected in Oraya all mean "do nothing". Only
 * an explicit voided/reversed status on a payment Oraya still counts as
 * confirmed produces a correction.
 */
export function detectProviderDrift(input: DriftInput): DriftDecision {
  if (input.transaction_type !== "payment") {
    return { drifted: false, reason: "not_a_card_payment" };
  }
  if (input.provider !== "credit_libanais") {
    return { drifted: false, reason: "not_a_card_payment" };
  }
  if (input.status !== "confirmed") {
    return { drifted: false, reason: "not_confirmed" };
  }
  // Already corrected — never stack a second correction on the same payment.
  if (input.has_reversal) return { drifted: false, reason: "already_reversed_in_oraya" };
  if (input.has_refund) return { drifted: false, reason: "already_refunded_in_oraya" };

  if (!input.provider_reachable) {
    return { drifted: false, reason: "provider_unreachable" };
  }

  const status = input.provider_status?.trim().toUpperCase() ?? "";
  if (!status) return { drifted: false, reason: "unknown_provider_state" };

  if ((PROVIDER_UNDONE_STATUSES as readonly string[]).includes(status)) {
    return { drifted: true, reason: "provider_voided" };
  }

  // Anything the settlement classifier still recognises as live money stands.
  const settlement = classifyCardSettlementState({ status });
  if (settlement === "reversed") return { drifted: true, reason: "provider_voided" };
  if (settlement === "unknown") return { drifted: false, reason: "unknown_provider_state" };
  return { drifted: false, reason: "still_valid" };
}

/** Owner-facing note recorded on the compensating entry. */
export function describeDriftCorrection(providerStatus: string | null): string {
  return (
    "Corrected automatically: the provider reports this authorization as " +
    `${(providerStatus ?? "reversed").toLowerCase()}, so the money recorded in Oraya was never received. ` +
    "The original entry is kept; this reversal is recorded beside it."
  );
}
