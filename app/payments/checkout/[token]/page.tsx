"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, use } from "react";
import OrayaLogoFull from "@/components/OrayaLogoFull";
import { GOLD, LATO, PLAYFAIR } from "@/components/theme";

/**
 * Brand note (2026-08-12): this page used its own near-miss palette — gold
 * #C9A45C against Oraya's #C5A46D, a flat #141414 background instead of
 * midnight, and a generic `serif` stack instead of Playfair. Close enough to
 * look like a mistake, far enough to read as a different company at the exact
 * moment a guest is deciding whether to type a card number. It now uses the
 * shared tokens.
 *
 * Layout note (2026-08-12, second report): fixing the palette was not enough —
 * the page was still a wide left-aligned column on a hardcoded midnight
 * background, while `/book` is a centred 560px column on `--oraya-book-bg`.
 * The site default theme is LIGHT (`app/layout.tsx`), so a guest walked from a
 * beige, centred Step 3 into a dark, left-aligned Step 4: two applications.
 * These are the same tokens `/book` uses — the documented constants, resolved
 * per theme — so the two steps now move together instead of only agreeing in
 * dark mode.
 */
const PAGE_BG = "var(--oraya-book-bg)";
const HEADING = "var(--oraya-book-heading)";
const BODY = "var(--oraya-book-p78)";
const LABEL = "var(--oraya-book-p62)";
const VALUE = "var(--oraya-book-text)";
const MUTED = "var(--oraya-book-muted)";
const GLASS1 = "var(--oraya-book-surface-1)";
const GLASS3 = "var(--oraya-book-surface-3)";
const CARD_BORDER = "0.5px solid rgba(197,164,109,0.2)";
const ROW_BORDER = "var(--oraya-book-subtle-border)";
const GOLD_CTA = "var(--oraya-gold-cta-text)";
const STEP_INK = "var(--oraya-ink)";

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
    /** True when the link is attached to a booking. */
    for_booking?: boolean;
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

/**
 * Where "Cancel payment" leaves the guest.
 *
 * A booking checkout already cancels to `/booking/view/…?payment=cancelled` —
 * the stay, waiting, payable later. An **operator-sent link that belongs to a
 * booking** cancelled to `/pay/…` instead, whose only control is "Open secure
 * checkout" — so cancel and open-checkout were the two exits and neither left.
 * The guest's booking exists by this point; the honest destination is the
 * booking.
 *
 * `booking_view_url` is minted as a SUCCESS url (`?payment=success`, see
 * lib/payments/payment-success-redirect.ts), so the return state is rewritten
 * to `cancelled`. Sending a guest who cancelled to a page announcing "Payment
 * received" would be a worse defect than the dead end. If that rewrite cannot
 * be done safely for any reason, the existing cancel url is kept.
 *
 * A standalone payment request has no booking to return to and keeps today's
 * behaviour. No money state is read or written here — this is a link.
 */
function resolveCancelDestination(payload: SessionResponse): string {
  const cancelUrl = payload.cancel_url ?? "";
  const preferred = payload.booking_view_url ?? payload.cancel_url;
  if (!preferred) return cancelUrl;
  try {
    const url = new URL(preferred, window.location.origin);
    url.searchParams.set("payment", "cancelled");
    return `${url.pathname}${url.search}`;
  } catch {
    return cancelUrl;
  }
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

/**
 * The booking flow, continued.
 *
 * A guest who has just walked through Villa & Dates, Stay Setup and Guest
 * Details arrives here and — before this — saw a page with a different
 * palette, a bank's name at the top and no sign of where they were in the
 * process. It read as being handed off to a third party at the exact moment
 * trust matters most.
 *
 * Payment is step four of Oraya's own flow, so the page says so. Shown only
 * for a booking checkout: a standalone payment link has no preceding steps,
 * and inventing three completed ones would be a lie told in ticks.
 *
 * Dimensions, colours and rhythm are `/book`'s own `StepIndicator` — 26px
 * marks, a 52px rule between them, a gold caption 12px/2px above 2.5rem of
 * air — so the rail does not visibly change size or position as the guest
 * crosses from Step 3 into Step 4. The caption keeps its wording.
 */
function CheckoutSteps() {
  const labels = ["Villa & Dates", "Stay Setup", "Guest Details", "Payment"];
  return (
    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {labels.map((label, i) => {
          const n = i + 1;
          const done = n < 4;
          const active = n === 4;
          return (
            <div key={label} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: `1px solid ${GOLD}`,
                  backgroundColor: active ? GOLD : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: LATO,
                  fontSize: "10px",
                  color: active ? STEP_INK : GOLD,
                }}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : n}
              </div>
              {i < 3 && (
                <div style={{ width: "clamp(18px, 6vw, 52px)", height: "0.5px", backgroundColor: GOLD }} />
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontFamily: LATO, fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, marginTop: "12px", marginBottom: 0, fontWeight: 400 }}>
        Step 4 of 4 · Payment
      </p>
    </div>
  );
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
  /**
   * Show the booking step rail whenever this payment belongs to a stay —
   * including a link an operator sent by hand. Keyed on the booking, not on
   * how the link was created: the first version keyed it on the link type and
   * so hid the rail on a real booking payment (live, 2026-08-12).
   */
  const showBookingSteps = useMemo(() => {
    if (!summary) return false;
    return isPaymentRequestSummary(summary) ? summary.for_booking === true : true;
  }, [summary]);

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
          cancelUrl: resolveCancelDestination(payload),
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

  const summaryRows: [string, string][] = summary
    ? isPaymentRequestSummary(summary)
      ? [
          ["Payment for", summary.description ?? "Oraya payment"],
          ["Prepared for", summary.payer_name ?? "Guest"],
          ["Amount", formatMoney(summary.amount, summary.currency)],
        ]
      : [
          ["Villa", summary.villa ?? "-"],
          ["Check-in", formatDate(summary.check_in)],
          ["Check-out", formatDate(summary.check_out)],
          ["Amount", formatMoney(summary.amount, summary.currency)],
        ]
    : [];

  /*
    `/book`'s own shell: the page wash, a centred 560px column, the wordmark at
    160px above 2.5rem of air, a centred Playfair heading, the step rail, then
    bordered card sections stacked on a 20px rhythm. Step 3 and Step 4 are the
    same page with different contents, which is what they always were.
  */
  return (
    <main style={{ backgroundColor: PAGE_BG, minHeight: "100vh", padding: "80px 24px" }}>
      <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto" }}>

        <div style={{ width: "160px", margin: "0 auto 2.5rem" }}>
          <OrayaLogoFull />
        </div>

        <div style={{ textAlign: "center", marginBottom: showBookingSteps ? "1.5rem" : "2.5rem" }}>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: HEADING, margin: 0 }}>
            {showBookingSteps ? "Secure payment" : "Payment request"}
          </h1>
        </div>

        {showBookingSteps && <CheckoutSteps />}

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {summaryRows.length > 0 && (
            <div>
              <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: HEADING, margin: "0 0 10px" }}>
                {showBookingSteps ? "Your stay" : "This payment"}
              </p>
              <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.25rem", backgroundColor: GLASS3 }}>
                {summaryRows.map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: `0.5px solid ${ROW_BORDER}`, gap: "16px" }}>
                    <span style={{ fontFamily: LATO, fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase", color: LABEL, flexShrink: 0, paddingRight: "16px" }}>{label}</span>
                    <span style={{ fontFamily: LATO, fontSize: "13px", color: VALUE, textAlign: "right", lineHeight: 1.5, maxWidth: "60%" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ border: CARD_BORDER, backgroundColor: GLASS1, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "14px", minHeight: "260px" }}>
            <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Card details
            </p>

            {state.status === "loading" ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.65, margin: 0 }}>Preparing secure payment...</p>
            ) : state.status === "processing" ? (
              <>
                <p style={{ fontFamily: LATO, fontSize: "13px", color: BODY, lineHeight: 1.65, margin: 0 }}>
                  Verifying payment with the gateway...
                </p>
                <a href={state.bookingViewUrl} style={secondaryButtonStyle}>
                  {isPaymentRequest ? "Return to payment request" : "Return to booking"}
                </a>
              </>
            ) : state.status === "blocked" ? (
              <>
                <p style={{ fontFamily: LATO, fontSize: "13px", color: BODY, lineHeight: 1.65, margin: 0 }}>{state.message}</p>
                <a href={state.bookingViewUrl ?? bookingViewFallback} style={primaryButtonStyle}>
                  {state.message.toLowerCase().includes("payment was received")
                    ? isPaymentRequest
                      ? "View payment confirmation"
                      : "View your booking"
                    : isPaymentRequest
                      ? "Return to payment request"
                      : "Return to booking"}
                </a>
              </>
            ) : (
              <>
                <div id="oraya-payment-buttons" />
                <div id="oraya-payment-screen" />
                <a href={state.cancelUrl} style={secondaryButtonStyle}>
                  Cancel payment
                </a>
              </>
            )}
          </div>

          <p style={{ fontFamily: LATO, fontSize: "13px", color: BODY, lineHeight: 1.65, margin: 0, textAlign: "center" }}>
            Your card details are entered inside your bank&rsquo;s own secure interface — Oraya never sees them, and records your payment only once the bank confirms it.
          </p>
        </div>

        {/*
          The gateway's seal, and nothing else. Oraya is under no obligation to
          advertise the acquirer by name on its own checkout — the mark carries
          the trust signal; the sentence beside it was free advertising for
          somebody else, on the page where the guest is deciding to pay us.
        */}
        <div style={{ marginTop: "28px", paddingTop: "18px", borderTop: `0.5px solid ${ROW_BORDER}`, display: "flex", justifyContent: "center" }}>
          <Image
            src="/payment/NCseal_M.png"
            alt="Secure payment gateway"
            width={130}
            height={72}
            style={{ width: "72px", height: "auto", display: "block", opacity: 0.6 }}
          />
        </div>
      </div>
    </main>
  );
}

/** `/book`'s Step 3 CTAs: gold solid for the way forward, gold outline beside it. */
const primaryButtonStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
  minHeight: "50px",
  padding: "14px 18px",
  backgroundColor: GOLD,
  color: GOLD_CTA,
  border: "none",
  textDecoration: "none",
  fontFamily: LATO,
  fontSize: "13px",
  letterSpacing: "0.8px",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  minHeight: "46px",
  padding: "12px 18px",
  backgroundColor: "transparent",
  color: GOLD,
  border: "0.5px solid rgba(197,164,109,0.4)",
};
