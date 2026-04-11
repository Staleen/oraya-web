"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function JoinPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "", email: "", password: "",
    phone: "", country: "", address: "",
  });
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
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.fullName,
            phone: form.phone,
            country: form.country,
            address: form.address,
          },
        },
      });
      if (signUpError) throw signUpError;
      router.push("/login?registered=1");
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
      <div style={{ width: "100%", maxWidth: "480px" }}>
        {/* Logo */}
        <div style={{ width: "52px", margin: "0 auto 2.5rem" }}>
          <OrayaEmblem />
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Membership
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: 0 }}>
            Join Oraya
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
            Create your member profile for exclusive access and priority booking.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={labelStyle}>Full name</label>
            <input
              name="fullName"
              type="text"
              required
              value={form.fullName}
              onChange={handleChange}
              placeholder="Your full name"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
          </div>

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
              minLength={8}
              value={form.password}
              onChange={handleChange}
              placeholder="Minimum 8 characters"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Phone number</label>
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="+961 ..."
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Country</label>
            <input
              name="country"
              type="text"
              value={form.country}
              onChange={handleChange}
              placeholder="Lebanon"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Address</label>
            <input
              name="address"
              type="text"
              value={form.address}
              onChange={handleChange}
              placeholder="City, region"
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
            {loading ? "Creating account…" : "Create member account"}
          </button>
        </form>

        {/* Sign in link */}
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
          Already a member?{" "}
          <a
            href="/login"
            style={{ color: GOLD, textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
          >
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
