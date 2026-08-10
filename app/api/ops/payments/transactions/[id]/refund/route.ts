import crypto from "crypto";
import { NextResponse } from "next/server";
import { refundCreditLibanaisPayment } from "@/lib/payments/credit-libanais";
import { recordProviderRefund } from "@/lib/payments/ledger-server";
import {
  remainingRefundableAmount,
  validateRefundAmount,
} from "@/lib/payments/provider-refund";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
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
 * Easy card refund:
 * - mode "provider" (default): Oraya calls CyberSource refund, then records the ledger.
 * - mode "record": money already returned in Business Center; only record with BC reference.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  let body: {
    amount?: unknown;
    mode?: unknown;
    provider_reference?: unknown;
    notes?: unknown;
    idempotency_key?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const mode = body.mode === "record" ? "record" : "provider";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 120)
      : `oraya-refund-${crypto.randomUUID()}`;

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
  if (txn.transaction_type !== "payment" || !["confirmed", "refunded"].includes(txn.status)) {
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
    .select("amount")
    .eq("reverses_transaction_id", txn.id)
    .eq("transaction_type", "refund")
    .eq("status", "confirmed");
  if (priorError) {
    console.error("[ops/payments/refund] prior refunds failed", priorError.message);
    return NextResponse.json({ error: "Could not check existing refunds." }, { status: 503 });
  }
  const alreadyRefunded = roundMoney(
    (priorRefunds ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const remaining = remainingRefundableAmount({
    payment_amount: Number(txn.amount),
    already_refunded: alreadyRefunded,
  });
  if (remaining <= 0) {
    return NextResponse.json({ error: "This payment is already fully refunded." }, { status: 409 });
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

  let providerReference = "";
  let verifiedSource: "provider" | "operator" = "provider";

  if (mode === "record") {
    providerReference =
      typeof body.provider_reference === "string" ? body.provider_reference.trim() : "";
    if (!providerReference) {
      return NextResponse.json(
        { error: "Paste the Business Center refund reference to record an already-completed refund." },
        { status: 400 },
      );
    }
    verifiedSource = "operator";
  } else {
    try {
      const refund = await refundCreditLibanaisPayment({
        payment_id: txn.provider_reference,
        amount: amountCheck.amount,
        currency: txn.currency,
        merchant_reference: idempotencyKey,
      });
      if (!refund.ok) {
        return NextResponse.json(
          {
            error:
              refund.message ||
              "NetCommerce did not accept the refund. You can still refund in Business Center and record it here.",
            provider_status: refund.status,
            can_record_manual: true,
          },
          { status: 502 },
        );
      }
      providerReference = refund.reference;
      verifiedSource = "provider";
    } catch (error) {
      if (error instanceof PaymentProviderConfigurationError) {
        return NextResponse.json(
          { error: "Card refunds are not configured right now.", can_record_manual: true },
          { status: error.statusCode },
        );
      }
      console.error("[ops/payments/refund] provider call failed", error);
      return NextResponse.json(
        {
          error: "Could not reach NetCommerce to refund. Try again, or refund in Business Center and record it.",
          can_record_manual: true,
        },
        { status: 502 },
      );
    }
  }

  const recorded = await recordProviderRefund({
    payment_transaction_id: txn.id,
    amount: amountCheck.amount,
    provider_reference: providerReference,
    idempotency_key: idempotencyKey,
    staff_id: auth.staff.id,
    notes: notes || (mode === "provider" ? "Card refund via Oraya / NetCommerce" : "Recorded Business Center refund"),
    verified_source: verifiedSource,
  });
  if (!recorded.ok) {
    const msg = recorded.error ?? "";
    if (msg.includes("refund_exceeds_payment")) {
      return NextResponse.json({ error: "This payment is already fully refunded." }, { status: 409 });
    }
    if (msg.includes("idempotency_conflict")) {
      return NextResponse.json({ error: "That refund request conflicts with an earlier one." }, { status: 409 });
    }
    // Provider refund may have succeeded — do not invite a second provider attempt.
    return NextResponse.json(
      {
        error:
          mode === "provider"
            ? "Money may have been refunded at the bank, but Oraya could not record it. Do NOT retry the card refund — record the Business Center reference instead."
            : "Could not record that refund.",
        provider_reference: providerReference,
        can_record_manual: mode === "provider",
      },
      { status: 500 },
    );
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
