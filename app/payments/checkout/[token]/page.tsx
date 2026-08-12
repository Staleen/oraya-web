"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, use } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import { GOLD, LATO, MIDNIGHT, PLAYFAIR } from "@/components/theme";

/**
 * Brand note (2026-08-12): this page used its own near-miss palette — gold
 * #C9A45C against Oraya's #C5A46D, a flat #141414 background instead of
 * midnight, and a generic `serif` stack instead of Playfair. Close enough to
 * look like a mistake, far enough to read as a different company at the exact
 * moment a guest is deciding whether to type a card number. It now uses the
 * shared tokens.
 */
const WHITE = "#F8F3E7";
const MUTED = "rgba(248, 243, 231, 0.72)";
const BG = MIDNIGHT;
const PANEL = "rgba(255,255,255,0.045)";
const BORDER = "rgba(201,164,92,0.28)";

type SessionState =
  | { status: "loading" }
  | { status: "ready"; bookingViewUrl: string; cancelUrl: string }
  | { status: "processing"; bookingViewUrl: string }
  | { status: "blocked"; message: string; bookingViewUrl: string | null };

type UnifiedCheckoutWindow = Window & {
  Accept?: (captureContext: string) => Promise<{
    dispose?: () => void;
    unifiedPayments: (sidebar?: boolean) => Promise<{
      dispose?: () => void;
      hide?: () => Promise<void>;
      show: (args: {
        containers: {
          paymentSelection: string;
          paymentScreen?: string;
        };
      }) => Promise<string | { transientTokenJwt?: string }>;
    }>;
  }>;
  VAS?: {
    UnifiedCheckout?: (captureContext: string) => Promise<{
      createCheckout: (options?: { autoProcessing?: boolean }) => Promise<{
        mount: (target: string | { paymentSelection: string; paymentScreen?: string }) => Promise<string>;
        destroy?: () => void;
      }>;
    }>;
  };
};

interface SessionResponse {
  ok?: boolean;
  error?: string;
  capture_context?: string;
  client_library?: string;
  client_library_integrity?: string | null;
  return_url?: string;
  cancel_url?: string;
  booking_view_url?: string;
  payment_request_url?: string;
  booking_summary?: {
    villa?: string;
    check_in?: string;
    check_out?: string;
    amount?: number;
    currency?: string;
  };
  payment_summary?: {
    description?: string;
    payer_name?: string;
    amount?: number;
    currency?: string;
  };
}

interface CompleteResponse {
  ok?: boolean;
  paid?: boolean;
  error?: string;
  message?: string;
  booking_view_url?: string;
  payment_request_url?: string;
}

type CheckoutSummary =
  | NonNullable<SessionResponse["booking_summary"]>
  | NonNullable<SessionResponse["payment_summary"]>;

function isPaymentRequestSummary(
  summary: CheckoutSummary,
): summary is NonNullable<SessionResponse["payment_summary"]> {
  return "description" in summary;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return value;
}

function formatMoney(amount?: number, currency?: string) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "-";
  return `${currency ?? "USD"} ${amount.toFixed(2)}`;
}

function hasUnifiedCheckoutClient() {
  const checkoutWindow = window as UnifiedCheckoutWindow;
  return (
    typeof checkoutWindow.Accept === "function" ||
    typeof checkoutWindow.VAS?.UnifiedCheckout === "function"
  );
}

function waitForUnifiedCheckoutClient(timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    function check() {
      if (hasUnifiedCheckoutClient()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("CyberSource payment client did not initialize."));
        return;
      }

      window.setTimeout(check, 100);
    }

    check();
  });
}

function loadScript(src: string, integrity?: string | null) {
  return new Promise<void>((resolve, reject) => {
    const expectedIntegrity = integrity?.trim() ?? "";
    const existing = document.querySelector<HTMLScriptElement>(`script[data-oraya-cybersource="true"]`);
    if (existing) {
      if (hasUnifiedCheckoutClient()) {
        resolve();
        return;
      }
      if (existing.src === src && existing.integrity === expectedIntegrity) {
        existing.addEventListener("load", () => {
          waitForUnifiedCheckoutClient().then(resolve).catch(reject);
        }, { once: true });
        existing.addEventListener("error", () => reject(new Error("CyberSource payment library could not be loaded.")), {
          once: true,
        });
        return;
      }
      existing.remove();
    }
    const script = document.createElement("script");
    script.dataset.orayaCybersource = "true";
    script.async = true;
    script.crossOrigin = "anonymous";
    if (expectedIntegrity) {
      script.setAttribute("integrity", expectedIntegrity);
    }
    script.addEventListener("load", () => {
      waitForUnifiedCheckoutClient().then(resolve).catch(reject);
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("CyberSource payment library could not be loaded.")), {
      once: true,
    });
    script.src = src;
    document.head.appendChild(script);
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function waitForCheckoutContainers() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (
      document.querySelector("#oraya-payment-buttons") &&
      document.querySelector("#oraya-payment-screen")
    ) {
      return;
    }
    await nextFrame();
  }
  throw new Error("CyberSource payment containers were not ready.");
}

function readTransientToken(value: string | { transientTokenJwt?: string }) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (
    typeof value !== "string" &&
    typeof value.transientTokenJwt === "string" &&
    value.transientTokenJwt.trim()
  ) {
    return value.transientTokenJwt.trim();
  }
  throw new Error("CyberSource did not return a transient payment token.");
}

export default function PaymentCheckoutPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ subject?: string | string[] }>;
}) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  const token = params.token;
  const isPaymentRequest = searchParams.subject === "request";
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);

  const bookingViewFallback = useMemo(
    () => isPaymentRequest ? `/pay/${token}` : `/booking/view/${token}`,
    [isPaymentRequest, token],
  );

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function startCheckout() {
      let completionRequestSubmitted = false;
      try {
        const response = await fetch(
          isPaymentRequest
            ? "/api/payments/requests/unified-checkout-session"
            : "/api/payments/unified-checkout-session",
          {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isPaymentRequest
            ? { payment_request_token: token }
            : { booking_token: token }),
        });
        const payload = (await response.json()) as SessionResponse;
        if (!response.ok || !payload.ok) {
          setState({
            status: "blocked",
            message: isPaymentRequest
              ? "Secure card payment is not available for this request right now. Please return to the payment request for another option."
              : "Secure payment is not available for this booking right now. Please return to your booking for the next step.",
            bookingViewUrl: payload.payment_request_url ?? payload.booking_view_url ?? bookingViewFallback,
          });
          return;
        }

        if (
          !payload.capture_context ||
          !payload.client_library ||
          !payload.return_url ||
          !payload.cancel_url
        ) {
          throw new Error("Payment session response was incomplete.");
        }

        setSummary(payload.booking_summary ?? payload.payment_summary ?? null);
        await loadScript(payload.client_library, payload.client_library_integrity);

        const checkoutWindow = window as UnifiedCheckoutWindow;
        if (!checkoutWindow.Accept && !checkoutWindow.VAS?.UnifiedCheckout) {
          throw new Error("CyberSource payment client did not initialize.");
        }

        const bookingViewUrl = payload.booking_view_url ?? payload.payment_request_url ?? bookingViewFallback;
        setState({
          status: "ready",
          bookingViewUrl,
          cancelUrl: payload.cancel_url,
        });
        await waitForCheckoutContainers();
        if (cancelled) return;

        let transientToken: string;
        if (checkoutWindow.Accept) {
          const accept = await checkoutWindow.Accept(payload.capture_context);
          const unifiedPayments = await accept.unifiedPayments(false);
          cleanup = () => {
            void unifiedPayments.hide?.();
            unifiedPayments.dispose?.();
            accept.dispose?.();
          };
          const result = await unifiedPayments.show({
            containers: {
              paymentSelection: "#oraya-payment-buttons",
              paymentScreen: "#oraya-payment-screen",
            },
          });
          transientToken = readTransientToken(result);
        } else {
          const client = await checkoutWindow.VAS!.UnifiedCheckout!(payload.capture_context);
          const checkout = await client.createCheckout({ autoProcessing: false });
          cleanup = checkout.destroy;
          transientToken = await checkout.mount({
            paymentSelection: "#oraya-payment-buttons",
            paymentScreen: "#oraya-payment-screen",
          });
        }
        if (cancelled) return;

        setState({ status: "processing", bookingViewUrl });
        completionRequestSubmitted = true;
        const completionResponse = await fetch(
          isPaymentRequest
            ? "/api/payments/requests/unified-checkout-complete"
            : "/api/payments/unified-checkout-complete",
          {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isPaymentRequest
            ? { payment_request_token: token, transient_token: transientToken }
            : { booking_token: token, transient_token: transientToken }),
        });
        const completion = (await completionResponse.json()) as CompleteResponse;
        if (cancelled) return;

        if (completionResponse.ok && completion.ok && completion.paid) {
          // Booking-linked payment requests prefer the booking view; standalone
          // payment requests land on /pay?payment=success.
          const successUrl =
            completion.booking_view_url ??
            completion.payment_request_url ??
            payload.return_url ??
            bookingViewUrl;
          if (typeof successUrl === "string" && successUrl.trim()) {
            window.location.assign(successUrl);
            return;
          }
          setState({
            status: "blocked",
            message: "Payment was received. Return below to view your confirmation.",
            bookingViewUrl,
          });
          return;
        }

        setState({
          status: "blocked",
          message:
            typeof completion.message === "string" && completion.message.trim()
              ? completion.message.trim()
              : "We could not confirm the payment outcome. Do NOT retry or pay again; please contact Oraya.",
          bookingViewUrl: completion.booking_view_url ?? completion.payment_request_url ?? bookingViewUrl,
        });
      } catch {
        console.error("[payments/checkout] secure checkout failed.");
        setState({
          status: "blocked",
          message: completionRequestSubmitted
            ? "We could not confirm the payment outcome. Do NOT retry or pay again; Oraya must verify it first."
            : "Secure payment could not be started. No charge was submitted. Please return to your booking and try again.",
          bookingViewUrl: bookingViewFallback,
        });
      }
    }

    startCheckout();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [bookingViewFallback, isPaymentRequest, token]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: BG,
        color: WHITE,
        padding: "32px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <section style={{ width: "100%", maxWidth: "760px" }}>
        <div style={{ marginBottom: "18px" }}>
          <OrayaEmblem style={{ width: "48px", height: "auto", display: "block" }} />
        </div>
        <p style={{ color: GOLD, fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 12px" }}>
          Oraya
        </p>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 400, margin: "0 0 14px" }}>
          Secure payment
        </h1>
        <p style={{ color: MUTED, fontFamily: LATO, fontSize: "15px", lineHeight: 1.7, maxWidth: "620px", margin: "0 0 28px" }}>
          Your card details are entered inside your bank&rsquo;s own secure interface — Oraya never sees them, and records your payment only once the bank confirms it.
        </p>
        {/*
          The acquirer's trust mark stays — Credit Libanais / NetCommerce
          require it to be shown — but it belongs at the bottom as a quiet
          reassurance, not at the top as the page's identity. A guest arriving
          from an Oraya link should see Oraya first.
        */}

        {summary ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
              border: `1px solid ${BORDER}`,
              background: PANEL,
              padding: "16px",
              marginBottom: "18px",
            }}
          >
            {isPaymentRequestSummary(summary) ? <>
              <Summary label="Payment for" value={summary.description ?? "Oraya payment"} />
              <Summary label="Prepared for" value={summary.payer_name ?? "Guest"} />
            </> : <>
              <Summary label="Villa" value={summary.villa ?? "-"} />
              <Summary label="Check-in" value={formatDate(summary.check_in)} />
              <Summary label="Check-out" value={formatDate(summary.check_out)} />
            </>}
            <Summary label="Payment" value={formatMoney(summary.amount, summary.currency)} />
          </div>
        ) : null}

        <div style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "18px", minHeight: "260px" }}>
          {state.status === "loading" ? (
            <p style={{ color: MUTED, margin: 0 }}>Preparing secure payment...</p>
          ) : state.status === "processing" ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <p style={{ color: WHITE, lineHeight: 1.7, margin: 0 }}>
                Verifying payment with the gateway...
              </p>
              <a href={state.bookingViewUrl} style={{ ...buttonStyle, background: "transparent", color: GOLD, border: `1px solid ${GOLD}` }}>
                {isPaymentRequest ? "Return to payment request" : "Return to booking"}
              </a>
            </div>
          ) : state.status === "blocked" ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <p style={{ color: WHITE, lineHeight: 1.7, margin: 0 }}>{state.message}</p>
              <a href={state.bookingViewUrl ?? bookingViewFallback} style={buttonStyle}>
                {state.message.toLowerCase().includes("payment was received")
                  ? isPaymentRequest
                    ? "View payment confirmation"
                    : "View your booking"
                  : isPaymentRequest
                    ? "Return to payment request"
                    : "Return to booking"}
              </a>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              <div id="oraya-payment-buttons" />
              <div id="oraya-payment-screen" />
              <a href={state.cancelUrl} style={{ ...buttonStyle, background: "transparent", color: GOLD, border: `1px solid ${GOLD}` }}>
                Cancel payment
              </a>
            </div>
          )}
        </div>

        {/* Acquirer trust mark — required, and correctly placed last. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "28px",
            paddingTop: "18px",
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <Image
            src="/payment/NCseal_M.png"
            alt="NetCommerce Security Seal"
            width={130}
            height={72}
            style={{ width: "84px", height: "auto", display: "block", opacity: 0.75 }}
          />
          <span style={{ color: MUTED, fontFamily: LATO, fontSize: "12px", lineHeight: 1.5 }}>
            Payments processed securely by Credit Libanais / NetCommerce.
          </span>
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: MUTED, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px" }}>
        {label}
      </p>
      <p style={{ color: WHITE, fontSize: "14px", margin: 0 }}>{value}</p>
    </div>
  );
}

const buttonStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  width: "fit-content",
  minHeight: "44px",
  padding: "0 18px",
  background: GOLD,
  color: "#141414",
  textDecoration: "none",
  textTransform: "uppercase" as const,
  letterSpacing: "1.8px",
  fontSize: "11px",
};
