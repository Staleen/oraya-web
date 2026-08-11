/**
 * The guest asked to pay and Oraya could not open a checkout.
 *
 * `/book` handles this gently: the guest is redirected to their booking with
 * "No payment has been collected yet. Oraya will send your secure payment link
 * when it is ready." That sentence is a promise made on the operator's behalf —
 * and until now nobody was told to keep it. The failure went to `console.error`
 * and the guest waited for a link no human knew to send.
 *
 * Found auditing the anonymous booking path on 2026-08-12.
 *
 * Pure: decides whether a failure is the operator's problem, and writes what
 * they should do about it. No I/O.
 */

export type CheckoutSetupFailureStage =
  | "provider_unavailable"
  | "session_not_created"
  | "request_not_created"
  | "booking_not_updated"
  | "unexpected_error";

export type CheckoutSetupFailureInput = {
  stage: CheckoutSetupFailureStage;
  booking_reference: string | null;
  guest_name: string | null;
  amount: number | null;
  currency: string | null;
};

/**
 * Only server-side failures are worth waking an operator for. A 4xx is the
 * guest or the booking state ("already paid in full", "cancelled bookings
 * cannot be paid") — correct refusals, not incidents.
 */
export function shouldAlertOperatorOnCheckoutSetupFailure(status: number): boolean {
  return Number.isFinite(status) && status >= 500;
}

const STAGE_EXPLANATION: Record<CheckoutSetupFailureStage, string> = {
  provider_unavailable: "the payment provider could not be reached",
  session_not_created: "the provider refused to create a checkout session",
  request_not_created: "the payment request could not be saved",
  booking_not_updated: "the checkout opened but the booking could not record it",
  unexpected_error: "an unexpected error interrupted checkout setup",
};

export type CheckoutSetupFailureAlert = {
  subject: string;
  /** Ordered plain sentences. The first one is the headline. */
  lines: string[];
};

export function buildCheckoutSetupFailureAlert(
  input: CheckoutSetupFailureInput,
): CheckoutSetupFailureAlert {
  const who = input.guest_name?.trim() || "A guest";
  const ref = input.booking_reference?.trim();
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0
      ? `${input.currency?.trim() || "USD"} ${input.amount.toFixed(2)}`
      : null;

  return {
    subject: ref
      ? `Guest could not pay — booking ${ref}`
      : "Guest could not pay — checkout could not be opened",
    lines: [
      `${who} tried to pay${amount ? ` ${amount}` : ""} and Oraya could not open a checkout, because ${STAGE_EXPLANATION[input.stage]}.`,
      ref ? `Booking ${ref}.` : "No booking reference was available.",
      "No money was taken.",
      // The guest has already been told this. Say it plainly so the operator
      // knows a promise is outstanding in their name.
      "The guest was told Oraya will send them a secure payment link when it is ready. Send them one.",
    ],
  };
}
