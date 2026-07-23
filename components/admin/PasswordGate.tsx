"use client";
import { useState } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import { adminApiFetchInit } from "@/lib/admin-auth";
import { GOLD, WHITE, MIDNIGHT, CHARCOAL, MUTED, PLAYFAIR, LATO, fieldStyle } from "./theme";

export default function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [input, setInput]   = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [recoverySending, setRecoverySending] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState("");

  // Remediation 2 (A.2) — sends a one-time reset link to the server-side
  // recovery address. The response is always generic by design.
  async function requestRecovery() {
    if (recoverySending) return;
    setRecoverySending(true);
    setRecoveryNotice("");
    try {
      await fetch("/api/admin/recovery/request", { method: "POST", cache: "no-store" });
    } catch {
      // Generic notice either way — the endpoint never confirms sends.
    } finally {
      setRecoverySending(false);
      setRecoveryNotice(
        "If recovery is configured, a one-time reset link was sent to the recovery email. It expires in 30 minutes.",
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verify-password", {
        ...adminApiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        onSuccess();
      } else if (res.status === 503) {
        setError(data.error ?? "Server is not configured for admin access.");
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Could not verify password. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh", backgroundColor: MIDNIGHT,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 1.75rem", opacity: 0.5 }} />

        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
          Restricted area
        </p>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 2rem" }}>
          Admin Access
        </h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            placeholder="Enter admin password"
            autoFocus
            style={{
              ...fieldStyle,
              padding: "14px 16px",
              fontSize: "15px",
              textAlign: "center",
              letterSpacing: "3px",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
          />

          {error && (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !input}
            style={{
              fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
              textTransform: "uppercase", color: CHARCOAL,
              backgroundColor: GOLD, border: "none", padding: "15px",
              cursor: loading || !input ? "not-allowed" : "pointer",
              opacity: loading || !input ? 0.6 : 1,
            }}
          >
            {loading ? "Verifying..." : "Enter"}
          </button>
        </form>

        <button
          type="button"
          onClick={requestRecovery}
          disabled={recoverySending}
          style={{
            fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px",
            textTransform: "uppercase", color: MUTED,
            backgroundColor: "transparent", border: "none",
            marginTop: "1.5rem", cursor: recoverySending ? "wait" : "pointer",
            textDecoration: "underline", textUnderlineOffset: "3px",
          }}
        >
          {recoverySending ? "Sending…" : "Forgot password?"}
        </button>
        {recoveryNotice && (
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, marginTop: "10px", lineHeight: 1.6 }}>
            {recoveryNotice}
          </p>
        )}
      </div>
    </main>
  );
}
