"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, use } from "react";

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

export default function PaymentCheckoutPage(props: { params: Promise<{ token: string }> }) {
  const params = use(props.params);
  const token = params.token;
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [summary, setSummary] = useState<SessionResponse["booking_summary"] | null>(null);

  const bookingViewFallback = useMemo(() => `/booking/view/${token}`, [token]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function startCheckout() {
      let completionRequestSubmitted = false;
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
            message: "Secure payment is not available for this booking right now. Please return to your booking for the next step.",
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
        if (!checkoutWindow.Accept && !checkoutWindow.VAS?.UnifiedCheckout) {
          throw new Error("CyberSource payment client did not initialize.");
        }

        const bookingViewUrl = payload.booking_view_url ?? bookingViewFallback;
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
            typeof completion.message === "string" && completion.message.trim()
              ? completion.message.trim()
              : "We could not confirm the payment outcome. Do NOT retry or pay again; please contact Oraya.",
          bookingViewUrl: completion.booking_view_url ?? bookingViewUrl,
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
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            border: `1px solid ${BORDER}`,
            background: "rgba(255,255,255,0.03)",
            padding: "10px 12px",
            marginBottom: "18px",
          }}
        >
          <Image
            src="/payment/NCseal_M.png"
            alt="NetCommerce Security Seal"
            width={130}
            height={72}
            style={{ width: "130px", height: "72px", display: "block" }}
          />
          <span style={{ color: MUTED, fontSize: "12px", lineHeight: 1.5 }}>
            Online payments are processed securely through NetCommerce Secure Payment Gateway.
          </span>
        </div>

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
