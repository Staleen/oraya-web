import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  authorizeCreditLibanaisTransientToken,
  getCreditLibanaisReadiness,
} from "@/lib/payments/credit-libanais";
import {
  findPaymentRequestByPublicToken,
  recordProviderPayment,
} from "@/lib/payments/ledger-server";
import { isPublicRequestPayable, remainingRequestAmount } from "@/lib/payments/ledger";
import { notifyMoneyEvent } from "@/lib/payments/money-event-dispatch-server";
import { maybeInstantConfirmBooking } from "@/lib/bookings/instant-confirm-server";
import {
  buildPaymentRequestSuccessUrl,
  mintBookingPaymentSuccessUrl,
} from "@/lib/payments/payment-success-redirect";
import { reapExpiredStepUpAttempts, supabasePaymentAttemptStore } from "@/lib/payments/payment-attempts-store";
import { buildStepUpReturnUrl, stepUpDeadlineIso } from "@/lib/payments/step-up";
import { resolveStepUpResume } from "@/lib/payments/step-up-resume";
import { PAYER_AUTHENTICATION_CHALLENGE_MESSAGE } from "@/lib/payments/payer-authentication";
import {
  deriveMerchantReference,
  runUnifiedCheckoutCompletion,
} from "@/lib/payments/unified-checkout-completion";
import { PaymentProviderConfigurationError } from "@/lib/payments/provider";
import { resolvePaymentRequestOrigin } from "@/lib/payments/request-origin";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function resolvePaymentRequestSuccessUrls(origin: string, token: string, bookingId: string | null) {
  const paymentRequestUrl = buildPaymentRequestSuccessUrl(origin, token);
  if (!bookingId) {
    return { payment_request_url: paymentRequestUrl, booking_view_url: null as string | null };
  }
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("check_out")
    .eq("id", bookingId)
    .maybeSingle();
  const bookingViewUrl = mintBookingPaymentSuccessUrl({
    origin,
    booking_id: bookingId,
    check_out: typeof booking?.check_out === "string" ? booking.check_out : null,
  });
  return {
    payment_request_url: paymentRequestUrl,
    booking_view_url: bookingViewUrl,
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readTransientToken(body: Record<string, unknown>) {
  const direct = readString(body.transient_token);
  if (direct) return direct;
  const result = body.unified_checkout_result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? readString((result as Record<string, unknown>).transientTokenJwt)
    : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const token = readString(body.payment_request_token);
    const transientToken = readTransientToken(body);
    // The browser may ASK to resume a challenge; Oraya decides whether there is one.
    const wantsStepUpResume = body.resume_step_up === true;
    if (!token) return NextResponse.json({ error: "payment_request_token is required." }, { status: 400 });
    if (!transientToken) return NextResponse.json({ error: "transient_token is required." }, { status: 400 });

    const payment = await findPaymentRequestByPublicToken(token);
    if (!payment) return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
    const origin = resolvePaymentRequestOrigin(request);
    const requestUrl = `${origin}/pay/${encodeURIComponent(token)}`;
    if (payment.status === "paid") {
      const successUrls = await resolvePaymentRequestSuccessUrls(origin, token, payment.booking_id);
      return NextResponse.json({
        ok: true,
        paid: true,
        idempotent: true,
        payment_request_url: successUrls.payment_request_url,
        ...(successUrls.booking_view_url ? { booking_view_url: successUrls.booking_view_url } : {}),
      });
    }
    if (!isPublicRequestPayable(payment)) {
      return NextResponse.json({ error: "This payment request is no longer payable." }, { status: 409 });
    }
    if (!payment.allowed_methods.includes("card")) {
      return NextResponse.json({ error: "Card payment is not enabled for this request." }, { status: 400 });
    }
    if (payment.payment_provider !== "credit_libanais") {
      return NextResponse.json({ error: "This payment request is not configured for NetCommerce checkout." }, { status: 400 });
    }
    if (!payment.payment_provider_session_id?.startsWith("oraya_")) {
      return NextResponse.json({ error: "Payment session is not ready. Refresh and try again." }, { status: 400 });
    }

    const readiness = await getCreditLibanaisReadiness();
    if (!readiness.checkout_ready) throw new PaymentProviderConfigurationError(readiness.admin_message);
    const amount = remainingRequestAmount(Number(payment.amount), Number(payment.amount_paid));
    if (amount <= 0) return NextResponse.json({ error: "This payment request has already been paid." }, { status: 409 });

    // W7 slice 5 — resume the parked challenge, or start a fresh payment. The
    // attempt id and the authentication id come from Oraya's rows, never the body.
    const resume = await resolveStepUpResume(wantsStepUpResume, {
      booking_id: payment.booking_id,
      payment_request_id: payment.id,
    });
    const attemptId = resume?.attempt_id ?? crypto.randomUUID();
    const merchantReference = deriveMerchantReference(attemptId);
    const providerSessionId = payment.payment_provider_session_id;
    const walletPresentation =
      payment.allowed_methods.includes("apple_pay") && !payment.allowed_methods.includes("card")
        ? "apple_pay" as const
        : null;
    const outcome = await runUnifiedCheckoutCompletion(
      {
        store: supabasePaymentAttemptStore,
        authorize: (reference) => authorizeCreditLibanaisTransientToken({
          booking_id: payment.booking_id ?? payment.id,
          provider_session_id: providerSessionId,
          transient_token: transientToken,
          amount_due: amount,
          currency: payment.currency,
          guest_name: payment.payer_name,
          guest_email: payment.payer_email,
          merchant_reference: reference,
          // Call 2 when resuming, call 1 otherwise. DECISION_SKIP rides on both.
          payer_authentication_phase: resume ? "validation" : "enrolment",
          authentication_transaction_id: resume?.authentication_transaction_id ?? null,
          step_up_return_url: resume
            ? null
            : buildStepUpReturnUrl(origin, attemptId, process.env.ADMIN_SECRET ?? ""),
        }),
        recordApprovedPayment: async (provider) => {
          const recorded = await recordProviderPayment({
            payment_request_id: payment.id,
            amount,
            currency: payment.currency,
            provider_reference: provider.reference,
            idempotency_key: merchantReference,
            wallet_presentation: walletPresentation,
          });
          return recorded.ok ? { ok: true as const, matched: 1 } : { ok: false as const };
        },
        touchDeclined: async () => {
          const { error } = await supabaseAdmin.from("payment_requests")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", payment.id)
            .eq("payment_provider_session_id", providerSessionId);
          if (error) console.error("[payment-request/complete] decline touch failed", error.message);
        },
        stepUpDeadlineIso,
        releaseExpiredStepUps: () => reapExpiredStepUpAttempts(),
        log: (message, detail) => console.error(`[payment-request/complete] ${message}`, detail ?? {}),
      },
      {
        attempt_id: attemptId,
        booking_id: payment.booking_id,
        payment_request_id: payment.id,
        provider_session_id: providerSessionId,
        amount,
        currency: payment.currency,
        resume_step_up: resume
          ? { authentication_transaction_id: resume.authentication_transaction_id }
          : null,
      },
    );

    switch (outcome.kind) {
      // W7 slice 5. The access token reaches the browser because the protocol
      // requires it; it is never logged, stored or placed in a URL. The
      // authentication id stays on the attempt row. Nothing is authorized yet.
      case "step_up_required":
        return NextResponse.json(
          {
            ok: false,
            paid: false,
            step_up: { url: outcome.step_up.url, access_token: outcome.step_up.accessToken },
            message: "Your bank needs to verify this payment.",
          },
          { status: 200 },
        );
      case "step_up_expired":
        return NextResponse.json(
          {
            ok: false,
            paid: false,
            message:
              "The verification window closed before your bank's answer reached us. Nothing was charged — please start the payment again.",
          },
          { status: 409 },
        );
      case "store_unavailable":
        return NextResponse.json({ error: "Secure payment is temporarily unavailable." }, { status: 503 });
      case "store_error":
        return NextResponse.json({ error: "Payment could not be started safely. No charge was made." }, { status: 500 });
      case "already_processing":
        return NextResponse.json({ error: "This payment is already being processed. Please wait." }, { status: 409 });
      case "blocked_ambiguous":
        return NextResponse.json({
          error: "A previous payment needs review. Do NOT retry or pay again; please contact Oraya.",
        }, { status: 409 });
      case "declined":
        return NextResponse.json({
          ok: false,
          paid: false,
          // See the booking route: a bank asking to verify the guest is not a
          // declined card, even though both release the claim for a retry.
          message: outcome.provider.challenge_required
            ? PAYER_AUTHENTICATION_CHALLENGE_MESSAGE
            : "Payment was not approved. No payment was recorded. You may try again or contact Oraya.",
          payment_request_url: `${requestUrl}?payment=failed`,
        }, { status: outcome.provider.ok ? 402 : 502 });
      case "provider_unknown":
        return NextResponse.json({
          ok: false,
          paid: false,
          message: "We could not confirm the outcome. Do NOT retry or pay again; Oraya will verify it.",
        }, { status: 502 });
      case "approved_unrecorded":
        return NextResponse.json({
          ok: false,
          paid: false,
          message: "Payment was approved but needs reconciliation. Do NOT retry or pay again; Oraya will confirm it.",
        }, { status: 500 });
      case "already_recorded":
      case "approved_recorded": {
        // M2: one money event — guest receipt + operator alert, at most once
        // per payment, including when the webhook observed the same money.
        // Works with no booking attached; never fails the payment.
        await notifyMoneyEvent({
          outcome: "recorded",
          source: "payment_link",
          amount,
          currency: payment.currency,
          method: "card",
          booking_id: payment.booking_id,
          payment_request_id: payment.id,
          provider_transaction_id: outcome.provider?.reference ?? null,
        });
        await maybeInstantConfirmBooking(payment.booking_id);
        const successUrls = await resolvePaymentRequestSuccessUrls(origin, token, payment.booking_id);
        return NextResponse.json({
          ok: true,
          paid: true,
          idempotent: outcome.kind === "already_recorded",
          reference: outcome.provider?.reference,
          payment_request_url: successUrls.payment_request_url,
          ...(successUrls.booking_view_url ? { booking_view_url: successUrls.booking_view_url } : {}),
        });
      }
    }
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) {
      console.error("[payment-request/complete] configuration error", error.message);
      return NextResponse.json({ error: "Payment could not be verified. No payment was recorded." }, { status: error.statusCode });
    }
    console.error("[payment-request/complete] unexpected error", error);
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 500 });
  }
}
