import crypto from "crypto";
import { NextResponse } from "next/server";
import { executeCardRefund } from "@/lib/payments/execute-refund";
import {
  confirmProviderRefund,
  failProviderRefund,
  recordProviderRefund,
} from "@/lib/payments/ledger-server";
import {
  remainingRefundableAmount,
  validateRefundAmount,
} from "@/lib/payments/provider-refund";
import {
  describeCardReturnAction,
  explainRefundFailure,
} from "@/lib/payments/provider-settlement";
import { roundMoney } from "@/lib/money";
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

/**
 * Money-safe card refund:
 * - mode "provider" (owner only): claim pending → CyberSource → confirm/fail
 * - mode "record": Business Center already refunded; claim+confirm with BC reference
 *
 * Never retries the provider after an ambiguous outcome. Pending claims block
 * concurrent provider refunds for the same payment.
 */

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: {
    amount?: unknown;
    mode?: unknown;
    provider_reference?: unknown;
    notes?: unknown;
    idempotency_key?: unknown;
    refund_transaction_id?: unknown;
    reason?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const mode =
    body.mode === "record" ? "record" : body.mode === "fail" ? "fail" : "provider";
  const auth = await requireOps(
    request,
    mode === "provider" || mode === "fail" ? { requiredRole: "owner" } : undefined,
  );
  if (!auth.ok) return auth.response;

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 50)
      : `oraya-rfnd-${crypto.randomUUID()}`.slice(0, 50);

  const { data: txn, error: txnError } = await supabaseAdmin
    .from("payment_transactions")
    .select(
      "id, payment_request_id, booking_id, transaction_type, status, amount, currency, provider, provider_reference",
    )
    .eq("id", id)
    .maybeSingle<PaymentTxnRow>();
  if (txnError) {
    console.error("[ops/payments/refund] load failed", txnError.message);
    return NextResponse.json({ error: "Could not load that payment." }, { status: 503 });
  }
  if (!txn) return NextResponse.json({ error: "That payment no longer exists." }, { status: 404 });
  // Include 'reversed': Ops "Reverse" is ledger-only and does not return card
  // money. A reversed card receipt with a CyberSource id must still be refundable.
  if (
    txn.transaction_type !== "payment" ||
    !["confirmed", "refunded", "reversed"].includes(txn.status)
  ) {
    return NextResponse.json({ error: "That payment cannot be refunded." }, { status: 409 });
  }
  if (txn.provider !== "credit_libanais" || !txn.provider_reference?.trim()) {
    return NextResponse.json(
      { error: "Only card payments with a NetCommerce reference can use this refund path." },
      { status: 409 },
    );
  }

  const { data: priorRefunds, error: priorError } = await supabaseAdmin
    .from("payment_transactions")
    .select("id, amount, status")
    .eq("reverses_transaction_id", txn.id)
    .eq("transaction_type", "refund")
    .in("status", ["confirmed", "pending"]);
  if (priorError) {
    console.error("[ops/payments/refund] prior refunds failed", priorError.message);
    return NextResponse.json({ error: "Could not check existing refunds." }, { status: 503 });
  }
  const alreadyReserved = roundMoney(
    (priorRefunds ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const remaining = remainingRefundableAmount({
    payment_amount: Number(txn.amount),
    already_refunded: alreadyReserved,
  });

  const hasPending = (priorRefunds ?? []).some((row) => row.status === "pending");
  const pendingRefundId =
    typeof body.refund_transaction_id === "string" && body.refund_transaction_id.trim()
      ? body.refund_transaction_id.trim()
      : "";

  if (mode === "fail") {
    const failReason =
      typeof body.reason === "string" && body.reason.trim().length >= 8
        ? body.reason.trim().slice(0, 1000)
        : typeof body.notes === "string" && body.notes.trim().length >= 8
          ? body.notes.trim().slice(0, 1000)
          : "";
    if (!failReason) {
      return NextResponse.json(
        { error: "Add a short note confirming Business Center shows no refund." },
        { status: 400 },
      );
    }

    const targetPendingId =
      pendingRefundId ||
      (priorRefunds ?? []).find((row) => row.status === "pending")?.id ||
      "";
    if (!targetPendingId) {
      return NextResponse.json({ error: "There is no open refund attempt to release." }, { status: 409 });
    }

    const failed = await failProviderRefund({
      refund_transaction_id: targetPendingId,
      reason: failReason,
    });
    if (!failed.ok) {
      const msg = failed.error ?? "";
      if (msg.includes("function") && msg.includes("does not exist")) {
        return NextResponse.json(
          {
            error:
              "Refund SQL is not applied yet. Run sql/phase-16b-provider-refund.sql in Supabase, then try again.",
          },
          { status: 503 },
        );
      }
      if (msg.includes("payment_transaction_facts_are_immutable")) {
        return NextResponse.json(
          {
            error:
              "Refund release is blocked by an outdated ledger protect rule. Run sql/phase-16b-provider-refund-settle-protect.sql in Supabase, then try Release again.",
          },
          { status: 503 },
        );
      }
      if (msg.includes("refund_not_pending")) {
        return NextResponse.json(
          { error: "That refund attempt is no longer open. Refresh the page." },
          { status: 409 },
        );
      }
      if (msg.includes("refund_not_found")) {
        return NextResponse.json(
          { error: "That refund attempt no longer exists. Refresh the page." },
          { status: 404 },
        );
      }
      console.error("[ops/payments/refund] fail release failed", msg);
      return NextResponse.json(
        { error: "Could not release that refund attempt. Refresh and try again." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      mode,
      refund_transaction_id: targetPendingId,
      result: failed.result,
    });
  }

  if (mode === "record") {
    const providerReference =
      typeof body.provider_reference === "string" ? body.provider_reference.trim() : "";
    if (!providerReference || providerReference.startsWith("pending:")) {
      return NextResponse.json(
        { error: "Paste the Business Center refund reference to record an already-completed refund." },
        { status: 400 },
      );
    }

    // Reconcile a specific pending claim (preferred after ambiguous provider attempt).
    if (pendingRefundId) {
      const confirmed = await confirmProviderRefund({
        refund_transaction_id: pendingRefundId,
        provider_reference: providerReference,
        verified_source: "operator",
      });
      if (!confirmed.ok) {
        const msg = confirmed.error ?? "";
        if (msg.includes("provider_reference_replay")) {
          return NextResponse.json(
            { error: "That Business Center refund reference is already recorded." },
            { status: 409 },
          );
        }
        if (msg.includes("function") && msg.includes("does not exist")) {
          return NextResponse.json(
            {
              error:
                "Refund SQL is not applied yet. Run sql/phase-16b-provider-refund.sql in Supabase, then try again.",
            },
            { status: 503 },
          );
        }
        if (msg.includes("payment_transaction_facts_are_immutable")) {
          return NextResponse.json(
            {
              error:
                "Recording is blocked by an outdated ledger protect rule. Run sql/phase-16b-provider-refund-settle-protect.sql in Supabase, then try again.",
            },
            { status: 503 },
          );
        }
        return NextResponse.json(
          {
            error:
              "Could not record that refund. Check the Business Center reference and that refund SQL is applied.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        mode,
        currency: txn.currency,
        provider_reference: providerReference,
        result: confirmed.result,
      });
    }

    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: hasPending
            ? "A refund attempt is still pending. Record it using the open attempt (do not start a new one)."
            : "This payment is already fully refunded.",
          provider_blocked: hasPending,
          can_record_manual: hasPending,
        },
        { status: 409 },
      );
    }

    const requestedAmount =
      typeof body.amount === "number"
        ? body.amount
        : typeof body.amount === "string"
          ? Number(body.amount)
          : remaining;
    const amountCheck = validateRefundAmount({ amount: requestedAmount, remaining });
    if (!amountCheck.ok) {
      return NextResponse.json(
        {
          error:
            amountCheck.reason === "refund_exceeds_payment"
              ? `You can refund at most ${remaining.toFixed(2)} ${txn.currency}.`
              : "Enter a valid refund amount.",
        },
        { status: 400 },
      );
    }

    const recorded = await recordProviderRefund({
      payment_transaction_id: txn.id,
      amount: amountCheck.amount,
      provider_reference: providerReference,
      idempotency_key: idempotencyKey,
      staff_id: auth.staff.id,
      notes: notes || "Recorded Business Center refund",
      verified_source: "operator",
    });
    if (!recorded.ok) {
      const msg = recorded.error ?? "";
      if (msg.includes("provider_reference_replay")) {
        return NextResponse.json(
          { error: "That Business Center refund reference is already recorded." },
          { status: 409 },
        );
      }
      if (msg.includes("refund_ambiguous_pending")) {
        return NextResponse.json(
          {
            error:
              "Another refund attempt is still pending for this payment. Record against that attempt first.",
            provider_blocked: true,
            can_record_manual: true,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not record that refund." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      mode,
      amount: amountCheck.amount,
      currency: txn.currency,
      provider_reference: providerReference,
      result: recorded.result,
    });
  }


  // ── Provider mode: one shared execution sequence (claim before provider),
  //    mapped back to this route's existing operator copy and status codes.
  //    The sequence itself lives in lib/payments/execute-refund.ts so the
  //    decline path can perform the same refund without duplicating it.
  const requestedAmount =
    typeof body.amount === "number"
      ? body.amount
      : typeof body.amount === "string"
        ? Number(body.amount)
        : remaining;

  const execution = await executeCardRefund({
    payment_transaction_id: txn.id,
    amount: requestedAmount,
    idempotency_key: idempotencyKey,
    staff_id: auth.staff.id,
    notes: notes || "Card refund via Oraya / NetCommerce",
  });

  switch (execution.kind) {
    case "refunded":
      return NextResponse.json({
        ok: true,
        mode,
        ...(execution.reconciled ? { reconciled: true } : {}),
        amount: execution.amount,
        currency: execution.currency,
        provider_reference: execution.provider_reference,
        result: execution.result,
      });

    case "idempotent":
      return NextResponse.json({
        ok: true,
        mode,
        amount: execution.amount,
        currency: execution.currency,
        idempotent: true,
      });

    case "nothing_remaining":
      if (execution.detected === "at_claim") {
        return NextResponse.json(
          { error: "This payment is already fully refunded." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: execution.has_pending_refund
            ? "A refund is already in progress or needs reconciliation. Do NOT retry the card refund — check Business Center and record the reference if money already returned."
            : "This payment is already fully refunded.",
          provider_blocked: execution.has_pending_refund,
          can_record_manual: execution.has_pending_refund,
        },
        { status: 409 },
      );

    case "invalid_amount":
      return NextResponse.json(
        {
          error:
            execution.reason === "refund_exceeds_payment"
              ? `You can refund at most ${execution.remaining.toFixed(2)} ${execution.currency}.`
              : "Enter a valid refund amount.",
        },
        { status: 400 },
      );

    case "requires_void": {
      const guidance = describeCardReturnAction({
        state: execution.settlement_state,
        decision_manager_reject: execution.decision_manager_reject,
      });
      return NextResponse.json(
        {
          error: guidance.copy,
          requires_void: execution.settlement_state === "authorized_only",
          settlement_state: execution.settlement_state,
          provider_status: execution.provider_status,
          reason_code: execution.reason_code,
          decision_manager_reject: execution.decision_manager_reject,
          action: guidance.action,
        },
        { status: 409 },
      );
    }

    case "declined": {
      const explanation = explainRefundFailure({
        message: execution.message,
        settlement_state: execution.settlement_state,
      });
      const wrongInstrument = explanation !== (execution.message?.trim() || "");
      return NextResponse.json(
        {
          error: explanation || "The gateway did not accept the refund.",
          provider_status: execution.provider_status,
          can_record_manual: !wrongInstrument,
          provider_blocked: false,
          requires_void: wrongInstrument,
        },
        { status: 402 },
      );
    }

    case "ambiguous":
      if (execution.stage === "claim_pending") {
        // Pending claim means a prior provider attempt may already have moved money.
        return NextResponse.json(
          {
            error:
              "A refund attempt is already open for this payment. Do NOT retry the card refund — check Business Center and record the refund reference if money returned.",
            provider_blocked: true,
            can_record_manual: true,
            refund_transaction_id: execution.refund_transaction_id,
            idempotency_key: execution.idempotency_key,
          },
          { status: 409 },
        );
      }
      if (execution.stage === "record_failed") {
        return NextResponse.json(
          {
            error:
              "Money may have been refunded at the bank, but Oraya could not record it. Do NOT retry the card refund — record the Business Center reference instead.",
            provider_reference: execution.provider_reference,
            provider_blocked: true,
            can_record_manual: true,
            refund_transaction_id: execution.refund_transaction_id,
            idempotency_key: execution.idempotency_key,
          },
          { status: 500 },
        );
      }
      if (execution.stage === "provider_unverified") {
        return NextResponse.json(
          {
            error: execution.message,
            provider_status: execution.provider_status,
            provider_reference: execution.provider_reference,
            correlation_id: execution.correlation_id,
            provider_blocked: true,
            can_record_manual: true,
            refund_transaction_id: execution.refund_transaction_id,
            idempotency_key: execution.idempotency_key,
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        {
          error:
            "Could not confirm the refund with NetCommerce. Do NOT retry — check Business Center and record the refund reference if money returned.",
          provider_blocked: true,
          can_record_manual: true,
          refund_transaction_id: execution.refund_transaction_id,
          idempotency_key: execution.idempotency_key,
        },
        { status: 502 },
      );

    case "provider_not_configured":
      return NextResponse.json(
        { error: "Card refunds are not configured right now.", can_record_manual: true },
        { status: execution.status_code },
      );

    // The checks above already rejected these before the sequence ran; they
    // remain reachable only if the row changed underneath this request.
    case "not_refundable":
      if (execution.reason === "not_found") {
        return NextResponse.json({ error: "That payment no longer exists." }, { status: 404 });
      }
      if (execution.reason === "unsupported_instrument") {
        return NextResponse.json(
          { error: "Only card payments with a NetCommerce reference can use this refund path." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "That payment cannot be refunded." }, { status: 409 });

    case "ledger_unavailable":
      if (execution.reason === "sql_missing") {
        return NextResponse.json(
          {
            error:
              "Refund SQL is not applied yet. Run sql/phase-16b-provider-refund.sql in Supabase, then try again.",
          },
          { status: 503 },
        );
      }
      if (execution.reason === "payment_read_failed") {
        return NextResponse.json({ error: "Could not load that payment." }, { status: 503 });
      }
      if (execution.reason === "prior_refunds_read_failed") {
        return NextResponse.json({ error: "Could not check existing refunds." }, { status: 503 });
      }
      return NextResponse.json({ error: "Could not start the refund safely." }, { status: 500 });
  }
}
