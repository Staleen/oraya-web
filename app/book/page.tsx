"use client";
import { useState } from "react";
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

const VILLAS = ["Villa Mechmech", "Villa Byblos"];
const EVENT_TYPES = ["Stay", "Wedding", "Baptism", "Corporate"];

export default function BookPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    villa: "",
    checkIn: "",
    checkOut: "",
    guests: "2",
    eventType: "",
    message: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
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

    if (!form.villa) { setError("Please select a villa."); return; }
    if (form.checkOut <= form.checkIn) { setError("Check-out must be after check-in."); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error: insertError } = await supabase.from("bookings").insert({
        member_id: user?.id ?? null,
        villa: form.villa,
        check_in: form.checkIn,
        check_out: form.checkOut,
        guests: parseInt(form.guests, 10),
        event_type: form.eventType || null,
        message: form.message || null,
        status: "pending",
      }).select().single();

      if (insertError) throw insertError;

      const params = new URLSearchParams({
        villa: form.villa,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guests: form.guests,
        eventType: form.eventType,
        id: data?.id ?? "",
      });
      router.push(`/booking-confirmed?${params.toString()}`);
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

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: MIDNIGHT, padding: "80px 24px" }}
    >
      <div style={{ width: "100%", maxWidth: "520px" }}>
        {/* Logo */}
        <div style={{ width: "52px", margin: "0 auto 2.5rem" }}>
          <OrayaEmblem />
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Reservations
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: 0 }}>
            Request a booking
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, marginTop: "10px", lineHeight: 1.7 }}>
            Submit your dates and we'll confirm availability within 24 hours.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Villa selector */}
          <div>
            <label style={labelStyle}>Villa</label>
            <select
              name="villa"
              required
              value={form.villa}
              onChange={handleChange}
              onFocus={focusGold}
              onBlur={blurGold}
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
                name="checkIn"
                type="date"
                required
                value={form.checkIn}
                onChange={handleChange}
                onFocus={focusGold}
                onBlur={blurGold}
                min={new Date().toISOString().split("T")[0]}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
            <div>
              <label style={labelStyle}>Check-out</label>
              <input
                name="checkOut"
                type="date"
                required
                value={form.checkOut}
                onChange={handleChange}
                onFocus={focusGold}
                onBlur={blurGold}
                min={form.checkIn || new Date().toISOString().split("T")[0]}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
          </div>

          {/* Guests */}
          <div>
            <label style={labelStyle}>Number of guests</label>
            <input
              name="guests"
              type="number"
              required
              min={1}
              max={50}
              value={form.guests}
              onChange={handleChange}
              onFocus={focusGold}
              onBlur={blurGold}
              style={inputStyle}
            />
          </div>

          {/* Event type */}
          <div>
            <label style={labelStyle}>Event type <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span></label>
            <select
              name="eventType"
              value={form.eventType}
              onChange={handleChange}
              onFocus={focusGold}
              onBlur={blurGold}
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
            <label style={labelStyle}>Special requests <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span></label>
            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              onFocus={focusGold}
              onBlur={blurGold}
              rows={4}
              placeholder="Any special requirements, dietary needs, or occasion details…"
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.6,
              }}
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
            {loading ? "Submitting…" : "Submit booking request"}
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
          {" "}for member pricing.
        </p>
      </div>
    </main>
  );
}
