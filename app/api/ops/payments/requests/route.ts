import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseCreatePaymentRequestInput } from "@/lib/payments/ledger";
import { createPaymentRequestToken, encryptPaymentRequestToken, hashPaymentRequestToken } from "@/lib/payments/ledger-token";
import { expireDuePaymentRequests, PAYMENT_REQUEST_COLUMNS, paymentRequestUrl } from "@/lib/payments/ledger-server";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import { getHostedCheckoutAdminStatus } from "@/lib/payments/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  await expireDuePaymentRequests();

  const [{ data: requests, error: requestError }, { data: transactions, error: transactionError }, checkout] = await Promise.all([
    supabaseAdmin.from("payment_requests").select(PAYMENT_REQUEST_COLUMNS).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("payment_transactions")
      .select("id, payment_request_id, booking_id, transaction_type, status, amount, currency, applied_amount, applied_currency, exchange_rate, method, provider, wallet_presentation, provider_reference, receipt_reference, gross_amount, fee_amount, net_amount, verified_source, effective_at, created_by, reverses_transaction_id, notes, created_at")
      .order("effective_at", { ascending: false }).limit(250),
    getHostedCheckoutAdminStatus(),
  ]);
  if (requestError || transactionError) {
    console.error("[ops/payment-requests] load failed", requestError?.message, transactionError?.message);
    return NextResponse.json({ error: "Could not load the payment ledger." }, { status: 503 });
  }

  const origin = resolvePaymentRequestOrigin(request);
  return NextResponse.json({
    requests: (requests ?? []).map((row) => ({
      ...row,
      public_token_ciphertext: undefined,
      payment_url: paymentRequestUrl(origin, String(row.public_token_ciphertext)),
    })),
    transactions: transactions ?? [],
    checkout: {
      checkout_ready: checkout.checkout_ready && checkout.provider_key === "credit_libanais",
      provider_display_name: checkout.provider_display_name,
      guest_message: checkout.guest_message,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = parseCreatePaymentRequestInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  if (input.allowed_methods.includes("card")) {
    const checkout = await getHostedCheckoutAdminStatus();
    if (!checkout.checkout_ready || checkout.provider_key !== "credit_libanais") {
      return NextResponse.json({ error: "Card payment is not ready yet. Finish NetCommerce setup before adding card to a link." }, { status: 409 });
    }
  }

  if (input.booking_id) {
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, member_id, guest_name, guest_email, guest_phone")
      .eq("id", input.booking_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not verify that booking." }, { status: 503 });
    if (!booking) return NextResponse.json({ error: "That booking no longer exists." }, { status: 404 });
    input.member_id = booking.member_id ?? null;
  } else {
    // Standalone requests do not accept an arbitrary auth-user id from the
    // browser. Member association is derived from a verified booking until a
    // dedicated member picker/ownership check is introduced.
    input.member_id = null;
  }

  const secret = process.env.ADMIN_SECRET!.trim();
  const token = createPaymentRequestToken();
  const { data, error } = await supabaseAdmin.from("payment_requests").insert({
    ...input,
    public_token_hash: hashPaymentRequestToken(token),
    public_token_ciphertext: encryptPaymentRequestToken(token, secret),
    status: "active",
    created_by: auth.staff.id,
  }).select(PAYMENT_REQUEST_COLUMNS).single();
  if (error) {
    console.error("[ops/payment-requests] create failed", error.message);
    return NextResponse.json({ error: "Could not create the payment link." }, { status: 503 });
  }

  const paymentUrl = `${resolvePaymentRequestOrigin(request)}/pay/${encodeURIComponent(token)}`;
  return NextResponse.json({
    ok: true,
    request: { ...data, public_token_ciphertext: undefined, payment_url: paymentUrl },
  }, { status: 201 });
}
