"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";
import PublicThemeToggle from "@/components/PublicThemeToggle";
import { supabase } from "@/lib/supabase";

const GOLD      = "var(--oraya-gold)";
const GOLD_CTA  = "var(--oraya-gold-cta-text)";
const PAGE_BG   = "var(--oraya-bg)";
const CARD      = "var(--oraya-surface)";
const INK       = "var(--oraya-ink)";
const MUTED     = "var(--oraya-text-muted)";
const PLAYFAIR  = "'Playfair Display', Georgia, serif";
const LATO      = "'Lato', system-ui, sans-serif";

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

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const justReset = searchParams.get("reset") === "1";

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

      // Silently backfill members row using auth metadata in case it was never created.
      // ignoreDuplicates: true in the API means existing rows are never overwritten.
      const [{ data: { user } }, { data: { session } }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      if (user && session?.access_token) {
        const meta = user.user_metadata ?? {};
        fetch("/api/members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            id:        user.id,
            full_name: meta.full_name  ?? "",
            phone:     meta.phone      ?? "",
            country:   meta.country    ?? "",
            address:   meta.address    ?? "",
          }),
        }).catch(() => {}); // fire-and-forget, never block the redirect
      }

      const redirect = searchParams.get("redirect");
      router.push(redirect && redirect.startsWith("/") ? redirect : "/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: PAGE_BG, overflowX: "hidden" }}>
      <nav
        className="fixed top-0 left-0 right-0 z-[100] flex justify-between items-center gap-2 backdrop-blur-[8px] min-w-0"
        style={{
          padding: "1.1rem clamp(1rem, 4vw, 3rem)",
          backgroundColor: "var(--oraya-nav-bg)",
          borderBottom: "0.5px solid var(--oraya-nav-border)",
        }}
      >
        <a href="/" className="oraya-pressable w-11 h-11 shrink-0 block" style={{ cursor: "pointer" }}>
          <OrayaEmblem />
        </a>
        <PublicThemeToggle variant="public" />
      </nav>

      <main
        className="flex items-center justify-center"
        style={{ padding: "96px 24px 80px", minHeight: "100vh", boxSizing: "border-box" }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            backgroundColor: CARD,
            border: "0.5px solid var(--oraya-border)",
            padding: "clamp(1.5rem, 4vw, 2.5rem)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
              Members
            </p>
            <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: INK, margin: 0 }}>
              Welcome back
            </h1>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
              Sign in to access your Oraya member profile.
            </p>
          </div>

          {justReset && (
            <div style={{
              border: "0.5px solid var(--oraya-border)",
              padding: "12px 16px",
              marginBottom: "24px",
              fontFamily: LATO,
              fontSize: "12px",
              color: GOLD,
              textAlign: "center",
              lineHeight: 1.6,
              backgroundColor: "var(--oraya-surface-muted)",
            }}>
              Password updated — you can now sign in.
            </div>
          )}

          {justRegistered && (
            <div style={{
              border: "0.5px solid var(--oraya-border)",
              padding: "12px 16px",
              marginBottom: "24px",
              fontFamily: LATO,
              fontSize: "12px",
              color: GOLD,
              textAlign: "center",
              lineHeight: 1.6,
              backgroundColor: "var(--oraya-surface-muted)",
            }}>
              Account created — please check your email to confirm, then sign in.
            </div>
          )}

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
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--oraya-book-input-border)"; }}
              />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                <a
                  href="/forgot-password"
                  className="oraya-link-text"
                  style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, letterSpacing: "0.5px" }}
                >
                  Forgot password?
                </a>
              </div>
              <input
                name="password"
                type="password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="Your password"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--oraya-book-input-border)"; }}
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
              className={loading ? undefined : "oraya-pressable oraya-cta-gold-hover"}
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
            Not a member yet?{" "}
            <a
              href="/join"
              className="oraya-link-text"
              style={{ color: GOLD }}
            >
              Join Oraya
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
