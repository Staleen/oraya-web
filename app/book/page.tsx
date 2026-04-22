"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  appearance: "none",
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

const VILLAS      = ["Villa Mechmech", "Villa Byblos"];
const EVENT_TYPES = ["Stay", "Wedding", "Baptism", "Corporate"];

const COUNTRIES = [
  { label: "Saudi Arabia",   value: "Saudi Arabia" },
  { label: "UAE",            value: "UAE" },
  { label: "Qatar",          value: "Qatar" },
  { label: "Kuwait",         value: "Kuwait" },
  { label: "Bahrain",        value: "Bahrain" },
  { label: "Oman",           value: "Oman" },
  { label: "Lebanon",        value: "Lebanon" },
  { label: "France",         value: "France" },
  { label: "Australia",      value: "Australia" },
  { label: "United States",  value: "United States" },
  { label: "Canada",         value: "Canada" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "Germany",        value: "Germany" },
  { label: "──────────────", value: "" },
  { label: "Algeria",        value: "Algeria" },
  { label: "Argentina",      value: "Argentina" },
  { label: "Austria",        value: "Austria" },
  { label: "Belgium",        value: "Belgium" },
  { label: "Brazil",         value: "Brazil" },
  { label: "China",          value: "China" },
  { label: "Cyprus",         value: "Cyprus" },
  { label: "Denmark",        value: "Denmark" },
  { label: "Egypt",          value: "Egypt" },
  { label: "Finland",        value: "Finland" },
  { label: "Greece",         value: "Greece" },
  { label: "India",          value: "India" },
  { label: "Indonesia",      value: "Indonesia" },
  { label: "Iraq",           value: "Iraq" },
  { label: "Ireland",        value: "Ireland" },
  { label: "Italy",          value: "Italy" },
  { label: "Japan",          value: "Japan" },
  { label: "Jordan",         value: "Jordan" },
  { label: "Malaysia",       value: "Malaysia" },
  { label: "Mexico",         value: "Mexico" },
  { label: "Morocco",        value: "Morocco" },
  { label: "Netherlands",    value: "Netherlands" },
  { label: "New Zealand",    value: "New Zealand" },
  { label: "Nigeria",        value: "Nigeria" },
  { label: "Norway",         value: "Norway" },
  { label: "Pakistan",       value: "Pakistan" },
  { label: "Palestine",      value: "Palestine" },
  { label: "Poland",         value: "Poland" },
  { label: "Portugal",       value: "Portugal" },
  { label: "Russia",         value: "Russia" },
  { label: "Senegal",        value: "Senegal" },
  { label: "South Africa",   value: "South Africa" },
  { label: "South Korea",    value: "South Korea" },
  { label: "Spain",          value: "Spain" },
  { label: "Sudan",          value: "Sudan" },
  { label: "Sweden",         value: "Sweden" },
  { label: "Switzerland",    value: "Switzerland" },
  { label: "Syria",          value: "Syria" },
  { label: "Tunisia",        value: "Tunisia" },
  { label: "Turkey",         value: "Turkey" },
  { label: "Ukraine",        value: "Ukraine" },
  { label: "Yemen",          value: "Yemen" },
];

const DIAL_CODES = [
  { flag: "🇱🇧", label: "Lebanon",       code: "+961" },
  { flag: "🇸🇦", label: "Saudi Arabia",  code: "+966" },
  { flag: "🇦🇪", label: "UAE",           code: "+971" },
  { flag: "🇫🇷", label: "France",        code: "+33"  },
  { flag: "🇺🇸", label: "United States", code: "+1"   },
  { flag: "──",  label: "──────────────", code: ""    },
  { flag: "🇩🇿", label: "Algeria",       code: "+213" },
  { flag: "🇦🇷", label: "Argentina",     code: "+54"  },
  { flag: "🇦🇺", label: "Australia",     code: "+61"  },
  { flag: "🇦🇹", label: "Austria",       code: "+43"  },
  { flag: "🇧🇪", label: "Belgium",       code: "+32"  },
  { flag: "🇧🇷", label: "Brazil",        code: "+55"  },
  { flag: "🇨🇦", label: "Canada",        code: "+1"   },
  { flag: "🇨🇳", label: "China",         code: "+86"  },
  { flag: "🇨🇾", label: "Cyprus",        code: "+357" },
  { flag: "🇩🇰", label: "Denmark",       code: "+45"  },
  { flag: "🇪🇬", label: "Egypt",         code: "+20"  },
  { flag: "🇩🇪", label: "Germany",       code: "+49"  },
  { flag: "🇬🇷", label: "Greece",        code: "+30"  },
  { flag: "🇮🇳", label: "India",         code: "+91"  },
  { flag: "🇮🇶", label: "Iraq",          code: "+964" },
  { flag: "🇮🇪", label: "Ireland",       code: "+353" },
  { flag: "🇮🇹", label: "Italy",         code: "+39"  },
  { flag: "🇯🇴", label: "Jordan",        code: "+962" },
  { flag: "🇰🇼", label: "Kuwait",        code: "+965" },
  { flag: "🇲🇽", label: "Mexico",        code: "+52"  },
  { flag: "🇲🇦", label: "Morocco",       code: "+212" },
  { flag: "🇳🇱", label: "Netherlands",   code: "+31"  },
  { flag: "🇳🇿", label: "New Zealand",   code: "+64"  },
  { flag: "🇳🇬", label: "Nigeria",       code: "+234" },
  { flag: "🇳🇴", label: "Norway",        code: "+47"  },
  { flag: "🇴🇲", label: "Oman",          code: "+968" },
  { flag: "🇵🇰", label: "Pakistan",      code: "+92"  },
  { flag: "🇵🇸", label: "Palestine",     code: "+970" },
  { flag: "🇵🇱", label: "Poland",        code: "+48"  },
  { flag: "🇵🇹", label: "Portugal",      code: "+351" },
  { flag: "🇶🇦", label: "Qatar",         code: "+974" },
  { flag: "🇷🇺", label: "Russia",        code: "+7"   },
  { flag: "🇸🇳", label: "Senegal",       code: "+221" },
  { flag: "🇿🇦", label: "South Africa",  code: "+27"  },
  { flag: "🇪🇸", label: "Spain",         code: "+34"  },
  { flag: "🇸🇩", label: "Sudan",         code: "+249" },
  { flag: "🇸🇪", label: "Sweden",        code: "+46"  },
  { flag: "🇨🇭", label: "Switzerland",   code: "+41"  },
  { flag: "🇸🇾", label: "Syria",         code: "+963" },
  { flag: "🇹🇳", label: "Tunisia",       code: "+216" },
  { flag: "🇹🇷", label: "Turkey",        code: "+90"  },
  { flag: "🇬🇧", label: "United Kingdom",code: "+44"  },
  { flag: "🇾🇪", label: "Yemen",         code: "+967" },
];

type AuthStatus = "loading" | "member" | "none";

function friendlyError(msg: string): string {
  if (msg.includes("row-level security") || msg.includes("policy") || msg.includes("42501")) {
    return "Unable to submit booking. Please try again or contact us directly.";
  }
  if (msg.includes("check_in") || msg.includes("check_out")) {
    return "Invalid dates selected. Please check your check-in and check-out.";
  }
  if (msg.includes("JWT") || msg.includes("auth")) {
    return "Session error. Please refresh the page and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  return msg;
}

function BookPageInner() {
  const router      = useRouter();
  const searchParams = useSearchParams();

  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [memberName, setMemberName] = useState("");
  const [guestMode, setGuestMode]   = useState(false);

  const [guest, setGuest] = useState({
    fullName:    "",
    email:       "",
    dialCode:    "+961",
    phoneNumber: "",
    country:     "Lebanon",
  });

  const [form, setForm] = useState({
    villa:         "",
    checkIn:       "",
    checkOut:      "",
    sleepingGuests:"2",
    dayVisitors:   "0",
    eventType:     "",
    message:       "",
  });

  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-select villa from query param
  useEffect(() => {
    const v = searchParams.get("villa");
    if (v && VILLAS.includes(v)) setForm((f) => ({ ...f, villa: v }));
  }, [searchParams]);

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setAuthStatus("member");
        const { data } = await supabase
          .from("members")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (data?.full_name) setMemberName(data.full_name);
      } else {
        setAuthStatus("none");
      }
    });
  }, []);

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleGuestChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setGuest((g) => ({ ...g, [e.target.name]: e.target.value }));
  }

  function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = GOLD;
  }
  function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.villa)                        { setError("Please select a villa.");                    return; }
    if (!form.checkIn)                      { setError("Please select a check-in date.");            return; }
    if (!form.checkOut)                     { setError("Please select a check-out date.");           return; }
    if (form.checkOut <= form.checkIn)      { setError("Check-out must be after check-in.");         return; }
    if (guestMode && !guest.fullName.trim()){ setError("Please enter your full name.");              return; }
    if (guestMode && !guest.email.trim())   { setError("Please enter a valid email address.");       return; }

    setLoading(true);
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.error("[book] auth.getUser error:", authErr);

      // Get session token for member bookings (so server can verify identity)
      let accessToken: string | null = null;
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? null;
      }

      const body: Record<string, unknown> = {
        villa:           form.villa,
        check_in:        form.checkIn,
        check_out:       form.checkOut,
        sleeping_guests: form.sleepingGuests,
        day_visitors:    form.dayVisitors,
        event_type:      form.eventType || null,
        message:         form.message   || null,
      };

      if (user) {
        body.member_id = user.id;
      } else {
        body.guest_name    = guest.fullName.trim();
        body.guest_email   = guest.email.trim();
        body.guest_phone   = guest.phoneNumber
          ? `${guest.dialCode}${guest.phoneNumber}`
          : null;
        body.guest_country = guest.country || null;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res = await fetch("/api/bookings", {
        method:  "POST",
        headers,
        body:    JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error("[book] booking API error:", json);
        throw new Error(json.error ?? "Failed to submit booking.");
      }

      const booking     = json.booking;
      const displayName = user ? memberName : guest.fullName;
      const params = new URLSearchParams({
        villa:         form.villa,
        checkIn:       form.checkIn,
        checkOut:      form.checkOut,
        sleepingGuests:form.sleepingGuests,
        dayVisitors:   form.dayVisitors,
        eventType:     form.eventType,
        id:            booking?.id ?? "",
        ...(displayName ? { name: displayName } : {}),
      });
      router.push(`/booking-confirmed?${params.toString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[book] submission error:", err);
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  const sleepingCount = parseInt(form.sleepingGuests, 10) || 0;

  // Spinner while checking auth
  if (authStatus === "loading") {
    return (
      <main style={{
        backgroundColor: MIDNIGHT, minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: "36px", opacity: 0.5 }}><OrayaEmblem /></div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: MIDNIGHT, padding: "80px 24px" }}
    >
      <div style={{ width: "100%", maxWidth: "520px" }}>

        {/* Logo */}
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Reservations
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: 0 }}>
            Request a booking
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
            Submit your dates and we&apos;ll confirm availability within 24 hours.
          </p>
        </div>

        {/* Auth banner — not logged in, haven't chosen guest */}
        {authStatus === "none" && !guestMode && (
          <div style={{
            border: "0.5px solid rgba(197,164,109,0.3)",
            backgroundColor: "rgba(197,164,109,0.05)",
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            textAlign: "center",
          }}>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: "rgba(255,255,255,0.7)", marginBottom: "1rem", lineHeight: 1.7 }}>
              Sign in for member benefits, or continue as guest.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <a
                href="/login?redirect=/book"
                style={{
                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                  textTransform: "uppercase", color: CHARCOAL,
                  backgroundColor: GOLD, padding: "12px 28px",
                  textDecoration: "none", display: "inline-block",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
              >
                Sign In
              </a>
              <button
                onClick={() => setGuestMode(true)}
                style={{
                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                  textTransform: "uppercase", color: GOLD,
                  backgroundColor: "transparent",
                  border: "0.5px solid rgba(197,164,109,0.4)",
                  padding: "12px 28px", cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = GOLD;
                  (e.currentTarget as HTMLElement).style.color = WHITE;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.4)";
                  (e.currentTarget as HTMLElement).style.color = GOLD;
                }}
              >
                Continue as Guest
              </button>
            </div>
          </div>
        )}

        {/* Member greeting */}
        {authStatus === "member" && (
          <div style={{
            border: "0.5px solid rgba(197,164,109,0.2)",
            backgroundColor: "rgba(197,164,109,0.04)",
            padding: "0.875rem 1.25rem",
            marginBottom: "2rem",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Booking as{" "}
              <span style={{ color: GOLD }}>
                {memberName || "member"}
              </span>
            </p>
            <a
              href="/login"
              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
            >
              Not you?
            </a>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Guest contact fields */}
          {guestMode && (
            <div style={{
              border: "0.5px solid rgba(197,164,109,0.2)",
              backgroundColor: "rgba(255,255,255,0.02)",
              padding: "1.5rem",
              display: "flex", flexDirection: "column", gap: "16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  Your details
                </p>
                <button
                  type="button"
                  onClick={() => setGuestMode(false)}
                  style={{
                    fontFamily: LATO, fontSize: "10px", color: MUTED,
                    backgroundColor: "transparent", border: "none",
                    cursor: "pointer", letterSpacing: "1px",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = WHITE; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
                >
                  ← Back
                </button>
              </div>

              <div>
                <label style={labelStyle}>Full name</label>
                <input
                  name="fullName" type="text" required
                  value={guest.fullName} onChange={handleGuestChange}
                  placeholder="Your full name"
                  style={inputStyle}
                  onFocus={focusGold} onBlur={blurGold}
                />
              </div>

              <div>
                <label style={labelStyle}>Email address</label>
                <input
                  name="email" type="email" required
                  value={guest.email} onChange={handleGuestChange}
                  placeholder="you@example.com"
                  style={inputStyle}
                  onFocus={focusGold} onBlur={blurGold}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Phone number{" "}
                  <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                </label>
                <div style={{ display: "flex" }}>
                  <select
                    name="dialCode"
                    value={guest.dialCode}
                    onChange={handleGuestChange}
                    onFocus={focusGold} onBlur={blurGold}
                    style={{
                      ...inputStyle,
                      width: "auto", flexShrink: 0,
                      paddingRight: "10px", borderRight: "none",
                      cursor: "pointer", minWidth: "120px",
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
                    value={guest.phoneNumber}
                    onChange={handleGuestChange}
                    placeholder="70 000 000"
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={focusGold} onBlur={blurGold}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Country</label>
                <select
                  name="country"
                  value={guest.country}
                  onChange={handleGuestChange}
                  onFocus={focusGold} onBlur={blurGold}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {COUNTRIES.map((c, i) =>
                    c.value === "" ? (
                      <option key={`div-${i}`} disabled value="" style={{ backgroundColor: MIDNIGHT, color: MUTED }}>
                        {c.label}
                      </option>
                    ) : (
                      <option key={c.value} value={c.value} style={{ backgroundColor: MIDNIGHT }}>
                        {c.label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Villa selector */}
          <div>
            <label style={labelStyle}>Villa</label>
            <select
              name="villa" required
              value={form.villa} onChange={handleFormChange}
              onFocus={focusGold} onBlur={blurGold}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="" disabled style={{ backgroundColor: MIDNIGHT }}>Select a villa</option>
              {VILLAS.map((v) => (
                <option key={v} value={v} style={{ backgroundColor: MIDNIGHT }}>{v}</option>
              ))}
            </select>
          </div>

          {/* Dates row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Check-in</label>
              <input
                name="checkIn" type="date" required
                value={form.checkIn} onChange={handleFormChange}
                onFocus={focusGold} onBlur={blurGold}
                min={new Date().toISOString().split("T")[0]}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
            <div>
              <label style={labelStyle}>Check-out</label>
              <input
                name="checkOut" type="date" required
                value={form.checkOut} onChange={handleFormChange}
                onFocus={focusGold} onBlur={blurGold}
                min={form.checkIn || new Date().toISOString().split("T")[0]}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
          </div>

          {/* Guest fields row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Guests staying overnight</label>
              <input
                name="sleepingGuests" type="number" required
                min={1} max={8}
                value={form.sleepingGuests} onChange={handleFormChange}
                onFocus={focusGold} onBlur={blurGold}
                style={inputStyle}
              />
              {sleepingCount > 6 && (
                <p style={{ fontFamily: LATO, fontSize: "11px", color: GOLD, marginTop: "6px", lineHeight: 1.5 }}>
                  Extra bedding will be arranged for additional guests.
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Expected visitors</label>
              <input
                name="dayVisitors" type="number" required
                min={0} max={25}
                value={form.dayVisitors} onChange={handleFormChange}
                onFocus={focusGold} onBlur={blurGold}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Event type */}
          <div>
            <label style={labelStyle}>
              Event type{" "}
              <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
            </label>
            <select
              name="eventType"
              value={form.eventType} onChange={handleFormChange}
              onFocus={focusGold} onBlur={blurGold}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="" style={{ backgroundColor: MIDNIGHT }}>Select type</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t} style={{ backgroundColor: MIDNIGHT }}>{t}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label style={labelStyle}>
              Special requests{" "}
              <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              name="message"
              value={form.message} onChange={handleFormChange}
              onFocus={focusGold} onBlur={blurGold}
              rows={4}
              placeholder="Any special requirements, dietary needs, or occasion details…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>

          {error && (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6 }}>
              {error}
            </p>
          )}

          {/* Disabled submit if not logged in and not in guest mode */}
          {authStatus === "none" && !guestMode ? (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", lineHeight: 1.6 }}>
              Please sign in or continue as guest to submit.
            </p>
          ) : (
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
              {loading ? "Submitting…" : "Submit booking request"}
            </button>
          )}
        </form>

        {authStatus !== "member" && !guestMode && (
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
            Already a member?{" "}
            <a
              href="/login?redirect=/book"
              style={{ color: GOLD, textDecoration: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
            >
              Sign in
            </a>
            {" "}for member benefits.
          </p>
        )}
      </div>
    </main>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookPageInner />
    </Suspense>
  );
}
