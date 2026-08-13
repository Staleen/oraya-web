import { findStepUpAttempt, supabasePaymentAttemptStore } from "@/lib/payments/payment-attempts-store";
import { isStepUpExpired } from "@/lib/payments/step-up";

/**
 * W7 slice 5 — the server's answer to "is there a challenge to resume?"
 *
 * The browser is allowed to ASK. It is not allowed to say which attempt, or
 * what the authentication id is, or whether the window is still open — all
 * three come from Oraya's own rows. That is the whole point: the bank's result
 * reaches Oraya through the guest's browser and is attacker-controlled, so the
 * post-back is a trigger and never evidence.
 *
 * Returns null when there is nothing to resume, which sends the caller down the
 * ordinary claim-a-new-attempt path.
 */
export type StepUpResume = {
  attempt_id: string;
  authentication_transaction_id: string;
};

export async function resolveStepUpResume(
  requested: boolean,
  subject: { booking_id: string | null; payment_request_id: string | null },
): Promise<StepUpResume | null> {
  // Not asked for ⇒ not a single extra query. With 3-D Secure off nothing ever
  // asks, so the live payment path is byte-for-byte the path it was.
  if (!requested) return null;

  const blocking = await supabasePaymentAttemptStore.findBlockingAttempt(subject);
  if (!blocking || blocking.status !== "pending_authentication") return null;

  const row = await findStepUpAttempt(blocking.id);
  if (!row || row.status !== "pending_authentication") return null;

  const authenticationTransactionId = row.authentication_transaction_id?.trim();
  if (!authenticationTransactionId) return null;

  // Past its deadline ⇒ refuse to resume, and leave the row for the reaper.
  // Validating an expired challenge is exactly the interleaving that would
  // charge a guest against an attempt Oraya is about to write off.
  if (isStepUpExpired(row.step_up_expires_at)) return null;

  return { attempt_id: row.id, authentication_transaction_id: authenticationTransactionId };
}
