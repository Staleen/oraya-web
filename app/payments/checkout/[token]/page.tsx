"use client";

import { useEffect, useMemo, useState } from "react";

const GOLD = "#C9A45C";
const WHITE = "#F8F3E7";
const MUTED = "rgba(248, 243, 231, 0.72)";
const BG = "#141414";
const PANEL = "rgba(255,255,255,0.045)";
const BORDER = "rgba(201,164,92,0.28)";

type SessionState =
  | { status: "loading" }
  | { status: "ready"; bookingViewUrl: string; cancelUrl: string }
  | { status: "processing"; bookingViewUrl: string }
  | { status: "blocked"; message: string; bookingViewUrl: string | null };

type UnifiedCheckoutWindow = Window & {
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
  booking_summary?: {
    villa?: string;
    check_in?: string;
    check_out?: string;
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
}

function formatDate(value?: string) {
  if (!value) return "-";
  return value;
}

function formatMoney(amount?: number, currency?: string) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "-";
  return `${currency ?? "USD"} ${amount.toFixed(2)}`;
}

function loadScript(src: string, integrity?: string | null) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-oraya-cybersource="true"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    if (integrity) {
      script.integrity = integrity;
    }
    script.crossOrigin = "anonymous";
    script.async = true;
    script.dataset.orayaCybersource = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("CyberSource payment library could not be loaded.")), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

export default function PaymentCheckoutPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [summary, setSummary] = useState<SessionResponse["booking_summary"] | null>(null);

  const bookingViewFallback = useMemo(() => `/booking/view/${token}`, [token]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function startCheckout() {
      try {
        const response = await fetch("/api/payments/unified-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ booking_token: token }),
        });
        const payload = (await response.json()) as SessionResponse;
        if (!response.ok || !payload.ok) {
          setState({
            status: "blocked",
            message: payload.error || "Secure payment is not available for this booking right now.",
            bookingViewUrl: payload.booking_view_url ?? bookingViewFallback,
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

        setSummary(payload.booking_summary ?? null);
        await loadScript(payload.client_library, payload.client_library_integrity);

        const checkoutWindow = window as UnifiedCheckoutWindow;
        if (!checkoutWindow.VAS?.UnifiedCheckout) {
          throw new Error("CyberSource payment client did not initialize.");
        }

        const client = await checkoutWindow.VAS.UnifiedCheckout(payload.capture_context);
        const checkout = await client.createCheckout({ autoProcessing: false });
        cleanup = checkout.destroy;
        if (cancelled) return;

        const bookingViewUrl = payload.booking_view_url ?? bookingViewFallback;
        setState({
          status: "ready",
          bookingViewUrl,
          cancelUrl: payload.cancel_url,
        });
        const transientToken = await checkout.mount({
          paymentSelection: "#oraya-payment-buttons",
          paymentScreen: "#oraya-payment-screen",
        });
        if (cancelled) return;

        setState({ status: "processing", bookingViewUrl });
        const completionResponse = await fetch("/api/payments/unified-checkout-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_token: token,
            transient_token: transientToken,
          }),
        });
        const completion = (await completionResponse.json()) as CompleteResponse;
        if (cancelled) return;

        if (completionResponse.ok && completion.ok && completion.paid) {
          window.location.assign(completion.booking_view_url ?? payload.return_url);
          return;
        }

        setState({
          status: "blocked",
          message:
            completion.message ||
            completion.error ||
            "Payment was not approved. No booking payment was recorded.",
          bookingViewUrl: completion.booking_view_url ?? bookingViewUrl,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Secure payment could not be started.";
        setState({ status: "blocked", message, bookingViewUrl: bookingViewFallback });
      }
    }

    startCheckout();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [bookingViewFallback, token]);

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
        <p style={{ color: GOLD, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 12px" }}>
          Credit Libanais / NetCommerce
        </p>
        <h1 style={{ fontFamily: "serif", fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 400, margin: "0 0 14px" }}>
          Secure payment
        </h1>
        <p style={{ color: MUTED, fontSize: "15px", lineHeight: 1.7, maxWidth: "620px", margin: "0 0 28px" }}>
          Card details are entered only inside the bank-controlled payment interface. Oraya records payment only after server-side verification from the gateway.
        </p>

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
            <Summary label="Villa" value={summary.villa ?? "-"} />
            <Summary label="Check-in" value={formatDate(summary.check_in)} />
            <Summary label="Check-out" value={formatDate(summary.check_out)} />
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
                Return to booking
              </a>
            </div>
          ) : state.status === "blocked" ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <p style={{ color: WHITE, lineHeight: 1.7, margin: 0 }}>{state.message}</p>
              <a href={state.bookingViewUrl ?? bookingViewFallback} style={buttonStyle}>
                Return to booking
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
