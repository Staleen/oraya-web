"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";
import { supabase } from "@/lib/supabase";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(197,164,109,0.25)",
  padding: "14px 16px",
  fontFamily: LATO,
  fontSize: "14px",
  color: WHITE,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  display: "block",
  marginBottom: "6px",
};

type PageState = "waiting" | "ready" | "done" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("waiting");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    // Supabase JS client automatically parses the #access_token=...&type=recovery
    // hash fragment on load and fires the PASSWORD_RECOVERY auth state event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("ready");
      }
    });

    // If no recovery event arrives within 4 seconds the link is invalid/expired.
    const timeout = setTimeout(() => {
      setPageState((current) => (current === "waiting" ? "invalid" : current));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPageState("done");
      // Brief pause so the user reads the success message, then redirect.
      setTimeout(() => router.push("/login?reset=1"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please request a new reset link.");
    } finally {
      setLoading(false);
    }
  }

  const heading =
    pageState === "done"    ? "Password updated"  :
    pageState === "invalid" ? "Link expired"      :
    "Set new password";

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: MIDNIGHT, padding: "80px 24px" }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Members
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: 0 }}>
            {heading}
          </h1>
        </div>

        {/* Waiting for Supabase to parse the recovery hash */}
        {pageState === "waiting" && (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, textAlign: "center", lineHeight: 1.7 }}>
            Verifying reset link…
          </p>
        )}

        {/* Invalid / expired link */}
        {pageState === "invalid" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: "#e07070", lineHeight: 1.7, marginBottom: "1.5rem" }}>
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <a
              href="/forgot-password"
              style={{ fontFamily: LATO, fontSize: "12px", color: GOLD, textDecoration: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
            >
              Request a new reset link
            </a>
          </div>
        )}

        {/* Success */}
        {pageState === "done" && (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: "#6fcf8a", textAlign: "center", lineHeight: 1.7 }}>
            Your password has been updated. Redirecting to sign in…
          </p>
        )}

        {/* New password form — only shown once recovery session is confirmed */}
        {pageState === "ready" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />
            </div>

            <div>
              <label style={labelStyle}>Confirm new password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />
            </div>

            {error && (
              <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "2.5px",
                textTransform: "uppercase",
                color: CHARCOAL,
                backgroundColor: GOLD,
                border: "none",
                padding: "16px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                marginTop: "4px",
              }}
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        {/* Back to sign in — shown on invalid and ready states */}
        {(pageState === "invalid" || pageState === "ready") && (
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
        )}
      </div>
    </main>
  );
}
