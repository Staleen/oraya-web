"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

// ─── Static data ──────────────────────────────────────────────────────────────
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
  { flag: "🇱🇧", label: "Lebanon",        code: "+961" },
  { flag: "🇸🇦", label: "Saudi Arabia",   code: "+966" },
  { flag: "🇦🇪", label: "UAE",            code: "+971" },
  { flag: "🇫🇷", label: "France",         code: "+33"  },
  { flag: "🇺🇸", label: "United States",  code: "+1"   },
  { flag: "──",  label: "──────────────", code: ""     },
  { flag: "🇩🇿", label: "Algeria",        code: "+213" },
  { flag: "🇦🇷", label: "Argentina",      code: "+54"  },
  { flag: "🇦🇺", label: "Australia",      code: "+61"  },
  { flag: "🇦🇹", label: "Austria",        code: "+43"  },
  { flag: "🇧🇪", label: "Belgium",        code: "+32"  },
  { flag: "🇧🇷", label: "Brazil",         code: "+55"  },
  { flag: "🇨🇦", label: "Canada",         code: "+1"   },
  { flag: "🇨🇳", label: "China",          code: "+86"  },
  { flag: "🇨🇾", label: "Cyprus",         code: "+357" },
  { flag: "🇩🇰", label: "Denmark",        code: "+45"  },
  { flag: "🇪🇬", label: "Egypt",          code: "+20"  },
  { flag: "🇩🇪", label: "Germany",        code: "+49"  },
  { flag: "🇬🇷", label: "Greece",         code: "+30"  },
  { flag: "🇮🇳", label: "India",          code: "+91"  },
  { flag: "🇮🇶", label: "Iraq",           code: "+964" },
  { flag: "🇮🇪", label: "Ireland",        code: "+353" },
  { flag: "🇮🇹", label: "Italy",          code: "+39"  },
  { flag: "🇯🇴", label: "Jordan",         code: "+962" },
  { flag: "🇰🇼", label: "Kuwait",         code: "+965" },
  { flag: "🇲🇽", label: "Mexico",         code: "+52"  },
  { flag: "🇲🇦", label: "Morocco",        code: "+212" },
  { flag: "🇳🇱", label: "Netherlands",    code: "+31"  },
  { flag: "🇳🇿", label: "New Zealand",    code: "+64"  },
  { flag: "🇳🇬", label: "Nigeria",        code: "+234" },
  { flag: "🇳🇴", label: "Norway",         code: "+47"  },
  { flag: "🇴🇲", label: "Oman",           code: "+968" },
  { flag: "🇵🇰", label: "Pakistan",       code: "+92"  },
  { flag: "🇵🇸", label: "Palestine",      code: "+970" },
  { flag: "🇵🇱", label: "Poland",         code: "+48"  },
  { flag: "🇵🇹", label: "Portugal",       code: "+351" },
  { flag: "🇶🇦", label: "Qatar",          code: "+974" },
  { flag: "🇷🇺", label: "Russia",         code: "+7"   },
  { flag: "🇸🇳", label: "Senegal",        code: "+221" },
  { flag: "🇿🇦", label: "South Africa",   code: "+27"  },
  { flag: "🇪🇸", label: "Spain",          code: "+34"  },
  { flag: "🇸🇩", label: "Sudan",          code: "+249" },
  { flag: "🇸🇪", label: "Sweden",         code: "+46"  },
  { flag: "🇨🇭", label: "Switzerland",    code: "+41"  },
  { flag: "🇸🇾", label: "Syria",          code: "+963" },
  { flag: "🇹🇳", label: "Tunisia",        code: "+216" },
  { flag: "🇹🇷", label: "Turkey",         code: "+90"  },
  { flag: "🇬🇧", label: "United Kingdom", code: "+44"  },
  { flag: "🇾🇪", label: "Yemen",          code: "+967" },
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

interface Addon {
  id:            string;
  label:         string;
  enabled:       boolean;
  currency:      string;
  price:         number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
}

const PRICING_MODEL_LABELS: Record<string, string> = {
  flat_fee:            "Flat fee",
  per_night:           "Per night",
  per_person_per_day:  "Per person / day",
  per_unit:            "Per unit",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Local-date-aware ISO formatter — avoids UTC timezone shifts. */
function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

/** Parse an ISO date string into a local Date (no UTC conversion). */
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
    return "Unable to submit booking. Please try again or contact us directly.";
  if (msg.includes("check_in") || msg.includes("check_out"))
    return "Invalid dates selected. Please check your check-in and check-out.";
  if (msg.includes("JWT") || msg.includes("auth"))
    return "Session error. Please refresh the page and try again.";
  return msg;
}

// ─── Calendar CSS (dark-theme overrides for react-day-picker) ─────────────────
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

  /* Caption (month/year) */
  .oraya-cal .rdp-caption_label {
    font-size: 11px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    font-weight: 400;
    color: ${GOLD};
  }

  /* Day-of-week header row */
  .oraya-cal .rdp-head_cell {
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: 400;
    color: ${MUTED};
  }

  /* Nav arrows */
  .oraya-cal .rdp-nav_button { color: ${GOLD}; }
  .oraya-cal .rdp-nav_button:hover { background-color: rgba(197,164,109,0.12); }

  /* Regular day */
  .oraya-cal .rdp-day { color: rgba(255,255,255,0.75); border-radius: 2px; }
  .oraya-cal .rdp-day:hover:not([disabled]):not(.rdp-day_selected):not(.rdp-day_range_middle) {
    background-color: rgba(197,164,109,0.2);
    color: ${GOLD};
  }

  /* Range endpoints */
  .oraya-cal .rdp-day_range_start,
  .oraya-cal .rdp-day_range_end {
    background-color: ${GOLD} !important;
    color: ${CHARCOAL} !important;
    font-weight: 700;
    border-radius: 2px !important;
  }

  /* Range middle */
  .oraya-cal .rdp-day_range_middle {
    background-color: rgba(197,164,109,0.15);
    color: rgba(255,255,255,0.8);
    border-radius: 0;
  }

  /* Disabled (past + booked) */
  .oraya-cal .rdp-day_disabled {
    color: rgba(255,255,255,0.2) !important;
    text-decoration: line-through;
    opacity: 0.5;
  }

  /* Outside (adjacent-month days) */
  .oraya-cal .rdp-day_outside { color: rgba(255,255,255,0.15); }

  /* Today highlight */
  .oraya-cal .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
    border: 1px solid rgba(197,164,109,0.4);
    color: ${GOLD};
  }

  /* Multi-month gap */
  .oraya-cal .rdp-months { gap: 24px; }

  /* Mobile: stack months */
  @media (max-width: 640px) {
    .oraya-cal .rdp-months { flex-direction: column; }
    .oraya-cal .rdp { --rdp-cell-size: 34px; }
  }

  /* Step transition */
  @keyframes stepFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  .step-content { animation: stepFadeIn 0.25s ease forwards; }
`;

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  const labels = ["Villa & Dates", "Stay Details", "Review"];
  return (
    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {([1, 2, 3] as const).map((s, i) => (
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
            {i < 2 && (
              <div style={{
                width: "52px", height: "0.5px",
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
function BookPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Auth
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [memberName, setMemberName] = useState("");
  const [guestMode, setGuestMode]   = useState(false);

  // Step
  const [step, setStep] = useState(1);

  // Form (persisted across steps)
  const [form, setForm] = useState({
    villa:          "",
    sleepingGuests: "2",
    dayVisitors:    "0",
    eventType:      "",
    message:        "",
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Guest contact (shown on step 2 when guestMode)
  const [guest, setGuest] = useState({
    fullName:    "",
    email:       "",
    dialCode:    "+961",
    phoneNumber: "",
    country:     "Lebanon",
  });

  // Availability
  const [confirmedRanges, setConfirmedRanges] = useState<ConfirmedRange[]>([]);

  // Add-ons
  const [addons,         setAddons]         = useState<Addon[]>([]);
  const [addonsLoading,  setAddonsLoading]  = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  // UI
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-select villa from ?villa= query param
  useEffect(() => {
    const v = searchParams.get("villa");
    if (v && VILLAS.includes(v)) setForm(f => ({ ...f, villa: v }));
  }, [searchParams]);

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

  // Fetch enabled add-ons the first time the user reaches step 3
  useEffect(() => {
    if (step !== 3 || addons.length > 0) return;
    setAddonsLoading(true);
    fetch("/api/addons")
      .then(r => r.json())
      .then(d => setAddons((d.addons as Addon[] ?? []).filter(a => a.enabled)))
      .catch(() => setAddons([]))
      .finally(() => setAddonsLoading(false));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload availability whenever villa changes; also clear the date selection
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

  /**
   * Blocked day ranges for the calendar.
   * We disable from check_in through (check_out - 1 day) inclusive so that
   * the check_out date itself remains selectable as a new check-in.
   */
  const disabledDays: Matcher[] = [
    { before: today },
    ...confirmedRanges.flatMap(r => {
      const from = parseLocalISO(r.check_in);
      const to   = parseLocalISO(r.check_out);
      to.setDate(to.getDate() - 1); // last occupied night, not checkout day
      if (to < from) return []; // single-night stay edge case handled
      return [{ from, to } as Matcher];
    }),
  ];

  const checkIn  = dateRange?.from ? toISO(dateRange.from) : "";
  const checkOut = dateRange?.to   ? toISO(dateRange.to)   : "";
  const nights   = nightCount(checkIn, checkOut);

  const dateConflict: string = (() => {
    if (!checkIn || !checkOut) return "";
    for (const r of confirmedRanges) {
      if (checkIn < r.check_out && checkOut > r.check_in)
        return `${form.villa} is already booked ${fmtDate(r.check_in)} – ${fmtDate(r.check_out)}. Please choose different dates.`;
    }
    return "";
  })();

  // ── Event handlers ────────────────────────────────────────────────────────
  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  function handleGuestChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) { setGuest(g => ({ ...g, [e.target.name]: e.target.value })); }

  function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = GOLD;
  }
  function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)";
  }

  function goNext() {
    setError("");
    if (step === 1) {
      if (!form.villa)         { setError("Please select a villa.");                           return; }
      if (!checkIn)            { setError("Please select your check-in and check-out dates."); return; }
      if (!checkOut)           { setError("Please also select a check-out date.");             return; }
      if (checkOut <= checkIn) { setError("Check-out must be after check-in.");                return; }
      if (dateConflict)        { setError(dateConflict);                                       return; }
    }
    if (step === 2) {
      if (guestMode && !guest.fullName.trim()) { setError("Please enter your full name.");      return; }
      if (guestMode && !guest.email.trim())    { setError("Please enter your email address.");  return; }
      const sleeping = parseInt(form.sleepingGuests, 10);
      if (!sleeping || sleeping < 1)           { setError("At least 1 sleeping guest is required."); return; }
    }
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleAddon(id: string) {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
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
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.error("[book] auth.getUser error:", authErr);

      let accessToken: string | null = null;
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? null;
      }

      // Build structured addons payload (id + label + metadata, no price calculation)
      const selectedAddonObjects = selectedAddons
        .map(id => addons.find(a => a.id === id))
        .filter((a): a is Addon => Boolean(a))
        .map(({ id, label, pricing_model, currency, price }) => ({
          id, label, pricing_model, currency, price,
        }));

      const body: Record<string, unknown> = {
        villa:           form.villa,
        check_in:        checkIn,
        check_out:       checkOut,
        sleeping_guests: form.sleepingGuests,
        day_visitors:    form.dayVisitors,
        event_type:      form.eventType || null,
        message:         form.message   || null,
        addons:          selectedAddonObjects,
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
      if (!res.ok) throw new Error(json.error ?? "Failed to submit booking.");

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
      console.error("[book] submission error:", err);
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  // ── Auth loading spinner ──────────────────────────────────────────────────
  if (authStatus === "loading") {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "36px", opacity: 0.5 }}><OrayaEmblem /></div>
      </main>
    );
  }

  // ── Auth gate (not member, not yet chosen guest) ──────────────────────────
  if (authStatus === "none" && !guestMode) {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
            <OrayaEmblem />
          </a>
          <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
              Reservations
            </p>
            <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 12px" }}>
              Request a booking
            </h1>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.7, margin: 0 }}>
              Sign in for member benefits, or continue as guest.
            </p>
          </div>
          <div style={{ border: "0.5px solid rgba(197,164,109,0.3)", backgroundColor: "rgba(197,164,109,0.05)", padding: "2rem", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="/login?redirect=/book"
              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, padding: "13px 32px", textDecoration: "none", display: "inline-block" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
            >
              Sign In
            </a>
            <button
              onClick={() => setGuestMode(true)}
              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.4)", padding: "13px 32px", cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = WHITE; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.4)"; (e.currentTarget as HTMLElement).style.color = GOLD; }}
            >
              Continue as Guest
            </button>
          </div>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
            Already a member?{" "}
            <a href="/login?redirect=/book" style={{ color: GOLD, textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}>
              Sign in
            </a>
            {" "}for member benefits.
          </p>
        </div>
      </main>
    );
  }

  // ── Multi-step form ───────────────────────────────────────────────────────
  // Step 1 gets a wider container to accommodate the 2-month calendar
  const containerWidth = step === 1 ? "720px" : "560px";

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
            Reservations
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 10px" }}>
            Request a booking
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.7, margin: 0 }}>
            Submit your dates and we&apos;ll confirm availability within 24 hours.
          </p>
        </div>

        {/* Auth identity banner */}
        {authStatus === "member" ? (
          <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "0.875rem 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Booking as <span style={{ color: GOLD }}>{memberName || "member"}</span>
            </p>
            <a href="/login" style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; }}>
              Not you?
            </a>
          </div>
        ) : (
          <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.02)", padding: "0.75rem 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>Continuing as guest</p>
            <button
              onClick={() => { setGuestMode(false); setStep(1); setError(""); }}
              style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, backgroundColor: "transparent", border: "none", cursor: "pointer", letterSpacing: "1px" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; }}>
              Sign in instead
            </button>
          </div>
        )}

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Step content — keyed so the fade animation re-fires on each step change */}
        <div key={step} className="step-content">

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Villa & Dates
          ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Villa selector */}
              <div>
                <label style={labelStyle}>Villa</label>
                <select
                  name="villa" value={form.villa} onChange={handleFormChange}
                  onFocus={focusGold} onBlur={blurGold}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="" disabled style={{ backgroundColor: MIDNIGHT }}>Select a villa</option>
                  {VILLAS.map(v => (
                    <option key={v} value={v} style={{ backgroundColor: MIDNIGHT }}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Calendar — only shown once a villa is selected */}
              {form.villa ? (
                <div>
                  <p style={{ ...labelStyle, marginBottom: "14px" }}>Select dates</p>
                  <div style={{ border: "0.5px solid rgba(197,164,109,0.15)", backgroundColor: "rgba(255,255,255,0.015)", padding: "1.5rem" }}>
                    <div className="oraya-cal">
                      <DayPicker
                        mode="range"
                        selected={dateRange}
                        onSelect={setDateRange}
                        disabled={disabledDays}
                        numberOfMonths={2}
                        fromDate={today}
                        showOutsideDays
                      />
                    </div>
                  </div>

                  {/* Selected-dates summary strip */}
                  {checkIn && (
                    <div style={{ marginTop: "14px", padding: "14px 20px", border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", display: "flex", flexWrap: "wrap", gap: "28px" }}>
                      <div>
                        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Check-in</p>
                        <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkIn)}</p>
                      </div>
                      {checkOut ? (
                        <>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Check-out</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkOut)}</p>
                          </div>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Duration</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: GOLD, margin: 0 }}>
                              {nights} {nights === 1 ? "night" : "nights"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>Now select a check-out date</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Conflict warning */}
                  {dateConflict && (
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginTop: "12px", lineHeight: 1.6 }}>
                      ⚠ {dateConflict}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ border: "0.5px dashed rgba(197,164,109,0.15)", padding: "3rem", textAlign: "center" }}>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, letterSpacing: "0.5px" }}>
                    Select a villa above to view availability
                  </p>
                </div>
              )}

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
              STEP 2 — Stay Details
          ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Guest contact fields (only when not a member) */}
              {guestMode && (
                <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(255,255,255,0.02)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                    Your details
                  </p>

                  <div>
                    <label style={labelStyle}>Full name</label>
                    <input name="fullName" type="text" required value={guest.fullName} onChange={handleGuestChange}
                      placeholder="Your full name" style={inputStyle} onFocus={focusGold} onBlur={blurGold} />
                  </div>

                  <div>
                    <label style={labelStyle}>Email address</label>
                    <input name="email" type="email" required value={guest.email} onChange={handleGuestChange}
                      placeholder="you@example.com" style={inputStyle} onFocus={focusGold} onBlur={blurGold} />
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
                        {DIAL_CODES.map((d, i) =>
                          d.code === "" ? (
                            <option key={`div-${i}`} disabled value="" style={{ backgroundColor: MIDNIGHT, color: MUTED }}>{d.label}</option>
                          ) : (
                            <option key={`${d.code}-${d.label}`} value={d.code} style={{ backgroundColor: MIDNIGHT }}>{d.flag} {d.code}</option>
                          )
                        )}
                      </select>
                      <input name="phoneNumber" type="tel" value={guest.phoneNumber} onChange={handleGuestChange}
                        placeholder="70 000 000" style={{ ...inputStyle, flex: 1 }} onFocus={focusGold} onBlur={blurGold} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Country</label>
                    <select name="country" value={guest.country} onChange={handleGuestChange}
                      onFocus={focusGold} onBlur={blurGold} style={{ ...inputStyle, cursor: "pointer" }}>
                      {COUNTRIES.map((c, i) =>
                        c.value === "" ? (
                          <option key={`div-${i}`} disabled value="" style={{ backgroundColor: MIDNIGHT, color: MUTED }}>{c.label}</option>
                        ) : (
                          <option key={c.value} value={c.value} style={{ backgroundColor: MIDNIGHT }}>{c.label}</option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* Guest counts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={labelStyle}>Guests staying overnight</label>
                  <input name="sleepingGuests" type="number" required min={1} max={8}
                    value={form.sleepingGuests} onChange={handleFormChange}
                    onFocus={focusGold} onBlur={blurGold} style={inputStyle} />
                  {parseInt(form.sleepingGuests, 10) > 6 && (
                    <p style={{ fontFamily: LATO, fontSize: "11px", color: GOLD, marginTop: "6px", lineHeight: 1.5 }}>
                      Extra bedding will be arranged.
                    </p>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Expected day visitors</label>
                  <input name="dayVisitors" type="number" required min={0} max={25}
                    value={form.dayVisitors} onChange={handleFormChange}
                    onFocus={focusGold} onBlur={blurGold} style={inputStyle} />
                </div>
              </div>

              {/* Event type */}
              <div>
                <label style={labelStyle}>
                  Event type{" "}
                  <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                </label>
                <select name="eventType" value={form.eventType} onChange={handleFormChange}
                  onFocus={focusGold} onBlur={blurGold} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="" style={{ backgroundColor: MIDNIGHT }}>Select type</option>
                  {EVENT_TYPES.map(t => (
                    <option key={t} value={t} style={{ backgroundColor: MIDNIGHT }}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>
                  Special requests{" "}
                  <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                </label>
                <textarea name="message" value={form.message} onChange={handleFormChange}
                  onFocus={focusGold} onBlur={blurGold}
                  rows={4} placeholder="Any special requirements, dietary needs, or occasion details…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = GOLD; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.25)"; (e.currentTarget as HTMLElement).style.color = MUTED; }}>
                  ← Back
                </button>
                <button onClick={goNext}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}>
                  Review →
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Add-ons & Review
          ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* ── Add-ons ─────────────────────────────────────────────── */}
              <div>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 14px" }}>
                  Add-ons
                </p>

                {addonsLoading ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>Loading…</p>
                ) : addons.length === 0 ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>
                    No add-ons are available for this booking.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {addons.map(addon => {
                      const selected = selectedAddons.includes(addon.id);
                      return (
                        <button
                          key={addon.id}
                          type="button"
                          onClick={() => toggleAddon(addon.id)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            width: "100%", textAlign: "left",
                            padding: "14px 18px",
                            border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                            backgroundColor: selected ? "rgba(197,164,109,0.07)" : "rgba(255,255,255,0.02)",
                            cursor: "pointer",
                            transition: "border-color 0.15s, background-color 0.15s",
                          }}
                        >
                          {/* Checkbox indicator + label */}
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{
                              width: "16px", height: "16px", flexShrink: 0,
                              border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.3)"}`,
                              backgroundColor: selected ? GOLD : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "background-color 0.15s, border-color 0.15s",
                            }}>
                              {selected && (
                                <span style={{ color: CHARCOAL, fontSize: "10px", fontWeight: 700, lineHeight: 1 }}>✓</span>
                              )}
                            </div>
                            <span style={{ fontFamily: LATO, fontSize: "13px", color: selected ? WHITE : "rgba(255,255,255,0.7)", fontWeight: selected ? 400 : 300 }}>
                              {addon.label}
                            </span>
                          </div>

                          {/* Pricing metadata */}
                          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "16px" }}>
                            <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: MUTED, display: "block" }}>
                              {PRICING_MODEL_LABELS[addon.pricing_model] ?? addon.pricing_model}
                            </span>
                            {addon.price !== null ? (
                              <span style={{ fontFamily: LATO, fontSize: "12px", color: selected ? GOLD : MUTED }}>
                                {addon.price.toLocaleString()} {addon.currency}
                              </span>
                            ) : (
                              <span style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(138,128,112,0.5)", fontStyle: "italic" }}>
                                Price on request
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: "0.5px", backgroundColor: "rgba(197,164,109,0.12)" }} />

              {/* ── Booking Summary ──────────────────────────────────────── */}
              <div>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 14px" }}>
                  Booking Summary
                </p>
                <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.5rem" }}>
                  {(
                    [
                      ["Villa",           form.villa],
                      ["Check-in",        fmtDate(checkIn)],
                      ["Check-out",       fmtDate(checkOut)],
                      ["Duration",        `${nights} ${nights === 1 ? "night" : "nights"}`],
                      ["Sleeping guests", form.sleepingGuests],
                      ["Day visitors",    form.dayVisitors],
                      ...(form.eventType ? [["Event type", form.eventType]] : []),
                      ...(form.message   ? [["Notes",      form.message]]   : []),
                      ...(guestMode      ? [["Name",       guest.fullName], ["Email", guest.email]] : []),
                      ...(selectedAddons.length > 0
                        ? [["Add-ons", selectedAddons.map(id => addons.find(a => a.id === id)?.label ?? id).join(", ")]]
                        : []),
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0, paddingRight: "16px" }}>
                        {label}
                      </span>
                      <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, fontWeight: 300, textAlign: "right" }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.8, textAlign: "center", margin: 0 }}>
                Your request will be reviewed and you&apos;ll receive a confirmation within 24 hours.
              </p>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = GOLD; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.25)"; (e.currentTarget as HTMLElement).style.color = MUTED; }}>
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}>
                  {loading ? "Submitting…" : "Submit Booking Request"}
                </button>
              </div>
            </div>
          )}

        </div>
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
