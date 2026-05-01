"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange, Matcher } from "react-day-picker";
import "react-day-picker/dist/style.css";
import OrayaEmblem from "@/components/OrayaEmblem";
import { supabase } from "@/lib/supabase";

// ─── Brand constants ──────────────────────────────────────────────────────────
const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const VILLAS   = ["Villa Mechmech", "Villa Byblos"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EVENT_TYPES: { value: string; label: string; description: string }[] = [
  { value: "Baptism / Family Gathering", label: "Baptism / Family Gathering", description: "Family-style event setup with seating, service flow, and optional hospitality add-ons." },
  { value: "Wedding / Engagement",       label: "Wedding / Engagement",       description: "Celebration-focused setup with premium add-ons, guest movement, and operational coordination." },
  { value: "Corporate Event",            label: "Corporate Event",            description: "Professional gathering setup with AV, seating, presentation, and service support." },
  { value: "Private Celebration",        label: "Private Celebration",        description: "Birthday, dinner, or private occasion with flexible add-ons and guest support." },
];

const EVENT_SERVICES = [
  "Basic seating setup",
  "Tables and chairs",
  "Umbrellas / shaded areas",
  "Catering / buffet setup",
  "Decoration support",
  "AV / sound",
  "Lighting",
  "Music coordination",
  "Photography coordination",
  "Valet",
  "Service staff coordination",
];

const EVENT_RECOMMENDATIONS: Record<string, { guidance: string; recommended: string[] }> = {
  "Baptism / Family Gathering": {
    guidance: "This type of event typically includes family seating, shaded comfort, catering flow, and light service coordination.",
    recommended: ["Basic seating setup", "Tables and chairs", "Umbrellas / shaded areas", "Catering / buffet setup", "Service staff coordination"],
  },
  "Wedding / Engagement": {
    guidance: "This type of event typically includes seating, decoration, lighting, AV, and coordinated guest flow.",
    recommended: ["Tables and chairs", "Decoration support", "Lighting", "AV / sound", "Service staff coordination"],
  },
  "Corporate Event": {
    guidance: "This type of event typically includes seating, AV support, lighting, service coordination, and a polished arrival flow.",
    recommended: ["Basic seating setup", "Tables and chairs", "AV / sound", "Lighting", "Valet"],
  },
  "Private Celebration": {
    guidance: "This type of event typically includes dining setup, decoration, music, lighting, and guest hospitality support.",
    recommended: ["Tables and chairs", "Catering / buffet setup", "Decoration support", "Music coordination", "Service staff coordination"],
  },
};

const EVENT_SERVICE_GROUPS: Array<{ title: string; services: string[] }> = [
  {
    title: "Setup & Seating",
    services: ["Basic seating setup", "Tables and chairs", "Umbrellas / shaded areas"],
  },
  {
    title: "Food & Hospitality",
    services: ["Catering / buffet setup", "Service staff coordination"],
  },
  {
    title: "Production & Atmosphere",
    services: ["Decoration support", "AV / sound", "Lighting", "Music coordination", "Photography coordination"],
  },
  {
    title: "Arrival & Guest Flow",
    services: ["Valet"],
  },
];

const DIAL_CODES = [
  { flag: "🇱🇧", label: "Lebanon",       code: "+961" },
  { flag: "🇸🇦", label: "Saudi Arabia",  code: "+966" },
  { flag: "🇦🇪", label: "UAE",           code: "+971" },
  { flag: "🇶🇦", label: "Qatar",         code: "+974" },
  { flag: "🇰🇼", label: "Kuwait",        code: "+965" },
  { flag: "🇧🇭", label: "Bahrain",       code: "+973" },
  { flag: "🇴🇲", label: "Oman",          code: "+968" },
  { flag: "🇫🇷", label: "France",        code: "+33"  },
  { flag: "🇬🇧", label: "United Kingdom",code: "+44"  },
  { flag: "🇺🇸", label: "United States", code: "+1"   },
];

const COUNTRIES = [
  "Lebanon", "Saudi Arabia", "UAE", "Qatar", "Kuwait", "Bahrain", "Oman",
  "France", "United Kingdom", "United States", "Canada", "Germany",
  "Other",
];

// ─── Shared styles ────────────────────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthStatus = "loading" | "member" | "none";
interface ConfirmedRange { check_in: string; check_out: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function nightCount(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round(
    (parseLocalISO(checkOut).getTime() - parseLocalISO(checkIn).getTime()) / 86_400_000
  ));
}

function friendlyError(msg: string): string {
  if (msg.includes("row-level security") || msg.includes("policy") || msg.includes("42501"))
    return "Unable to submit your inquiry. Please try again or contact us directly.";
  if (msg.includes("Invalid email address"))
    return "Please enter a valid email address so we can reach you about your event.";
  if (msg.includes("check_in") || msg.includes("check_out"))
    return "Please review your preferred dates before submitting.";
  if (msg.includes("JWT") || msg.includes("auth"))
    return "Session error. Please refresh the page and try again.";
  if (msg.includes("unavailable"))
    return "Those dates are no longer available. Please choose different dates and try again.";
  return msg;
}

// ─── Calendar CSS (dark-theme overrides) ──────────────────────────────────────
const CALENDAR_CSS = `
  .oraya-cal { display: flex; justify-content: center; }
  .oraya-cal .rdp {
    --rdp-cell-size: 38px;
    --rdp-accent-color: ${GOLD};
    --rdp-background-color: rgba(197,164,109,0.15);
    margin: 0;
    font-family: 'Lato', system-ui, sans-serif;
    font-size: 13px;
    color: rgba(255,255,255,0.75);
  }
  .oraya-cal .rdp-caption_label {
    font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase;
    font-weight: 400; color: ${GOLD};
  }
  .oraya-cal .rdp-head_cell {
    font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
    font-weight: 400; color: ${MUTED};
  }
  .oraya-cal .rdp-nav_button { color: ${GOLD}; }
  .oraya-cal .rdp-nav_button:hover { background-color: rgba(197,164,109,0.12); }
  .oraya-cal .rdp-day { color: rgba(255,255,255,0.75); border-radius: 2px; }
  .oraya-cal .rdp-day:hover:not([disabled]):not(.rdp-day_selected):not(.rdp-day_range_middle) {
    background-color: rgba(197,164,109,0.2); color: ${GOLD};
  }
  .oraya-cal .rdp-day_range_start, .oraya-cal .rdp-day_range_end {
    background-color: ${GOLD} !important; color: ${CHARCOAL} !important;
    font-weight: 700; border-radius: 2px !important;
  }
  .oraya-cal .rdp-day_range_middle {
    background-color: rgba(197,164,109,0.15);
    color: rgba(255,255,255,0.8); border-radius: 0;
  }
  .oraya-cal .rdp-day_disabled {
    color: rgba(255,255,255,0.2) !important;
    text-decoration: line-through; opacity: 0.5;
  }
  .oraya-cal .rdp-day_outside { color: rgba(255,255,255,0.15); }
  .oraya-cal .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
    border: 1px solid rgba(197,164,109,0.4); color: ${GOLD};
  }
  .oraya-cal .rdp-months { gap: 24px; }
  @media (max-width: 640px) {
    .oraya-cal .rdp-months { flex-direction: column; }
    .oraya-cal .rdp { --rdp-cell-size: 34px; }
  }
  @keyframes stepFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  .step-content { animation: stepFadeIn 0.25s ease forwards; }
`;

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  const labels = ["Event Basics", "Services", "Host Details", "Review"];
  return (
    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {([1, 2, 3, 4] as const).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
              border: `1px solid ${step >= s ? GOLD : "rgba(197,164,109,0.2)"}`,
              backgroundColor: step === s ? GOLD : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: LATO, fontSize: "10px",
              color: step === s ? CHARCOAL : step > s ? GOLD : "rgba(197,164,109,0.3)",
              transition: "background-color 0.2s, border-color 0.2s",
            }}>
              {step > s ? "✓" : s}
            </div>
            {i < 3 && (
              <div style={{
                width: "40px", height: "0.5px",
                backgroundColor: step > s ? GOLD : "rgba(197,164,109,0.15)",
                transition: "background-color 0.2s",
              }} />
            )}
          </div>
        ))}
      </div>
      <p style={{
        fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px",
        textTransform: "uppercase", color: GOLD, marginTop: "10px", marginBottom: 0,
      }}>
        {labels[step - 1]}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function EventInquiryPageInner() {
  const router = useRouter();

  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [memberName, setMemberName] = useState("");

  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    villa:          "",
    eventType:      "",
    sleepingGuests: "2",
    dayVisitors:    "20",
    message:        "",
  });

  const [eventServices, setEventServices] = useState<string[]>([]);
  const [dateRange,     setDateRange]     = useState<DateRange | undefined>();

  const [guest, setGuest] = useState({
    fullName:    "",
    email:       "",
    dialCode:    "+961",
    phoneNumber: "",
    country:     "Lebanon",
  });

  const [confirmedRanges, setConfirmedRanges] = useState<ConfirmedRange[]>([]);
  const [error,           setError]           = useState("");
  const [loading,         setLoading]         = useState(false);

  // Auth check on mount
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setAuthStatus("member");
        const { data } = await supabase
          .from("members").select("full_name").eq("id", user.id).single();
        if (data?.full_name) setMemberName(data.full_name);
      } else {
        setAuthStatus("none");
      }
    });
  }, []);

  // Reload availability whenever villa changes
  useEffect(() => {
    setDateRange(undefined);
    if (!form.villa) { setConfirmedRanges([]); return; }
    fetch(`/api/bookings/availability?villa=${encodeURIComponent(form.villa)}`)
      .then(r => r.json())
      .then(d => setConfirmedRanges(Array.isArray(d.ranges) ? d.ranges : []))
      .catch(() => setConfirmedRanges([]));
  }, [form.villa]);

  // ── Derived values ────────────────────────────────────────────────────────
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const bookedRangeList: Array<{ from: Date; to: Date }> = confirmedRanges.flatMap(r => {
    const from = parseLocalISO(r.check_in);
    const to   = parseLocalISO(r.check_out);
    to.setDate(to.getDate() - 1);
    if (to < from) return [];
    return [{ from, to }];
  });

  function isCalendarDateBlocked(d: Date): boolean {
    if (d < today) return true;
    return bookedRangeList.some(r => d >= r.from && d <= r.to);
  }

  const disabledDays: Matcher[] = [
    { before: today },
    ...bookedRangeList,
  ];

  const checkIn  = dateRange?.from ? toISO(dateRange.from) : "";
  const checkOut = dateRange?.to   ? toISO(dateRange.to)   : "";
  const nights   = nightCount(checkIn, checkOut);
  const selectedEventRecommendation = form.eventType ? EVENT_RECOMMENDATIONS[form.eventType] : null;
  const serviceIntent = (() => {
    const count = eventServices.length;
    if (count <= 2) return "Basic";
    if (count >= 7) return "Premium";
    return "Full setup";
  })();

  const guestEmail = guest.email.trim();
  const guestEmailInvalid = authStatus !== "member" && guestEmail.length > 0 && !EMAIL_RE.test(guestEmail);

  // ── Event handlers ────────────────────────────────────────────────────────
  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleGuestChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setGuest(g => ({ ...g, [e.target.name]: e.target.value }));
  }

  function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = GOLD;
  }
  function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)";
  }

  function handleDateSelect(nextRange: DateRange | undefined) {
    if (nextRange?.from && nextRange.to) {
      // Validate continuous range (no booked nights inside)
      for (let n = new Date(nextRange.from.getTime()); n < nextRange.to; n.setDate(n.getDate() + 1)) {
        if (isCalendarDateBlocked(n)) {
          setDateRange(undefined);
          setError("Those dates overlap an existing booking. Please choose different dates.");
          return;
        }
      }
    }
    setError("");
    setDateRange(nextRange);
  }

  function toggleService(service: string) {
    setEventServices(prev =>
      prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]
    );
  }

  function addRecommendedServices(services: string[]) {
    setEventServices(prev => Array.from(new Set([...prev, ...services])));
    setError("");
  }

  function goNext() {
    setError("");
    if (step === 1) {
      if (!form.villa)               { setError("Please select a villa preference before continuing."); return; }
      if (!form.eventType)           { setError("Please choose an event type before continuing."); return; }
      if (!checkIn)                  { setError("Please select your preferred date(s) to continue."); return; }
      if (!checkOut)                 { setError("Please select an end date for your event window."); return; }
      const attendees = parseInt(form.dayVisitors, 10);
      if (!Number.isFinite(attendees) || attendees < 1) {
        setError("Please enter the expected number of attendees."); return;
      }
    }
    if (step === 3) {
      const sleeping = parseInt(form.sleepingGuests, 10);
      if (!sleeping || sleeping < 1) { setError("Please enter the host overnight stay count (at least 1)."); return; }
      if (authStatus !== "member") {
        if (!guest.fullName.trim())                  { setError("Please enter your full name so we know who to contact."); return; }
        if (!guestEmail)                             { setError("Please enter your email address so we can reach you about your event."); return; }
        if (!EMAIL_RE.test(guestEmail))              { setError("Please enter a valid email address."); return; }
      }
    }
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError("");
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (authStatus !== "member" && !EMAIL_RE.test(guestEmail)) {
        throw new Error("Invalid email address.");
      }

      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.error("[events] auth.getUser error:", authErr);

      let accessToken: string | null = null;
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? null;
      }

      // Compose structured [Event Inquiry] notes block in the existing message field.
      const userNotes = (form.message ?? "").replace(/\n*\[Event Inquiry][\s\S]*$/, "").trim();
      const block: string[] = ["[Event Inquiry]"];
      if (form.eventType)            block.push(`Event Type: ${form.eventType}`);
      block.push(`Preferred Date(s): ${checkIn} → ${checkOut} (${nights} ${nights === 1 ? "night" : "nights"})`);
      if (form.dayVisitors)          block.push(`Expected Attendees: ${form.dayVisitors}`);
      if (form.sleepingGuests)       block.push(`Overnight Hosts: ${form.sleepingGuests}`);
      if (eventServices.length > 0)  block.push(`Requested Services: ${eventServices.join(", ")}`);
      block.push(`Service Intent: ${serviceIntent}`);
      block.push(`Notes: ${userNotes || "None"}`);
      const composedMessage = block.join("\n");

      const body: Record<string, unknown> = {
        villa:           form.villa,
        check_in:        checkIn,
        check_out:       checkOut,
        sleeping_guests: form.sleepingGuests,
        day_visitors:    form.dayVisitors,
        event_type:      form.eventType || null,
        message:         composedMessage,
        addons:          [],
      };
      if (user) {
        body.member_id = user.id;
      } else {
        body.guest_name    = guest.fullName.trim();
        body.guest_email   = guest.email.trim();
        body.guest_phone   = guest.phoneNumber ? `${guest.dialCode}${guest.phoneNumber}` : null;
        body.guest_country = guest.country || null;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res  = await fetch("/api/bookings", { method: "POST", headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to submit your event inquiry.");

      const booking     = json.booking;
      const displayName = user ? memberName : guest.fullName;
      const params      = new URLSearchParams({
        villa:          form.villa,
        checkIn,
        checkOut,
        sleepingGuests: form.sleepingGuests,
        dayVisitors:    form.dayVisitors,
        eventType:      form.eventType,
        id:             booking?.id ?? "",
        ...(displayName ? { name: displayName } : {}),
      });
      router.push(`/booking-confirmed?${params.toString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[events] submission error:", err);
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (authStatus === "loading") {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
        <div style={{ width: "100%", maxWidth: "720px", margin: "0 auto" }} aria-hidden="true">
          <div style={{ width: "52px", margin: "0 auto 2.5rem", opacity: 0.45 }}><OrayaEmblem /></div>
          <p style={{ textAlign: "center", color: MUTED, fontFamily: LATO, fontSize: "12px" }}>Loading…</p>
        </div>
      </main>
    );
  }

  const containerWidth = step === 1 && form.villa ? "720px" : "560px";

  return (
    <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
      <style>{CALENDAR_CSS}</style>

      <div style={{ width: "100%", maxWidth: containerWidth, margin: "0 auto", transition: "max-width 0.3s ease" }}>

        {/* Logo */}
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        {/* Page heading */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Event Inquiry
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 10px" }}>
            Plan Your Event
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.7, margin: 0 }}>
            Tell us what you are planning. We will review availability, setup, and services, and respond within 24 hours with a tailored proposal.
          </p>
        </div>

        {/* Standing inquiry banner */}
        <div style={{ border: "0.5px solid rgba(197,164,109,0.25)", backgroundColor: "rgba(197,164,109,0.06)", padding: "12px 16px", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6, flex: 1, minWidth: "240px" }}>
            This is an inquiry, not an instant booking. Event inquiries are reviewed as a full venue request, including guest flow, setup areas, and operational requirements.
          </p>
          <a
            href="/book"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.3)", padding: "8px 14px", textDecoration: "none", whiteSpace: "nowrap" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = GOLD; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.3)"; (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Book a stay instead
          </a>
        </div>

        {/* Auth identity banner */}
        {authStatus === "member" ? (
          <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "0.875rem 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Inquiring as <span style={{ color: GOLD }}>{memberName || "member"}</span>
            </p>
            <a href="/login" style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; }}>
              Not you?
            </a>
          </div>
        ) : null}

        <StepIndicator step={step} />

        <div key={step} className="step-content">

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Event Basics: villa + event type + dates + attendees
          ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Villa preference */}
              <div>
                <p style={{ ...labelStyle, marginBottom: "10px" }}>Villa preference</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                  {VILLAS.map(villa => {
                    const selected = form.villa === villa;
                    return (
                      <button
                        key={villa}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, villa })); setError(""); }}
                        style={{
                          fontFamily: LATO, fontSize: "12px",
                          padding: "12px 14px", textAlign: "left",
                          border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.2)"}`,
                          backgroundColor: selected ? "rgba(197,164,109,0.1)" : "rgba(255,255,255,0.02)",
                          color: selected ? WHITE : "rgba(255,255,255,0.7)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        {villa}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Event type */}
              <div>
                <p style={{ ...labelStyle, marginBottom: "12px" }}>Event Type</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {EVENT_TYPES.map(et => {
                    const selected = form.eventType === et.value;
                    return (
                      <button
                        key={et.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, eventType: selected ? "" : et.value }))}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: "12px",
                          padding: "14px 16px", textAlign: "left", width: "100%",
                          border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                          backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        <div style={{
                          width: "16px", height: "16px", flexShrink: 0, marginTop: "2px",
                          border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.3)"}`,
                          backgroundColor: selected ? GOLD : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {selected && <span style={{ color: CHARCOAL, fontSize: "10px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: LATO, fontSize: "13px", color: selected ? WHITE : "rgba(255,255,255,0.7)", margin: "0 0 4px", fontWeight: selected ? 400 : 300 }}>
                            {et.label}
                          </p>
                          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                            {et.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedEventRecommendation && (
                  <div style={{ marginTop: "14px", border: "0.5px solid rgba(197,164,109,0.22)", backgroundColor: "rgba(197,164,109,0.05)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                        {form.eventType}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.65 }}>
                        {selectedEventRecommendation.guidance}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                        Recommended
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {selectedEventRecommendation.recommended.map((service) => (
                          <span
                            key={service}
                            style={{
                              fontFamily: LATO,
                              fontSize: "11px",
                              color: eventServices.includes(service) ? WHITE : "rgba(255,255,255,0.72)",
                              border: `0.5px solid ${eventServices.includes(service) ? GOLD : "rgba(197,164,109,0.18)"}`,
                              backgroundColor: eventServices.includes(service) ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                              padding: "7px 10px",
                            }}
                          >
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addRecommendedServices(selectedEventRecommendation.recommended)}
                      style={{ alignSelf: "flex-start", fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "11px 18px", cursor: "pointer" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                    >
                      Add recommended services
                    </button>
                  </div>
                )}
              </div>

              {/* Calendar — only after villa selected */}
              {form.villa ? (
                <div>
                  <p style={{ ...labelStyle, marginBottom: "10px" }}>Preferred date(s)</p>
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
                    Choose your preferred event window. Oraya will confirm availability with the final proposal.
                  </p>
                  <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.01)", padding: "1.25rem" }}>
                    <div className="oraya-cal">
                      <DayPicker
                        mode="range"
                        selected={dateRange}
                        onSelect={handleDateSelect}
                        disabled={disabledDays}
                        numberOfMonths={2}
                        fromDate={today}
                        showOutsideDays
                      />
                    </div>
                  </div>

                  {checkIn && (
                    <div style={{ marginTop: "14px", padding: "14px 20px", border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", display: "flex", flexWrap: "wrap", gap: "28px" }}>
                      <div>
                        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Start</p>
                        <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkIn)}</p>
                      </div>
                      {checkOut ? (
                        <>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>End</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkOut)}</p>
                          </div>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Window</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: GOLD, margin: 0 }}>
                              {nights} {nights === 1 ? "night" : "nights"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>Now select an end date</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ border: "0.5px dashed rgba(197,164,109,0.15)", padding: "2rem", textAlign: "center" }}>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, letterSpacing: "0.5px" }}>
                    Select a villa preference to view dates
                  </p>
                </div>
              )}

              {/* Expected attendees */}
              <div>
                <label style={labelStyle}>Expected number of attendees</label>
                <input
                  name="dayVisitors"
                  type="number"
                  required
                  min={1}
                  max={300}
                  value={form.dayVisitors}
                  onChange={handleFormChange}
                  onFocus={focusGold}
                  onBlur={blurGold}
                  style={inputStyle}
                  placeholder="e.g. 60"
                />
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "6px", lineHeight: 1.5 }}>
                  This is your estimate. Final attendee capacity is reviewed by Oraya based on the event area.
                </p>
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                onClick={goNext}
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — Services & Setup Requirements
          ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              <div>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                  Services &amp; Setup Requirements
                </p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 16px", lineHeight: 1.6 }}>
                  Select the services you may need. Oraya will review and confirm the final setup.
                </p>
                {selectedEventRecommendation && (
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.6)", margin: "0 0 16px", lineHeight: 1.6 }}>
                    Recommended for {form.eventType}: {selectedEventRecommendation.recommended.join(", ")}.
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "16px" }}>
                  {EVENT_SERVICE_GROUPS.map((group) => (
                    <div key={group.title}>
                      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
                        {group.title}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                        {group.services.map(service => {
                          const selected = eventServices.includes(service);
                          return (
                            <button
                              key={`${group.title}-${service}`}
                              type="button"
                              onClick={() => toggleService(service)}
                              style={{
                                display: "flex", alignItems: "center", gap: "10px",
                                padding: "12px 14px", textAlign: "left",
                                border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                                backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                                cursor: "pointer",
                                transition: "border-color 0.15s, background-color 0.15s",
                              }}
                            >
                              <div style={{
                                width: "14px", height: "14px", flexShrink: 0,
                                border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.3)"}`,
                                backgroundColor: selected ? GOLD : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {selected && <span style={{ color: CHARCOAL, fontSize: "9px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontFamily: LATO, fontSize: "12px", color: selected ? WHITE : "rgba(255,255,255,0.75)" }}>
                                {service}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "none" }} aria-hidden="true">
                  {EVENT_SERVICES.map(service => {
                    const selected = eventServices.includes(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => toggleService(service)}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "12px 14px", textAlign: "left",
                          border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                          backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        <div style={{
                          width: "14px", height: "14px", flexShrink: 0,
                          border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.3)"}`,
                          backgroundColor: selected ? GOLD : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {selected && <span style={{ color: CHARCOAL, fontSize: "9px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontFamily: LATO, fontSize: "12px", color: selected ? WHITE : "rgba(255,255,255,0.75)" }}>
                          {service}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Inquiry-only copy */}
              <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", backgroundColor: "rgba(197,164,109,0.04)", padding: "12px 16px" }}>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
                  Oraya will review your event requirements and respond within 24 hours with availability, setup options, and a tailored proposal.
                </p>
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: "pointer" }}>
                  ← Back
                </button>
                <button onClick={goNext}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: "pointer" }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Host Details: overnight hosts + contact + notes
          ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              <div>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                  Host Details
                </p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 6px", lineHeight: 1.6 }}>
                  Event packages include overnight stay for the hosts. Oraya will review the full package before confirmation.
                </p>
              </div>

              {/* Overnight hosts */}
              <div>
                <label style={labelStyle}>Host overnight stay</label>
                <input
                  name="sleepingGuests"
                  type="number"
                  required
                  min={1}
                  max={8}
                  value={form.sleepingGuests}
                  onChange={handleFormChange}
                  onFocus={focusGold}
                  onBlur={blurGold}
                  style={inputStyle}
                />
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "6px", lineHeight: 1.5 }}>
                  Event packages include overnight stay for the hosts. Oraya will review the full package before confirmation.
                </p>
              </div>

              {/* Guest contact (when not member) */}
              {authStatus !== "member" && (
                <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(255,255,255,0.02)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                    Your contact details
                  </p>

                  <div>
                    <label style={labelStyle}>Full name</label>
                    <input name="fullName" type="text" required value={guest.fullName} onChange={handleGuestChange}
                      placeholder="Your full name" style={inputStyle} onFocus={focusGold} onBlur={blurGold} />
                  </div>

                  <div>
                    <label style={labelStyle}>Email address</label>
                    <input name="email" type="email" required value={guest.email} onChange={handleGuestChange}
                      placeholder="you@example.com"
                      style={{ ...inputStyle, borderColor: guestEmailInvalid ? "#e07070" : "rgba(197,164,109,0.25)" }}
                      onFocus={focusGold} onBlur={blurGold} />
                    {guestEmailInvalid && (
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070", marginTop: "6px", lineHeight: 1.5 }}>
                        Please enter a valid email address.
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Phone number{" "}
                      <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <div style={{ display: "flex" }}>
                      <select name="dialCode" value={guest.dialCode} onChange={handleGuestChange}
                        onFocus={focusGold} onBlur={blurGold}
                        style={{ ...inputStyle, width: "auto", flexShrink: 0, paddingRight: "10px", borderRight: "none", cursor: "pointer", minWidth: "120px" }}>
                        {DIAL_CODES.map(d => (
                          <option key={`${d.code}-${d.label}`} value={d.code} style={{ backgroundColor: MIDNIGHT }}>{d.flag} {d.code}</option>
                        ))}
                      </select>
                      <input name="phoneNumber" type="tel" value={guest.phoneNumber} onChange={handleGuestChange}
                        placeholder="70 000 000" style={{ ...inputStyle, flex: 1 }} onFocus={focusGold} onBlur={blurGold} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Country</label>
                    <select name="country" value={guest.country} onChange={handleGuestChange}
                      onFocus={focusGold} onBlur={blurGold} style={{ ...inputStyle, cursor: "pointer" }}>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c} style={{ backgroundColor: MIDNIGHT }}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={labelStyle}>
                  Notes / special requests{" "}
                  <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                </label>
                <textarea name="message" value={form.message} onChange={handleFormChange}
                  onFocus={focusGold} onBlur={blurGold}
                  rows={4}
                  placeholder="Tell us more about your event — theme, timing, dietary needs, or anything else we should know…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: "pointer" }}>
                  ← Back
                </button>
                <button onClick={goNext}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: "pointer" }}>
                  Review →
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 4 — Review & Submit
          ════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              <div>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 14px" }}>
                  Event Inquiry Summary
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
                  <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.25rem", backgroundColor: "rgba(255,255,255,0.015)" }}>
                    <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", fontWeight: 400, color: WHITE, margin: "0 0 12px" }}>
                      Event Overview
                    </p>
                    {(
                      [
                        ["Villa preference", form.villa],
                        ["Preferred dates", `${fmtDate(checkIn)} to ${fmtDate(checkOut)}`],
                        ["Window", `${nights} ${nights === 1 ? "night" : "nights"}`],
                        ["Event type", form.eventType],
                        ["Attendees", form.dayVisitors],
                        ["Hosts overnight stay", form.sleepingGuests],
                      ] as [string, string][]
                    ).map(([label, value]) => {
                      const isHighlight = label === "Event type" || label === "Attendees" || label === "Hosts overnight stay";
                      return (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: isHighlight ? "12px 0" : "9px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)", gap: "16px" }}>
                          <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0, paddingRight: "16px" }}>
                            {label}
                          </span>
                          <span style={{ fontFamily: LATO, fontSize: isHighlight ? "14px" : "13px", color: isHighlight ? GOLD : WHITE, fontWeight: isHighlight ? 400 : 300, textAlign: "right", lineHeight: 1.5, maxWidth: "60%" }}>
                            {value}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.25rem", backgroundColor: "rgba(255,255,255,0.015)" }}>
                    <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", fontWeight: 400, color: WHITE, margin: "0 0 12px" }}>
                      Services Requested
                    </p>
                    {eventServices.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {eventServices.map((service) => (
                          <span key={service} style={{ fontFamily: LATO, fontSize: "11px", color: WHITE, border: "0.5px solid rgba(197,164,109,0.22)", backgroundColor: "rgba(197,164,109,0.05)", padding: "7px 10px" }}>
                            {service}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
                        No services selected yet. Oraya can still recommend setup options after review.
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: "none" }} aria-hidden="true">
                  {(
                    [
                      ["Villa preference",   form.villa],
                      ["Event type",         form.eventType],
                      ["Preferred dates",    `${fmtDate(checkIn)} → ${fmtDate(checkOut)}`],
                      ["Window",             `${nights} ${nights === 1 ? "night" : "nights"}`],
                      ["Expected attendees", form.dayVisitors],
                      ["Host overnight stay", form.sleepingGuests],
                      ...(eventServices.length > 0 ? [["Requested services", eventServices.join(", ")]] : []),
                      ...(form.message ? [["Notes", form.message]] : []),
                      ...(authStatus !== "member" ? [["Name", guest.fullName], ["Email", guest.email]] : []),
                    ] as [string, string][]
                  ).map(([label, value]) => {
                    const isHighlight = label === "Event type" || label === "Preferred dates" || label === "Expected attendees" || label === "Host overnight stay";
                    return (
                      <div key={label} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        padding: isHighlight ? "12px 0" : "9px 0",
                        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                        gap: "16px",
                      }}>
                        <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0, paddingRight: "16px" }}>
                          {label}
                        </span>
                        <span style={{
                          fontFamily: LATO,
                          fontSize: isHighlight ? "14px" : "13px",
                          color: isHighlight ? GOLD : WHITE,
                          fontWeight: isHighlight ? 400 : 300,
                          textAlign: "right",
                          lineHeight: 1.5,
                          maxWidth: "60%",
                        }}>
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Event package + no pricing copy */}
              <div style={{ border: "0.5px solid rgba(197,164,109,0.22)", backgroundColor: "rgba(197,164,109,0.04)", padding: "16px 20px" }}>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
                  Event Package
                </p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.75)", margin: "0 0 8px", lineHeight: 1.6 }}>
                  This request will be reviewed as a full event setup and you will receive a tailored proposal.
                </p>
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Submitting…" : "Submit Event Inquiry"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

export default function EventInquiryPage() {
  return (
    <Suspense fallback={null}>
      <EventInquiryPageInner />
    </Suspense>
  );
}

