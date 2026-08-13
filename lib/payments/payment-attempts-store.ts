import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  IN_FLIGHT_ATTEMPT_STATUSES,
  isAllowedAttemptTransition,
  type NewPaymentAttempt,
  type PaymentAttemptStatus,
  type PaymentAttemptStore,
} from "@/lib/payments/unified-checkout-completion";
import { isStepUpExpired } from "@/lib/payments/step-up";
import type { ReconciliationAttempt } from "@/lib/payments/webhook-reconciliation";

/**
 * Plan 3 Phase 3 (KNOWN_BUGS #14) — Supabase implementation of the
 * payment-attempt store. The atomicity of the claim rests on the partial
 * unique index in sql/plan3-payment-attempts.sql (one in-flight attempt per
 * booking); a concurrent insert loses with 23505.
 *
 * Fail-closed contract: when the table does not exist yet (migration not
 * run), claims report "unavailable" and the completion route refuses with a
 * 503 — the unguarded pre-Plan-3 path is never used as a fallback.
 */

const UNIQUE_VIOLATION = "23505";
// 42P01 = Postgres undefined_table; PGRST205 = PostgREST "table not found in
// schema cache" (what Supabase actually surfaces for a missing table).
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTableError(error: { code?: string | null; message?: string | null }) {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
  const message = error.message ?? "";
  return /payment_attempts/.test(message) && /(does not exist|could not find|schema cache)/i.test(message);
}

export const supabasePaymentAttemptStore: PaymentAttemptStore = {
  async claimAttempt(attempt: NewPaymentAttempt) {
    const { error } = await supabaseAdmin.from("payment_attempts").insert({
      id: attempt.id,
      booking_id: attempt.booking_id,
      payment_request_id: attempt.payment_request_id ?? null,
      provider_session_id: attempt.provider_session_id,
      idempotency_key: attempt.idempotency_key,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
    });

    if (!error) return { ok: true as const };
    if (error.code === UNIQUE_VIOLATION) return { ok: false as const, reason: "conflict" as const };
    if (isMissingTableError(error)) {
      console.error("[payments/attempts] payment_attempts table missing — run sql/plan3-payment-attempts.sql:", error.message);
      return { ok: false as const, reason: "unavailable" as const };
    }
    console.error("[payments/attempts] claim insert failed:", error);
    return { ok: false as const, reason: "error" as const };
  },

  async findBlockingAttempt(subject) {
    let query = supabaseAdmin
      .from("payment_attempts")
      .select("id, status")
      // Includes `pending_authentication` (W7 slice 3): a guest parked at their
      // bank must not be able to open a second payment behind the challenge.
      .in("status", [...IN_FLIGHT_ATTEMPT_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1);
    query = subject.payment_request_id
      ? query.eq("payment_request_id", subject.payment_request_id)
      : query.eq("booking_id", subject.booking_id!);
    const { data, error } = await query.maybeSingle<{ id: string; status: PaymentAttemptStatus }>();

    if (error) {
      console.error("[payments/attempts] blocking-attempt lookup failed:", error);
      return null;
    }
    return data ?? null;
  },

  async transitionAttempt(attemptId, expectedStatuses, patch) {
    if (
      expectedStatuses.length === 0 ||
      expectedStatuses.some((status) => !isAllowedAttemptTransition(status, patch.status))
    ) {
      console.error("[payments/attempts] refused invalid attempt transition", {
        attemptId,
        expectedStatuses,
        nextStatus: patch.status,
      });
      return { ok: false as const, reason: "error" as const, current_status: null };
    }

    const { data, error } = await supabaseAdmin
      .from("payment_attempts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", attemptId)
      .in("status", [...expectedStatuses])
      .select("id");

    if (error) {
      console.error("[payments/attempts] attempt transition failed:", {
        attemptId,
        expectedStatuses,
        patch,
        error,
      });
      return { ok: false as const, reason: "error" as const, current_status: null };
    }
    if ((data?.length ?? 0) === 1) return { ok: true as const };

    const { data: current, error: lookupError } = await supabaseAdmin
      .from("payment_attempts")
      .select("status")
      .eq("id", attemptId)
      .maybeSingle<{ status: PaymentAttemptStatus }>();
    if (lookupError) {
      console.error("[payments/attempts] attempt transition conflict lookup failed:", {
        attemptId,
        lookupError,
      });
      return { ok: false as const, reason: "error" as const, current_status: null };
    }
    return {
      ok: false as const,
      reason: "conflict" as const,
      current_status: current?.status ?? null,
    };
  },
};

/**
 * W7 slice 3 — the row a 3-D Secure post-back is about.
 *
 * Reads by attempt id ONLY, and the caller gets that id from a token Oraya
 * signed itself (`verifyStepUpReturnToken`), never from the post-back body.
 * Returns the stored `authentication_transaction_id` and deadline so call 2 is
 * built from Oraya's own record of call 1.
 */
export type StepUpAttemptRow = {
  id: string;
  status: PaymentAttemptStatus;
  booking_id: string | null;
  payment_request_id: string | null;
  provider_session_id: string | null;
  idempotency_key: string | null;
  amount: number | null;
  currency: string | null;
  authentication_transaction_id: string | null;
  step_up_expires_at: string | null;
};

const STEP_UP_ATTEMPT_COLUMNS =
  "id, status, booking_id, payment_request_id, provider_session_id, idempotency_key, amount, currency, authentication_transaction_id, step_up_expires_at";

export async function findStepUpAttempt(attemptId: string): Promise<StepUpAttemptRow | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .select(STEP_UP_ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .maybeSingle<StepUpAttemptRow>();
  if (error) {
    // No attempt id in the log line — it is the handle the post-back travels on.
    console.error("[payments/attempts] step-up attempt lookup failed:", error.message);
    return null;
  }
  return data ?? null;
}

/**
 * W7 slice 3 — the TTL reaper.
 *
 * Bank challenge pages are abandoned constantly: the tab closes, the SMS never
 * arrives, the phone dies. Without this, every abandonment is a permanent lock
 * — precisely the bug slice 1 fixed, reintroduced in a new state.
 *
 * Releasing to `failed` is safe because call 1 authorizes nothing: there is no
 * hold to void and no money to return. The transition is compare-and-set on
 * `status = pending_authentication`, so an attempt that has already been handed
 * back to `claimed` for call 2 is never yanked out from under an in-flight
 * provider call.
 *
 * Returns how many it released. Never throws — a reaper that takes the caller
 * down with it is worse than one that runs next time.
 */
export async function reapExpiredStepUpAttempts(now: Date = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("id, step_up_expires_at")
    .eq("status", "pending_authentication")
    .limit(200);
  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[payments/attempts] step-up reaper lookup failed:", error.message);
    }
    return 0;
  }

  const expired = (data ?? []).filter((row) =>
    isStepUpExpired((row as { step_up_expires_at: string | null }).step_up_expires_at, now),
  );
  let released = 0;
  for (const row of expired) {
    const result = await supabasePaymentAttemptStore.transitionAttempt(
      (row as { id: string }).id,
      ["pending_authentication"],
      { status: "failed" },
    );
    if (result.ok) released += 1;
  }
  if (released > 0) {
    console.warn(`[payments/attempts] released ${released} expired 3-D Secure challenge(s)`);
  }
  return released;
}

const ATTEMPT_RECONCILIATION_COLUMNS =
  "id, booking_id, payment_request_id, status, amount, currency, idempotency_key, provider_transaction_id";

/**
 * Plan 4 Phase 2 (2.1) — match a webhook event to its attempt row by
 * idempotency_key (clientReferenceInformation.code) first, then by provider
 * transaction id. Returns null on no match OR any storage error (the webhook
 * handler treats both as "nothing to reconcile" — never a state change).
 */
export async function findPaymentAttemptByReference(ref: {
  idempotency_key: string | null;
  provider_transaction_id: string | null;
}): Promise<ReconciliationAttempt | null> {
  if (ref.idempotency_key) {
    const { data, error } = await supabaseAdmin
      .from("payment_attempts")
      .select(ATTEMPT_RECONCILIATION_COLUMNS)
      .eq("idempotency_key", ref.idempotency_key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ReconciliationAttempt>();
    if (error) {
      console.error("[payments/attempts] attempt lookup by idempotency_key failed:", error);
      return null;
    }
    if (data) return data;
  }

  if (ref.provider_transaction_id) {
    const { data, error } = await supabaseAdmin
      .from("payment_attempts")
      .select(ATTEMPT_RECONCILIATION_COLUMNS)
      .eq("provider_transaction_id", ref.provider_transaction_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ReconciliationAttempt>();
    if (error) {
      console.error("[payments/attempts] attempt lookup by transaction id failed:", error);
      return null;
    }
    if (data) return data;
  }

  return null;
}

/**
 * Plan 4 Phase 2 (2.3) — reconciliation visibility for /api/health: counts of
 * attempts stuck in claimed/ambiguous older than the cutoff. Counts ONLY —
 * no amounts, no guest data. Null when the table is missing or unreadable.
 */
export async function countStuckPaymentAttempts(
  olderThanIso: string,
): Promise<{ stuck_claimed: number; stuck_ambiguous: number } | null> {
  const counts: number[] = [];
  for (const status of ["claimed", "ambiguous"] as const) {
    const { count, error } = await supabaseAdmin
      .from("payment_attempts")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .lt("created_at", olderThanIso);
    if (error || typeof count !== "number") {
      if (error && !isMissingTableError(error)) {
        console.error("[payments/attempts] stuck-attempt count failed:", error);
      }
      return null;
    }
    counts.push(count);
  }
  return { stuck_claimed: counts[0], stuck_ambiguous: counts[1] };
}
