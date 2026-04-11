"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";
import { supabase } from "@/lib/supabase";

const GOLD      = "#C5A46D";
const WHITE     = "#FFFFFF";
const MIDNIGHT  = "#1F2B38";
const CHARCOAL  = "#2E2E2E";
const MUTED     = "#8a8070";
const PLAYFAIR  = "'Playfair Display', Georgia, serif";
const LATO      = "'Lato', system-ui, sans-serif";

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (signInError) throw signInError;
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

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
            Welcome back
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
            Sign in to access your Oraya member profile.
          </p>
        </div>

        {/* Registered confirmation */}
        {justRegistered && (
          <div style={{
            border: "0.5px solid rgba(197,164,109,0.4)",
            padding: "12px 16px",
            marginBottom: "24px",
            fontFamily: LATO,
            fontSize: "12px",
            color: GOLD,
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            Account created — please check your email to confirm, then sign in.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={labelStyle}>Email address</label>
            <input
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              name="password"
              type="password"
              required
              value={form.password}
              onChange={handleChange}
              placeholder="Your password"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
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
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Join link */}
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
          Not a member yet?{" "}
          <a
            href="/join"
            style={{ color: GOLD, textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
          >
            Join Oraya
          </a>
        </p>
      </div>
    </main>
  );
}
