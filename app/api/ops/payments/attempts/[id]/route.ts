import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabasePaymentAttemptStore } from "@/lib/payments/payment-attempts-store";
import type { PaymentAttemptStatus } from "@/lib/payments/unified-checkout-completion";

type AttemptRow = {
  id: string;
  status: PaymentAttemptStatus;
  payment_request_id: string | null;
  booking_id: string | null;
  amount: number;
  currency: string;
  provider_transaction_id: string | null;
  provider_reference: string | null;
  idempotency_key: string;
};

/**
 * Owner reconciliation for stuck card attempts.
 * - mark_failed: Business Center shows no successful charge → unblock retry
 * - mark_cleared: charge exists in BC and Oraya already has a matching receipt → clear blocker
 *
 * Never invents a ledger payment. Never retries the gateway.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = body.action === "mark_failed" || body.action === "mark_cleared" ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (reason.length < 8) {
    return NextResponse.json(
      { error: "Add a short note (what you saw in Business Center)." },
      { status: 400 },
    );
  }

  const { data: attempt, error: loadError } = await supabaseAdmin
    .from("payment_attempts")
    .select(
      "id, status, payment_request_id, booking_id, amount, currency, provider_transaction_id, provider_reference, idempotency_key",
    )
    .eq("id", id)
    .maybeSingle<AttemptRow>();
  if (loadError) {
    console.error("[ops/payment-attempts] load failed", loadError.message);
    return NextResponse.json({ error: "Could not load that payment attempt." }, { status: 503 });
  }
  if (!attempt) {
    return NextResponse.json({ error: "That payment attempt no longer exists." }, { status: 404 });
  }
  if (!["claimed", "authorized", "ambiguous"].includes(attempt.status)) {
    return NextResponse.json({ error: "That attempt is already finished." }, { status: 409 });
  }

  const expectedStatuses = [attempt.status] as PaymentAttemptStatus[];

  if (action === "mark_failed") {
    const transitioned = await supabasePaymentAttemptStore.transitionAttempt(attempt.id, expectedStatuses, {
      status: "failed",
      provider_reference: attempt.provider_reference,
      provider_transaction_id: attempt.provider_transaction_id,
    });
    if (!transitioned.ok) {
      return NextResponse.json(
        { error: "Could not mark that attempt as no charge. Refresh and try again." },
        { status: transitioned.reason === "conflict" ? 409 : 500 },
      );
    }
    console.info("[ops/payment-attempts] marked failed by owner", {
      attempt_id: attempt.id,
      staff_id: auth.staff.id,
      reason,
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // mark_cleared — require an existing confirmed payment on the same request/booking.
  let matchQuery = supabaseAdmin
    .from("payment_transactions")
    .select("id, provider_reference, amount, status")
    .eq("transaction_type", "payment")
    .in("status", ["confirmed", "refunded", "reversed"]);

  if (attempt.payment_request_id) {
    matchQuery = matchQuery.eq("payment_request_id", attempt.payment_request_id);
  } else if (attempt.booking_id) {
    matchQuery = matchQuery.eq("booking_id", attempt.booking_id);
  } else {
    return NextResponse.json(
      { error: "This attempt is not linked to a payment link or booking, so it cannot be cleared here." },
      { status: 409 },
    );
  }

  const { data: payments, error: payError } = await matchQuery;
  if (payError) {
    console.error("[ops/payment-attempts] receipt match failed", payError.message);
    return NextResponse.json({ error: "Could not check existing receipts." }, { status: 503 });
  }

  const providerIds = [
    attempt.provider_transaction_id,
    attempt.provider_reference,
    attempt.idempotency_key,
  ].filter((value): value is string => Boolean(value?.trim()));

  const matched = (payments ?? []).find((payment) => {
    const ref = payment.provider_reference?.trim() ?? "";
    if (ref && providerIds.some((idPart) => ref === idPart || ref.includes(idPart) || idPart.includes(ref))) {
      return true;
    }
    return Math.abs(Number(payment.amount) - Number(attempt.amount)) < 0.001;
  });

  if (!matched) {
    return NextResponse.json(
      {
        error:
          "Oraya has no matching card receipt yet. If Business Center shows a successful charge, keep the attempt open and use Refund card / support — do not mark it cleared.",
      },
      { status: 409 },
    );
  }

  const transitioned = await supabasePaymentAttemptStore.transitionAttempt(attempt.id, expectedStatuses, {
    status: "recorded",
    provider_reference: attempt.provider_reference ?? matched.provider_reference,
    provider_transaction_id: attempt.provider_transaction_id ?? matched.provider_reference,
  });
  if (!transitioned.ok) {
    return NextResponse.json(
      { error: "Could not clear that attempt. Refresh and try again." },
      { status: transitioned.reason === "conflict" ? 409 : 500 },
    );
  }
  console.info("[ops/payment-attempts] marked cleared by owner", {
    attempt_id: attempt.id,
    payment_transaction_id: matched.id,
    staff_id: auth.staff.id,
    reason,
  });
  return NextResponse.json({ ok: true, status: "recorded", payment_transaction_id: matched.id });
}
