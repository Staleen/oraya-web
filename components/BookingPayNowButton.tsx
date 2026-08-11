"use client";

import { useState } from "react";
import { GOLD, LATO, MIDNIGHT } from "@/components/theme";

/**
 * Guest self-serve payment.
 *
 * Before this existed, a guest who chose "reserve now, pay later" — or who paid
 * a deposit and wanted to settle the balance — had no way to pay at all. The
 * page told them to wait for Oraya to send a link, even though
 * `POST /api/payments/checkout` already authenticates the guest with the very
 * booking token in their address bar. This button closes that gap.
 *
 * It mints a checkout session and forwards the guest to the hosted payment
 * page. It never handles card details itself.
 */
export default function BookingPayNowButton({
  bookingId,
  bookingToken,
  purpose,
  amount,
  label,
}: {
  bookingId: string;
  bookingToken: string;
  purpose: "deposit" | "full" | "balance";
  /** Required for a deposit; ignored for full and balance. */
  amount?: number | null;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          booking_token: bookingToken,
          payment_purpose: purpose,
          ...(purpose === "deposit" && typeof amount === "number" ? { amount } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        checkout_url?: string;
        error?: string;
      };
      if (!response.ok || !data.checkout_url) {
        setError(data.error ?? "Payment could not be started. Please contact Oraya.");
        setBusy(false);
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      setError("Could not reach Oraya. No payment was started.");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "14px" }}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        style={{
          fontFamily: LATO,
          fontSize: "12px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          padding: "13px 26px",
          background: GOLD,
          color: MIDNIGHT,
          border: `1px solid ${GOLD}`,
          borderRadius: "2px",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Opening secure payment…" : label}
      </button>
      {error && (
        <p style={{ margin: "10px 0 0", fontFamily: LATO, fontSize: "13px", color: "#e0b070" }}>
          {error}
        </p>
      )}
    </div>
  );
}
