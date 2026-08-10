import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptPaymentRequestToken, hashPaymentRequestToken } from "@/lib/payments/ledger-token";
import { isPublicRequestPayable, type PaymentRequestRow } from "@/lib/payments/ledger";

export const PAYMENT_REQUEST_COLUMNS =
  "id, booking_id, member_id, payer_name, payer_email, payer_phone, description, purpose, amount, currency, allowed_methods, status, amount_paid, amount_refunded, expires_at, cancelled_at, created_by, created_at, updated_at, public_token_ciphertext, payment_provider, payment_provider_session_id, checkout_started_at";

export function paymentRequestUrl(origin: string, encryptedToken: string) {
  const secret = process.env.ADMIN_SECRET?.trim();
  const token = secret ? decryptPaymentRequestToken(encryptedToken, secret) : null;
  return token ? `${origin}/pay/${encodeURIComponent(token)}` : null;
}

export async function expireDuePaymentRequests() {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("payment_requests")
    .update({ status: "expired", updated_at: now })
    .in("status", ["active", "partially_paid"])
    .lt("expires_at", now);
  if (error) console.error("[payment-requests] expiry projection failed", error.message);
}

export async function findPaymentRequestByPublicToken(token: string) {
  if (!token || token.length > 160) return null;
  const { data, error } = await supabaseAdmin
    .from("payment_requests")
    .select(PAYMENT_REQUEST_COLUMNS)
    .eq("public_token_hash", hashPaymentRequestToken(token))
    .maybeSingle();
  if (error) throw new Error(`payment_request_lookup_failed:${error.message}`);
  if (!data) return null;

  const row = data as unknown as PaymentRequestRow;
  if (
    row.expires_at && Date.parse(row.expires_at) <= Date.now() &&
    (row.status === "active" || row.status === "partially_paid")
  ) {
    const now = new Date().toISOString();
    const { data: expired } = await supabaseAdmin.from("payment_requests")
      .update({ status: "expired", updated_at: now })
      .eq("id", row.id)
      .in("status", ["active", "partially_paid"])
      .select("id")
      .maybeSingle();
    if (expired) row.status = "expired";
  }
  return row;
}

export async function findPublicPaymentRequest(token: string) {
  const row = await findPaymentRequestByPublicToken(token);
  if (!row) return null;
  return {
    id: row.id,
    payer_name: row.payer_name,
    description: row.description,
    purpose: row.purpose,
    amount: Number(row.amount),
    currency: row.currency,
    amount_paid: Number(row.amount_paid),
    amount_refunded: Number(row.amount_refunded),
    allowed_methods: row.allowed_methods,
    status: row.status,
    expires_at: row.expires_at,
    payable: isPublicRequestPayable(row),
  };
}

export async function recordProviderPayment(input: {
  payment_request_id: string;
  amount: number;
  currency: "USD" | "LBP";
  provider_reference: string;
  idempotency_key: string;
  effective_at?: string;
  wallet_presentation?: "apple_pay" | "google_pay" | null;
}) {
  const { data, error } = await supabaseAdmin.rpc("oraya_record_provider_payment", {
    p_request_id: input.payment_request_id,
    p_amount: input.amount,
    p_currency: input.currency,
    p_provider_reference: input.provider_reference,
    p_effective_at: input.effective_at ?? new Date().toISOString(),
    p_idempotency_key: input.idempotency_key,
    p_wallet_presentation: input.wallet_presentation ?? null,
  });
  if (error) {
    console.error("[payment-requests] provider payment projection failed", {
      payment_request_id: input.payment_request_id,
      code: error.code,
      message: error.message,
    });
    return { ok: false as const };
  }
  const result = Array.isArray(data) ? data[0] : data;
  return result?.transaction_id
    ? { ok: true as const, result }
    : { ok: false as const };
}

export async function recordProviderRefund(input: {
  payment_transaction_id: string;
  amount: number;
  provider_reference: string;
  idempotency_key: string;
  staff_id: string | null;
  notes?: string | null;
  verified_source?: "provider" | "operator";
}) {
  const { data, error } = await supabaseAdmin.rpc("oraya_record_provider_refund", {
    p_payment_transaction_id: input.payment_transaction_id,
    p_amount: input.amount,
    p_provider_reference: input.provider_reference,
    p_idempotency_key: input.idempotency_key,
    p_staff_id: input.staff_id,
    p_notes: input.notes ?? null,
    p_verified_source: input.verified_source ?? "provider",
  });
  if (error) {
    console.error("[payment-requests] provider refund projection failed", {
      payment_transaction_id: input.payment_transaction_id,
      code: error.code,
      message: error.message,
    });
    return { ok: false as const, error: error.message };
  }
  const result = Array.isArray(data) ? data[0] : data;
  return result?.refund_transaction_id
    ? { ok: true as const, result }
    : { ok: false as const, error: "refund_not_recorded" };
}
