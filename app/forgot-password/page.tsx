"use client";
import { useState } from "react";
import PublicTrustShell from "@/components/PublicTrustShell";
import { supabase } from "@/lib/supabase";

const GOLD     = "var(--oraya-gold)";
const GOLD_CTA = "var(--oraya-gold-cta-text)";
const WHITE    = "var(--oraya-book-heading)";
const MUTED    = "var(--oraya-book-muted)";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "var(--oraya-book-input-bg)",
  border: "0.5px solid var(--oraya-book-input-border)",
  padding: "14px 16px",
  fontFamily: LATO,
  fontSize: "14px",
  color: "var(--oraya-book-text-on-field)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "var(--oraya-book-label)",
  display: "block",
  marginBottom: "6px",
};

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Best-effort: fire reset email.
      // Result is intentionally ignored — never expose whether the account exists.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Swallow all errors silently — neutral response only.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <PublicTrustShell mainStyle={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Members
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: 0 }}>
            Reset password
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
            Enter your email address and we&apos;ll send you a reset link.
          </p>
        </div>

        {submitted ? (
          /* Neutral confirmation — never reveals whether an account exists */
          <div style={{
            border: "0.5px solid var(--oraya-book-input-border)",
            padding: "16px 20px",
            fontFamily: LATO,
            fontSize: "13px",
            color: GOLD,
            textAlign: "center",
            lineHeight: 1.7,
            backgroundColor: "var(--oraya-book-surface-gold-3)",
          }}>
            If an account exists for this email, a reset link has been sent.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--oraya-book-input-border)"; }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "2.5px",
                textTransform: "uppercase",
                color: GOLD_CTA,
                backgroundColor: GOLD,
                border: "none",
                padding: "16px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                marginTop: "4px",
              }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        {/* Back to sign in */}
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
          <a
            href="/login"
            style={{ color: GOLD, textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
          >
            Back to sign in
          </a>
        </p>
      </div>
    </PublicTrustShell>
  );
}
