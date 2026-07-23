// Relative .ts import so node:test can load this module (repo test convention).
import { roundMoney } from "../money.ts";
import type { PaymentRequestPurpose } from "./domain.ts";
import { DEFAULT_PAYMENT_PUBLIC_SETTINGS, getMinimumDepositAmountFromPercentage } from "./settings.ts";

export const MINIMUM_DEPOSIT_RATIO =
  DEFAULT_PAYMENT_PUBLIC_SETTINGS.deposit_minimum_percentage / 100;

export interface PaymentSelectionValidationInput {
  purpose: PaymentRequestPurpose;
  requestedAmount?: number | null;
  amountTotal: number;
  minimumDepositPercentage?: number;
}

export type PaymentSelectionValidationResult =
  | {
      ok: true;
      chargeAmount: number;
      depositAmount: number;
      remainingBalance: number;
      amountTotal: number;
      purpose: PaymentRequestPurpose;
    }
  | {
      ok: false;
      error: string;
    };

export function getMinimumDepositAmount(
  amountTotal: number,
  minimumDepositPercentage: number = DEFAULT_PAYMENT_PUBLIC_SETTINGS.deposit_minimum_percentage,
): number {
  return getMinimumDepositAmountFromPercentage(amountTotal, minimumDepositPercentage);
}

export function validatePaymentSelection(
  input: PaymentSelectionValidationInput,
): PaymentSelectionValidationResult {
  const amountTotal = roundMoney(input.amountTotal);
  if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
    return { ok: false, error: "Booking total is unavailable for payment." };
  }

  if (input.purpose === "full") {
    return {
      ok: true,
      chargeAmount: amountTotal,
      depositAmount: amountTotal,
      remainingBalance: 0,
      amountTotal,
      purpose: input.purpose,
    };
  }

  if (input.purpose !== "deposit") {
    return { ok: false, error: "Only deposit or full payment is available right now." };
  }

  const requestedAmount = roundMoney(input.requestedAmount ?? 0);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { ok: false, error: "Please enter a valid deposit amount." };
  }

  const minimumDeposit = getMinimumDepositAmount(
    amountTotal,
    input.minimumDepositPercentage,
  );
  if (requestedAmount < minimumDeposit) {
    return {
      ok: false,
      error: `Deposit must be at least USD ${minimumDeposit.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.`,
    };
  }

  if (requestedAmount > amountTotal) {
    return { ok: false, error: "Deposit cannot exceed the total booking amount." };
  }

  return {
    ok: true,
    chargeAmount: requestedAmount,
    depositAmount: requestedAmount,
    remainingBalance: roundMoney(Math.max(0, amountTotal - requestedAmount)),
    amountTotal,
    purpose: input.purpose,
  };
}
