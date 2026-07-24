import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  NewPaymentAttempt,
  PaymentAttemptStatus,
  PaymentAttemptStore,
} from "@/lib/payments/unified-checkout-completion";

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

  async findBlockingAttempt(bookingId: string) {
    const { data, error } = await supabaseAdmin
      .from("payment_attempts")
      .select("id, status")
      .eq("booking_id", bookingId)
      .in("status", ["claimed", "authorized", "ambiguous"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: PaymentAttemptStatus }>();

    if (error) {
      console.error("[payments/attempts] blocking-attempt lookup failed:", error);
      return null;
    }
    return data ?? null;
  },

  async updateAttempt(attemptId, patch) {
    const { data, error } = await supabaseAdmin
      .from("payment_attempts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", attemptId)
      .select("id");

    if (error) {
      console.error("[payments/attempts] attempt update failed:", { attemptId, patch, error });
      return { ok: false };
    }
    return { ok: (data?.length ?? 0) === 1 };
  },
};
