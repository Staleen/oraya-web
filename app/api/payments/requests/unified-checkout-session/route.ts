import { NextResponse } from "next/server";
import {
  createCreditLibanaisUnifiedCheckoutSession,
  getCreditLibanaisPaymentCapabilities,
} from "@/lib/payments/credit-libanais";
import { findPaymentRequestByPublicToken } from "@/lib/payments/ledger-server";
import { isPublicRequestPayable, remainingRequestAmount } from "@/lib/payments/ledger";
import { PaymentProviderConfigurationError, type PaymentLinkPurpose } from "@/lib/payments/provider";
import { getHostedCheckoutProviderByKey } from "@/lib/payments/runtime";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import { supabaseAdmin } from "@/lib/supabase-admin";

function readToken(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function providerPurpose(value: string): PaymentLinkPurpose {
  if (value === "deposit" || value === "balance" || value === "full") return value;
  return "full";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const token = readToken(body.payment_request_token);
    if (!token) return NextResponse.json({ error: "payment_request_token is required." }, { status: 400 });

    const payment = await findPaymentRequestByPublicToken(token);
    if (!payment) return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
    if (!isPublicRequestPayable(payment)) {
      return NextResponse.json({ error: "This payment request is no longer payable." }, { status: 409 });
    }
    const capabilities = getCreditLibanaisPaymentCapabilities();
    const allowedOnlineMethods: Array<"card" | "apple_pay"> = [];
    if (payment.allowed_methods.includes("card")) allowedOnlineMethods.push("card");
    if (payment.allowed_methods.includes("apple_pay") && capabilities.apple_pay_enabled) {
      allowedOnlineMethods.push("apple_pay");
    }
    if (allowedOnlineMethods.length === 0) {
      return NextResponse.json({ error: "Online payment is not enabled for this request." }, { status: 400 });
    }

    const provider = getHostedCheckoutProviderByKey("credit_libanais");
    const readiness = await provider?.getReadiness();
    if (!provider || !readiness?.checkout_ready) {
      throw new PaymentProviderConfigurationError(
        readiness?.admin_message ?? "Credit Libanais / NetCommerce checkout is not ready.",
      );
    }

    const amount = remainingRequestAmount(Number(payment.amount), Number(payment.amount_paid));
    if (amount <= 0) {
      return NextResponse.json({ error: "This payment request has already been paid." }, { status: 409 });
    }

    const origin = resolvePaymentRequestOrigin(request);
    const encodedToken = encodeURIComponent(token);
    const paymentPageUrl = `${origin}/payments/checkout/${encodedToken}?subject=request`;
    const requestUrl = `${origin}/pay/${encodedToken}`;
    const session = await createCreditLibanaisUnifiedCheckoutSession({
      booking_id: payment.booking_id ?? payment.id,
      amount_due: amount,
      currency: payment.currency,
      purpose: providerPurpose(payment.purpose),
      return_url: `${requestUrl}?payment=success`,
      cancel_url: `${requestUrl}?payment=cancelled`,
      payment_page_url: paymentPageUrl,
      expires_at: payment.expires_at ?? undefined,
      allowed_payment_methods: allowedOnlineMethods,
    });

    const now = new Date().toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("payment_requests")
      .update({
        payment_provider: "credit_libanais",
        payment_provider_session_id: session.provider_session_id,
        checkout_started_at: now,
        updated_at: now,
      })
      .eq("id", payment.id)
      .in("status", ["active", "partially_paid"])
      .overlaps("allowed_methods", allowedOnlineMethods)
      .select("id");
    if (error) {
      console.error("[payment-request/session] provider session persistence failed", error.message);
      return NextResponse.json({ error: "Payment session could not be saved." }, { status: 500 });
    }
    if ((rows?.length ?? 0) !== 1) {
      console.error("[payment-request/session] orphaned provider session", {
        payment_request_id: payment.id,
        provider_session_id: session.provider_session_id,
      });
      return NextResponse.json({ error: "This payment request changed. Refresh it before paying." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      capture_context: session.capture_context,
      client_library: session.client_library,
      client_library_integrity: session.client_library_integrity,
      return_url: `${requestUrl}?payment=success`,
      cancel_url: `${requestUrl}?payment=cancelled`,
      payment_request_url: requestUrl,
      payment_summary: {
        description: payment.description,
        payer_name: payment.payer_name,
        amount,
        currency: payment.currency,
      },
    });
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      console.error("[payment-request/session] configuration error", error.message);
      return NextResponse.json({ error: "Secure card payment is not available right now." }, { status: error.statusCode });
    }
    console.error("[payment-request/session] unexpected error", error);
    return NextResponse.json({ error: "Payment session could not be created." }, { status: 500 });
  }
}
