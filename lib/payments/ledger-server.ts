import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptPaymentRequestToken, hashPaymentRequestToken } from "@/lib/payments/ledger-token";
import { isPublicRequestPayable, type PaymentRequestRow } from "@/lib/payments/ledger";

export const PAYMENT_REQUEST_COLUMNS =
  "id, booking_id, member_id, payer_name, payer_email, payer_phone, description, purpose, amount, currency, allowed_methods, status, amount_paid, amount_refunded, expires_at, cancelled_at, created_by, created_at, updated_at, public_token_ciphertext";

export function paymentRequestUrl(origin: string, encryptedToken: string) {
  const secret = process.env.ADMIN_SECRET?.trim();
  const token = secret ? decryptPaymentRequestToken(encryptedToken, secret) : null;
  return token ? `${origin}/pay/${encodeURIComponent(token)}` : null;
}

export async function findPublicPaymentRequest(token: string) {
  if (!token || token.length > 160) return null;
  const { data, error } = await supabaseAdmin
    .from("payment_requests")
    .select(PAYMENT_REQUEST_COLUMNS)
    .eq("public_token_hash", hashPaymentRequestToken(token))
    .maybeSingle();
  if (error) throw new Error(`payment_request_lookup_failed:${error.message}`);
  if (!data) return null;

  const row = data as unknown as PaymentRequestRow;
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
