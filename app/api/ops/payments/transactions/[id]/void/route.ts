import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  getCreditLibanaisPaymentSettlement,
  reverseCreditLibanaisAuthorization,
} from "@/lib/payments/credit-libanais";
import {
  claimProviderAuthorizationReversal,
  confirmProviderAuthorizationReversal,
  failProviderAuthorizationReversal,
} from "@/lib/payments/ledger-server";
import { describeCardReturnAction } from "@/lib/payments/provider-settlement";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PaymentTxnRow = {
  id: string;
  payment_request_id: string | null;
  booking_id: string | null;
  transaction_type: string;
  status: string;
  amount: number;
  currency: "USD" | "LBP";
  provider: string;
  provider_reference: string | null;
};

const TXN_COLUMNS =
  "id, payment_request_id, booking_id, transaction_type, status, amount, currency, provider, provider_reference";

const BLOCK_COPY: Record<string, string> = {
  already_reversed: "This authorization has already been voided. Nothing further is owed to the guest.",
  transaction_not_voidable: "Only a confirmed card receipt can be voided.",
  refund_already_recorded:
    "Oraya's ledger already records a refund against this payment, so voiding it would tell two different money stories. Resolve the refund record first (Business Center is the source of truth), then void.",
  newer_transaction_exists:
    "A newer payment has been recorded for this booking. Void the newer one first so the balances stay correct.",
  reversal_pending:
    "A void attempt is already open for this payment. Do NOT retry — check Business Center and record the reversal reference, or release the lock if the hold is still there.",
};

async function loadCardTransaction(id: string) {
  const { data, error } = await supabaseAdmin
    .from("payment_transactions")
    .select(TXN_COLUMNS)
    .eq("id", id)
    .maybeSingle<PaymentTxnRow>();
  if (error) {
    console.error("[ops/payments/void] load failed", error.message);
    return { error: NextResponse.json({ error: "Could not load that payment." }, { status: 503 }) };
  }
  if (!data) {
    return { error: NextResponse.json({ error: "That payment no longer exists." }, { status: 404 }) };
  }
  if (data.provider !== "credit_libanais" || !data.provider_reference?.trim()) {
    return {
      error: NextResponse.json(
        { error: "Only card payments with a NetCommerce reference can be voided." },
        { status: 409 },
      ),
    };
  }
  return { txn: data };
}

/**
 * Settlement assessment — which money-return instrument this card receipt
 * actually allows. Read-only: no claim, no provider money movement.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const loaded = await loadCardTransaction(id);
  if (loaded.error) return loaded.error;
  const txn = loaded.txn!;

  let assessment;
  try {
    assessment = await getCreditLibanaisPaymentSettlement({
      payment_id: txn.provider_reference!.trim(),
    });
  } catch (error) {
    if (!(error instanceof PaymentProviderConfigurationError)) {
      console.error("[ops/payments/void] settlement lookup failed", error);
    }
    assessment = {
      ok: false,
      state: "unknown" as const,
      provider_status: null,
      reason_code: null,
      decision_manager_reject: false,
    };
  }

  const guidance = describeCardReturnAction({
    state: assessment.state,
    decision_manager_reject: assessment.decision_manager_reject,
  });
  return NextResponse.json({
    ok: true,
    transaction_id: txn.id,
    checked: assessment.ok,
    state: assessment.state,
    provider_status: assessment.provider_status,
    reason_code: assessment.reason_code,
    decision_manager_reject: assessment.decision_manager_reject,
    action: guidance.action,
    title: guidance.title,
    copy: guidance.copy,
  });
}

/**
 * Money-safe authorization reversal (void):
 * - mode "provider" (owner only): claim pending → CyberSource reversal → confirm/fail
 * - mode "record":  Business Center already shows the reversal; confirm with its reference
 * - mode "fail":    Business Center shows the hold is still there; release the lock
 *
 * A void is never a refund: no refund row is written and no refund provider
 * reference is reused. Never retries the provider after an ambiguous outcome.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: {
    mode?: unknown;
    provider_reference?: unknown;
    notes?: unknown;
    reason?: unknown;
    idempotency_key?: unknown;
    reversal_transaction_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const mode =
    body.mode === "record" ? "record" : body.mode === "fail" ? "fail" : "provider";
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 50)
      : `oraya-void-${crypto.randomUUID()}`.slice(0, 50);

  const loaded = await loadCardTransaction(id);
  if (loaded.error) return loaded.error;
  const txn = loaded.txn!;

  const openReversalId =
    typeof body.reversal_transaction_id === "string" && body.reversal_transaction_id.trim()
      ? body.reversal_transaction_id.trim()
      : "";

  // ── Release an open void lock after checking Business Center ───────────────
  if (mode === "fail") {
    const reason =
      typeof body.reason === "string" && body.reason.trim().length >= 8
        ? body.reason.trim().slice(0, 1000)
        : notes.length >= 8
          ? notes
          : "";
    if (!reason) {
      return NextResponse.json(
        { error: "Add a short note saying what Business Center shows for this authorization." },
        { status: 400 },
      );
    }
    if (!openReversalId) {
      return NextResponse.json({ error: "There is no open void attempt to release." }, { status: 409 });
    }
    const failed = await failProviderAuthorizationReversal({
      reversal_transaction_id: openReversalId,
      reason,
    });
    if (!failed.ok) return reversalRpcError(failed.error);
    return NextResponse.json({ ok: true, mode, reversal_transaction_id: openReversalId });
  }

  // ── Record a void already performed in Business Center ─────────────────────
  if (mode === "record") {
    const providerReference =
      typeof body.provider_reference === "string" ? body.provider_reference.trim() : "";
    if (!providerReference || providerReference.startsWith("pending:")) {
      return NextResponse.json(
        { error: "Paste the Business Center reversal reference to record a void that already happened." },
        { status: 400 },
      );
    }

    let reversalId = openReversalId;
    if (!reversalId) {
      const claimed = await claimProviderAuthorizationReversal({
        payment_transaction_id: txn.id,
        idempotency_key: idempotencyKey,
        staff_id: auth.staff.id,
        notes: notes || "Authorization reversal recorded from Business Center",
      });
      if (!claimed.ok) return reversalRpcError(claimed.error);
      if (claimed.result.blocked) return blockedResponse(claimed.result.block_reason);
      reversalId = claimed.result.reversal_transaction_id ?? "";
      if (!reversalId) {
        return NextResponse.json({ error: "Could not open that void safely." }, { status: 500 });
      }
    }

    const confirmed = await confirmProviderAuthorizationReversal({
      reversal_transaction_id: reversalId,
      provider_reference: providerReference,
      verified_source: "operator",
    });
    if (!confirmed.ok) return reversalRpcError(confirmed.error);
    return NextResponse.json({
      ok: true,
      mode,
      currency: txn.currency,
      provider_reference: providerReference,
      result: confirmed.result,
    });
  }

  // ── Provider path: claim first, then call the bank ─────────────────────────
  const claimed = await claimProviderAuthorizationReversal({
    payment_transaction_id: txn.id,
    idempotency_key: idempotencyKey,
    staff_id: auth.staff.id,
    notes: notes || "Authorization reversal via Oraya / NetCommerce",
  });
  if (!claimed.ok) return reversalRpcError(claimed.error);
  if (claimed.result.blocked) {
    return blockedResponse(claimed.result.block_reason, {
      reversal_transaction_id: claimed.result.reversal_transaction_id,
      idempotency_key: idempotencyKey,
    });
  }
  const reversalId = claimed.result.reversal_transaction_id;
  if (!reversalId) {
    return NextResponse.json({ error: "Could not open that void safely." }, { status: 500 });
  }

  try {
    const reversal = await reverseCreditLibanaisAuthorization({
      payment_id: txn.provider_reference!.trim(),
      amount: Number(txn.amount),
      currency: txn.currency,
      merchant_reference: idempotencyKey,
      reason: notes || "Authorization reversed by Oraya",
    });

    if (reversal.outcome === "approved") {
      const confirmed = await confirmProviderAuthorizationReversal({
        reversal_transaction_id: reversalId,
        provider_reference: reversal.reference,
        verified_source: "provider",
      });
      if (!confirmed.ok) {
        return NextResponse.json(
          {
            error:
              "The bank released the hold, but Oraya could not record it. Do NOT retry the void — record the Business Center reversal reference instead.",
            provider_reference: reversal.reference,
            provider_blocked: true,
            can_record_manual: true,
            reversal_transaction_id: reversalId,
            idempotency_key: idempotencyKey,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        mode,
        amount: Number(txn.amount),
        currency: txn.currency,
        provider_reference: reversal.reference,
        result: confirmed.result,
      });
    }

    if (reversal.outcome === "declined") {
      await failProviderAuthorizationReversal({
        reversal_transaction_id: reversalId,
        reason: reversal.message,
      });
      return NextResponse.json(
        {
          error: reversal.message || "The gateway did not accept the void.",
          provider_status: reversal.status,
          can_record_manual: true,
          provider_blocked: false,
        },
        { status: 402 },
      );
    }

    // Ambiguous — leave the pending claim in place so nothing is retried.
    return NextResponse.json(
      {
        error: reversal.message,
        provider_status: reversal.status,
        provider_reference: reversal.reversal_id,
        correlation_id: reversal.correlation_id ?? null,
        provider_blocked: true,
        can_record_manual: true,
        reversal_transaction_id: reversalId,
        idempotency_key: idempotencyKey,
      },
      { status: 502 },
    );
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      await failProviderAuthorizationReversal({
        reversal_transaction_id: reversalId,
        reason: error.message,
      });
      return NextResponse.json(
        { error: "Card voids are not configured right now.", can_record_manual: true },
        { status: error.statusCode },
      );
    }
    console.error("[ops/payments/void] provider call failed", error);
    return NextResponse.json(
      {
        error:
          "Could not confirm the void with NetCommerce. Do NOT retry — check Business Center and record the reversal reference if the hold was released.",
        provider_blocked: true,
        can_record_manual: true,
        reversal_transaction_id: reversalId,
        idempotency_key: idempotencyKey,
      },
      { status: 502 },
    );
  }
}

function blockedResponse(
  reason: string | null,
  extra: Record<string, unknown> = {},
) {
  const key = reason ?? "";
  return NextResponse.json(
    {
      error: BLOCK_COPY[key] ?? "That payment cannot be voided right now.",
      block_reason: key || null,
      provider_blocked: key === "reversal_pending",
      can_record_manual: key === "reversal_pending",
      ...extra,
    },
    { status: 409 },
  );
}

function reversalRpcError(message: string | undefined) {
  const msg = message ?? "";
  if (msg.includes("function") && msg.includes("does not exist")) {
    return NextResponse.json(
      {
        error:
          "Void SQL is not applied yet. Run sql/phase-16b-provider-authorization-reversal.sql in Supabase, then try again.",
      },
      { status: 503 },
    );
  }
  if (msg.includes("payment_transaction_facts_are_immutable")) {
    return NextResponse.json(
      {
        error:
          "The void is blocked by an outdated ledger protect rule. Run sql/phase-16b-provider-authorization-reversal.sql in Supabase, then try again.",
      },
      { status: 503 },
    );
  }
  if (msg.includes("provider_reference_replay")) {
    return NextResponse.json(
      { error: "That Business Center reversal reference is already recorded." },
      { status: 409 },
    );
  }
  if (msg.includes("already_confirmed")) {
    return NextResponse.json({ error: "That void is already recorded." }, { status: 409 });
  }
  if (msg.includes("reversal_not_pending")) {
    return NextResponse.json(
      { error: "That void attempt is no longer open. Refresh the page." },
      { status: 409 },
    );
  }
  if (msg.includes("reversal_not_found")) {
    return NextResponse.json(
      { error: "That void attempt no longer exists. Refresh the page." },
      { status: 404 },
    );
  }
  if (msg.includes("not_card_provider") || msg.includes("missing_provider_payment_id")) {
    return NextResponse.json(
      { error: "Only card payments with a NetCommerce reference can be voided." },
      { status: 409 },
    );
  }
  console.error("[ops/payments/void] rpc failed", msg);
  return NextResponse.json({ error: "Could not complete that void safely." }, { status: 500 });
}
