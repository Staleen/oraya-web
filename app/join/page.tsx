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

export default function JoinPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "", email: "", password: "",
    dialCode: "+961", phoneNumber: "",
    country: "", address: "",
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
      if (user) {
        const { error: insertError } = await supabase.from("members").insert({
          id: user.id,
          full_name: form.fullName,
          phone,
          country: form.country,
          address: form.address,
        });
        if (insertError) throw insertError;
      }

      router.push(`/welcome?name=${encodeURIComponent(form.fullName)}`);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "message" in err) {
        setError(String((err as { message: unknown }).message));
      } else {
        setError(JSON.stringify(err));
      }
    } finally {
      setLoading(false);
    }
  }

  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = GOLD;
  };
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)";
  };

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

          {/* Phone with dial code */}
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
                    <option key={`div-${i}`} disabled value="" style={{ backgroundColor: MIDNIGHT, color: MUTED }}>
                      {d.label}
                    </option>
                  ) : (
                    <option key={`${d.code}-${d.label}`} value={d.code} style={{ backgroundColor: MIDNIGHT }}>
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
            <input
              name="country" type="text"
              value={form.country} onChange={handleChange}
              placeholder="Lebanon"
              style={inputStyle}
              onFocus={focusBorder} onBlur={blurBorder}
            />
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
