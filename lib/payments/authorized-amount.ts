// Relative .ts import so node:test can load this module (repo test convention).
import { roundMoney } from "../money.ts";

/**
 * Remediation 1.7 — verify that the amount and currency CyberSource reports as
 * authorized match the charge we requested, BEFORE any payment is recorded.
 * Missing or unparsable response amount details fail closed (money-critical).
 */

export type AuthorizedAmountDetails = {
  totalAmount?: unknown;
  authorizedAmount?: unknown;
  currency?: unknown;
} | null | undefined;

export type AmountVerification =
  | { ok: true }
  | { ok: false; reason: string };

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return roundMoney(parsed);
  }
  return null;
}

export function verifyAuthorizedAmountDetails(input: {
  requested_amount: number;
  requested_currency: string;
  response_amount_details: AuthorizedAmountDetails;
}): AmountVerification {
  const details = input.response_amount_details;
  if (!details || typeof details !== "object") {
    return { ok: false, reason: "response_missing_amount_details" };
  }

  const responseAmount =
    parseAmount(details.authorizedAmount) ?? parseAmount(details.totalAmount);
  if (responseAmount === null) {
    return { ok: false, reason: "response_amount_unparsable" };
  }

  const requestedAmount = roundMoney(input.requested_amount);
  if (responseAmount !== requestedAmount) {
    return {
      ok: false,
      reason: `amount_mismatch (requested ${requestedAmount}, authorized ${responseAmount})`,
    };
  }

  const responseCurrency =
    typeof details.currency === "string" ? details.currency.trim().toUpperCase() : null;
  if (!responseCurrency) {
    return { ok: false, reason: "response_currency_missing" };
  }
  if (responseCurrency !== input.requested_currency.trim().toUpperCase()) {
    return {
      ok: false,
      reason: `currency_mismatch (requested ${input.requested_currency}, authorized ${responseCurrency})`,
    };
  }

  return { ok: true };
}
