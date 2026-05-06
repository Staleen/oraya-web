"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

const COUNTRIES = [
  // Gulf priority
  { label: "Saudi Arabia", value: "Saudi Arabia" },
  { label: "UAE",           value: "UAE" },
  { label: "Qatar",         value: "Qatar" },
  { label: "Kuwait",        value: "Kuwait" },
  { label: "Bahrain",       value: "Bahrain" },
  { label: "Oman",          value: "Oman" },
  // Lebanon
  { label: "Lebanon",       value: "Lebanon" },
  // Other priority
  { label: "France",        value: "France" },
  { label: "Australia",     value: "Australia" },
  { label: "United States", value: "United States" },
  { label: "Canada",        value: "Canada" },
  { label: "United Kingdom",value: "United Kingdom" },
  { label: "Germany",       value: "Germany" },
  // Divider
  { label: "──────────────", value: "" },
  // Rest alphabetical
  { label: "Algeria",       value: "Algeria" },
  { label: "Argentina",     value: "Argentina" },
  { label: "Austria",       value: "Austria" },
  { label: "Belgium",       value: "Belgium" },
  { label: "Brazil",        value: "Brazil" },
  { label: "China",         value: "China" },
  { label: "Cyprus",        value: "Cyprus" },
  { label: "Denmark",       value: "Denmark" },
  { label: "Egypt",         value: "Egypt" },
  { label: "Finland",       value: "Finland" },
  { label: "Greece",        value: "Greece" },
  { label: "India",         value: "India" },
  { label: "Indonesia",     value: "Indonesia" },
  { label: "Iraq",          value: "Iraq" },
  { label: "Ireland",       value: "Ireland" },
  { label: "Italy",         value: "Italy" },
  { label: "Japan",         value: "Japan" },
  { label: "Jordan",        value: "Jordan" },
  { label: "Malaysia",      value: "Malaysia" },
  { label: "Mexico",        value: "Mexico" },
  { label: "Morocco",       value: "Morocco" },
  { label: "Netherlands",   value: "Netherlands" },
  { label: "New Zealand",   value: "New Zealand" },
  { label: "Nigeria",       value: "Nigeria" },
  { label: "Norway",        value: "Norway" },
  { label: "Pakistan",      value: "Pakistan" },
  { label: "Palestine",     value: "Palestine" },
  { label: "Poland",        value: "Poland" },
  { label: "Portugal",      value: "Portugal" },
  { label: "Russia",        value: "Russia" },
  { label: "Senegal",       value: "Senegal" },
  { label: "South Africa",  value: "South Africa" },
  { label: "South Korea",   value: "South Korea" },
  { label: "Spain",         value: "Spain" },
  { label: "Sudan",         value: "Sudan" },
  { label: "Sweden",        value: "Sweden" },
  { label: "Switzerland",   value: "Switzerland" },
  { label: "Syria",         value: "Syria" },
  { label: "Tunisia",       value: "Tunisia" },
  { label: "Turkey",        value: "Turkey" },
  { label: "Ukraine",       value: "Ukraine" },
  { label: "Yemen",         value: "Yemen" },
];

// Priority countries first, then alphabetical rest
const DIAL_CODES = [
  { flag: "🇱🇧", label: "Lebanon",      code: "+961" },
  { flag: "🇸🇦", label: "Saudi Arabia", code: "+966" },
  { flag: "🇦🇪", label: "UAE",          code: "+971" },
  { flag: "🇫🇷", label: "France",       code: "+33"  },
  { flag: "🇺🇸", label: "United States",code: "+1"   },
  { flag: "──", label: "──────────────", code: "" }, // divider
  { flag: "🇩🇿", label: "Algeria",      code: "+213" },
  { flag: "🇦🇷", label: "Argentina",    code: "+54"  },
  { flag: "🇦🇺", label: "Australia",    code: "+61"  },
  { flag: "🇦🇹", label: "Austria",      code: "+43"  },
  { flag: "🇧🇪", label: "Belgium",      code: "+32"  },
  { flag: "🇧🇷", label: "Brazil",       code: "+55"  },
  { flag: "🇨🇦", label: "Canada",       code: "+1"   },
  { flag: "🇨🇳", label: "China",        code: "+86"  },
  { flag: "🇨🇾", label: "Cyprus",       code: "+357" },
  { flag: "🇩🇰", label: "Denmark",      code: "+45"  },
  { flag: "🇪🇬", label: "Egypt",        code: "+20"  },
  { flag: "🇩🇪", label: "Germany",      code: "+49"  },
  { flag: "🇬🇷", label: "Greece",       code: "+30"  },
  { flag: "🇮🇳", label: "India",        code: "+91"  },
  { flag: "🇮🇶", label: "Iraq",         code: "+964" },
  { flag: "🇮🇪", label: "Ireland",      code: "+353" },
  { flag: "🇮🇹", label: "Italy",        code: "+39"  },
  { flag: "🇯🇴", label: "Jordan",       code: "+962" },
  { flag: "🇰🇼", label: "Kuwait",       code: "+965" },
  { flag: "🇲🇽", label: "Mexico",       code: "+52"  },
  { flag: "🇲🇦", label: "Morocco",      code: "+212" },
  { flag: "🇳🇱", label: "Netherlands",  code: "+31"  },
  { flag: "🇳🇿", label: "New Zealand",  code: "+64"  },
  { flag: "🇳🇬", label: "Nigeria",      code: "+234" },
  { flag: "🇳🇴", label: "Norway",       code: "+47"  },
  { flag: "🇴🇲", label: "Oman",         code: "+968" },
  { flag: "🇵🇰", label: "Pakistan",     code: "+92"  },
  { flag: "🇵🇸", label: "Palestine",    code: "+970" },
  { flag: "🇵🇱", label: "Poland",       code: "+48"  },
  { flag: "🇵🇹", label: "Portugal",     code: "+351" },
  { flag: "🇶🇦", label: "Qatar",        code: "+974" },
  { flag: "🇷🇺", label: "Russia",       code: "+7"   },
  { flag: "🇸🇳", label: "Senegal",      code: "+221" },
  { flag: "🇿🇦", label: "South Africa", code: "+27"  },
  { flag: "🇪🇸", label: "Spain",        code: "+34"  },
  { flag: "🇸🇩", label: "Sudan",        code: "+249" },
  { flag: "🇸🇪", label: "Sweden",       code: "+46"  },
  { flag: "🇨🇭", label: "Switzerland",  code: "+41"  },
  { flag: "🇸🇾", label: "Syria",        code: "+963" },
  { flag: "🇹🇳", label: "Tunisia",      code: "+216" },
  { flag: "🇹🇷", label: "Turkey",       code: "+90"  },
  { flag: "🇬🇧", label: "United Kingdom",code: "+44" },
  { flag: "🇾🇪", label: "Yemen",        code: "+967" },
];

const optBg = "var(--oraya-book-option-bg)";

export default function JoinPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "", email: "", password: "",
    dialCode: "+961", phoneNumber: "",
    country: "Lebanon", address: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const phone = form.phoneNumber ? `${form.dialCode}${form.phoneNumber}` : "";
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.fullName,
            phone,
            country: form.country,
            address: form.address,
          },
        },
      });
      if (signUpError) throw signUpError;

      const user = data.user;
      const accessToken = data.session?.access_token;
      if (user && accessToken) {
        // Insert via server-side API when Supabase issues a session immediately.
        // Email-confirmation signups are backfilled after the first login.
        const res = await fetch("/api/members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            id:        user.id,
            full_name: form.fullName,
            phone,
            country:   form.country,
            address:   form.address,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Failed to save member profile.");
        }
      }

      router.push(`/welcome?name=${encodeURIComponent(form.fullName)}`);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);

      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("user already")) {
        setError("__already_registered__");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = GOLD;
  };
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--oraya-book-input-border)";
  };

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
            maxWidth: "480px",
            backgroundColor: CARD,
            border: "0.5px solid var(--oraya-border)",
            padding: "clamp(1.5rem, 4vw, 2.5rem)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
              Membership
            </p>
            <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: INK, margin: 0 }}>
              Join Oraya
            </h1>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
              Create your member profile for exclusive access and priority booking.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            <div>
              <label style={labelStyle}>Full name</label>
              <input
                name="fullName" type="text" required
                value={form.fullName} onChange={handleChange}
                placeholder="Your full name"
                style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder}
              />
            </div>

            <div>
              <label style={labelStyle}>Email address</label>
              <input
                name="email" type="email" required
                value={form.email} onChange={handleChange}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder}
              />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <input
                name="password" type="password" required minLength={8}
                value={form.password} onChange={handleChange}
                placeholder="Minimum 8 characters"
                style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder}
              />
            </div>

            <div>
              <label style={labelStyle}>Phone number</label>
              <div style={{ display: "flex", gap: "0" }}>
                <select
                  name="dialCode"
                  value={form.dialCode}
                  onChange={handleChange}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  style={{
                    ...inputStyle,
                    width: "auto",
                    flexShrink: 0,
                    paddingRight: "10px",
                    borderRight: "none",
                    cursor: "pointer",
                    appearance: "none",
                    minWidth: "120px",
                  }}
                >
                  {DIAL_CODES.map((d, i) =>
                    d.code === "" ? (
                      <option key={`div-${i}`} disabled value="" style={{ backgroundColor: optBg, color: MUTED }}>
                        {d.label}
                      </option>
                    ) : (
                      <option key={`${d.code}-${d.label}`} value={d.code} style={{ backgroundColor: optBg }}>
                        {d.flag} {d.code}
                      </option>
                    )
                  )}
                </select>
                <input
                  name="phoneNumber"
                  type="tel"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  placeholder="70 000 000"
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Country</label>
              <select
                name="country"
                value={form.country}
                onChange={handleChange}
                onFocus={focusBorder}
                onBlur={blurBorder}
                style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
              >
                {COUNTRIES.map((c, i) =>
                  c.value === "" ? (
                    <option key={`div-${i}`} disabled value="" style={{ backgroundColor: optBg, color: MUTED }}>
                      {c.label}
                    </option>
                  ) : (
                    <option key={c.value} value={c.value} style={{ backgroundColor: optBg }}>
                      {c.label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Address</label>
              <input
                name="address" type="text"
                value={form.address} onChange={handleChange}
                placeholder="City, region"
                style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder}
              />
            </div>

            {error === "__already_registered__" ? (
              <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.7 }}>
                This email is already registered.{" "}
                <a href="/login" style={{ color: GOLD, textDecoration: "underline" }}>Sign in instead</a>
                {" "}— or contact us if you need help accessing your account.
              </p>
            ) : error ? (
              <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center" }}>
                {error}
              </p>
            ) : null}

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
              {loading ? "Creating account…" : "Create member account"}
            </button>
          </form>

          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
            Already a member?{" "}
            <a
              href="/login"
              className="oraya-link-text"
              style={{ color: GOLD }}
            >
              Sign in
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
