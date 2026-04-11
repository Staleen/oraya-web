"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import OrayaEmblem from "@/components/OrayaEmblem";
import { supabase } from "@/lib/supabase";

const GOLD       = "#C5A46D";
const WHITE      = "#FFFFFF";
const MIDNIGHT   = "#1F2B38";
const CHARCOAL   = "#2E2E2E";
const MUTED      = "#8a8070";
const GREEN      = "#6fcf8a";
const RED        = "#e07070";
const SURFACE    = "rgba(255,255,255,0.03)";
const BORDER     = "rgba(197,164,109,0.12)";
const PLAYFAIR   = "'Playfair Display', Georgia, serif";
const LATO       = "'Lato', system-ui, sans-serif";

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(197,164,109,0.25)",
  padding: "13px 16px",
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

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = GOLD;
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)";
}

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

function parsePhone(phone: string): { dialCode: string; number: string } {
  if (!phone) return { dialCode: "+961", number: "" };
  const sorted = DIAL_CODES
    .filter((d) => d.code !== "")
    .sort((a, b) => b.code.length - a.code.length);
  for (const d of sorted) {
    if (phone.startsWith(d.code)) {
      return { dialCode: d.code, number: phone.slice(d.code.length) };
    }
  }
  return { dialCode: "+961", number: phone };
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = (iso.split("T")[0]).split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

interface Booking {
  id: string;
  villa: string;
  check_in: string;
  check_out: string;
  sleeping_guests: number;
  day_visitors: number;
  event_type: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

interface BookingEditForm {
  check_in: string;
  check_out: string;
  sleeping_guests: string;
  day_visitors: string;
  event_type: string;
  message: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending:   { bg: "rgba(197,164,109,0.12)", text: GOLD },
    confirmed: { bg: "rgba(80,180,100,0.12)",  text: GREEN },
    cancelled: { bg: "rgba(138,128,112,0.10)", text: MUTED },
  };
  const c = colors[status] ?? { bg: "transparent", text: MUTED };
  return (
    <span style={{
      fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px",
      textTransform: "uppercase", color: c.text,
      backgroundColor: c.bg, padding: "3px 10px", borderRadius: "2px",
    }}>
      {status}
    </span>
  );
}

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId]     = useState<string | null>(null);
  const [email, setEmail]       = useState("");
  const [form, setForm]         = useState({
    fullName: "", dialCode: "+961", phoneNumber: "", country: "Lebanon", address: "",
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Booking management state
  const [cancellingId, setCancellingId]   = useState<string | null>(null);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [editForms, setEditForms]         = useState<Record<string, BookingEditForm>>({});
  const [savingBookingId, setSavingBookingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login?redirect=/profile");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? "");

      // Fetch member profile
      const { data: member } = await supabase
        .from("members")
        .select("*")
        .eq("id", user.id)
        .single();

      if (member) {
        const { dialCode, number } = parsePhone(member.phone ?? "");
        setForm({
          fullName:    member.full_name ?? "",
          dialCode,
          phoneNumber: number,
          country:     member.country   ?? "Lebanon",
          address:     member.address   ?? "",
        });
      }

      // Fetch this member's bookings
      const { data: bookingData } = await supabase
        .from("bookings")
        .select("id, villa, check_in, check_out, sleeping_guests, day_visitors, event_type, message, status, created_at")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false });

      if (bookingData) setBookings(bookingData);

      // Fetch WhatsApp number from settings
      const { data: waSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "whatsapp_number")
        .single();
      if (waSetting?.value) setWhatsappNumber(waSetting.value);

      setPageLoading(false);
    });
  }, [router]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const phone = form.phoneNumber
        ? `${form.dialCode}${form.phoneNumber}`
        : "";

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          full_name: form.fullName,
          phone,
          country:   form.country,
          address:   form.address,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save changes.");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!confirm("Delete your account permanently? All your data and bookings history will be removed.")) return;
    if (!confirm("This cannot be undone. Are you absolutely sure?")) return;

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session?.access_token ?? ""}` },
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to delete account.");
      }

      await supabase.auth.signOut();
      router.push("/");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleting(false);
    }
  }

  async function handleCancel(bookingId: string) {
    if (!confirm("Cancel this booking? This cannot be undone.")) return;
    setCancellingId(bookingId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to cancel.");
      setBookings((bs) => bs.map((b) => b.id === bookingId ? { ...b, status: "cancelled" } : b));
      setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel booking.");
    } finally {
      setCancellingId(null);
    }
  }

  function openModify(b: Booking) {
    setEditForms((f) => ({
      ...f,
      [b.id]: {
        check_in:        b.check_in.split("T")[0],
        check_out:       b.check_out.split("T")[0],
        sleeping_guests: String(b.sleeping_guests),
        day_visitors:    String(b.day_visitors),
        event_type:      b.event_type ?? "",
        message:         b.message ?? "",
      },
    }));
    setExpandedId(b.id);
  }

  async function handleSaveBooking(bookingId: string) {
    const ef = editForms[bookingId];
    if (!ef) return;
    setSavingBookingId(bookingId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          check_in:        ef.check_in,
          check_out:       ef.check_out,
          sleeping_guests: parseInt(ef.sleeping_guests) || 0,
          day_visitors:    parseInt(ef.day_visitors)    || 0,
          event_type:      ef.event_type || null,
          message:         ef.message    || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save.");
      // Update local booking state
      setBookings((bs) => bs.map((b) => b.id === bookingId ? {
        ...b,
        check_in:        ef.check_in,
        check_out:       ef.check_out,
        sleeping_guests: parseInt(ef.sleeping_guests) || 0,
        day_visitors:    parseInt(ef.day_visitors)    || 0,
        event_type:      ef.event_type || null,
        message:         ef.message    || null,
      } : b));
      setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingBookingId(null);
    }
  }

  function setEditField(bookingId: string, field: keyof BookingEditForm, value: string) {
    setEditForms((f) => ({ ...f, [bookingId]: { ...f[bookingId], [field]: value } }));
  }

  // Loading spinner
  if (pageLoading) {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "36px", opacity: 0.35 }}><OrayaEmblem /></div>
      </main>
    );
  }

  return (
    <>
      <SiteNav base="/" />

      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", paddingTop: "80px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "4rem 2rem 6rem" }}>

          {/* ── Page header ── */}
          <div style={{ marginBottom: "3.5rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "0.75rem" }}>
              Oraya member
            </p>
            <h1 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 400, color: WHITE, margin: 0, lineHeight: 1.2 }}>
              My Profile
            </h1>
            <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, marginTop: "1.5rem", opacity: 0.7 }} />
          </div>

          {/* ── Personal details form ── */}
          <section style={{ marginBottom: "4rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1.75rem" }}>
              Personal details
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Full name */}
              <div>
                <label style={labelStyle}>Full name</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Your full name"
                  style={inputStyle}
                  onFocus={focusBorder} onBlur={blurBorder}
                />
              </div>

              {/* Email — read-only */}
              <div>
                <label style={labelStyle}>
                  Email address{" "}
                  <span style={{ color: "rgba(138,128,112,0.45)", letterSpacing: 0 }}>(cannot be changed)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  style={{ ...inputStyle, color: MUTED, cursor: "not-allowed", opacity: 0.55 }}
                />
              </div>

              {/* Phone with dial code */}
              <div>
                <label style={labelStyle}>Phone number</label>
                <div style={{ display: "flex" }}>
                  <select
                    value={form.dialCode}
                    onChange={(e) => setForm((f) => ({ ...f, dialCode: e.target.value }))}
                    onFocus={focusBorder} onBlur={blurBorder}
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
                    type="tel"
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    placeholder="70 000 000"
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={focusBorder} onBlur={blurBorder}
                  />
                </div>
              </div>

              {/* Country */}
              <div>
                <label style={labelStyle}>Country</label>
                <select
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  onFocus={focusBorder} onBlur={blurBorder}
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

              {/* Address */}
              <div>
                <label style={labelStyle}>Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="City, region"
                  style={inputStyle}
                  onFocus={focusBorder} onBlur={blurBorder}
                />
              </div>

              {/* Error message */}
              {saveError && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: RED, lineHeight: 1.6 }}>
                  {saveError}
                </p>
              )}

              {/* Save row */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "4px" }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
                    textTransform: "uppercase", color: CHARCOAL,
                    backgroundColor: GOLD, border: "none",
                    padding: "14px 36px",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                {saved && (
                  <span style={{ fontFamily: LATO, fontSize: "12px", color: GREEN, letterSpacing: "1px" }}>
                    ✓ Changes saved
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ── My Bookings ── */}
          <section style={{ marginBottom: "4rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.75rem" }}>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                My bookings
              </p>
              <a
                href="/book"
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
              >
                + New booking
              </a>
            </div>

            {bookings.length === 0 ? (
              <div style={{
                backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`,
                padding: "2.5rem", textAlign: "center",
              }}>
                <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>
                  No bookings yet.
                </p>
                <a
                  href="/book"
                  style={{
                    display: "inline-block", marginTop: "1.25rem",
                    fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                    textTransform: "uppercase", color: GOLD,
                    borderBottom: "0.5px solid rgba(197,164,109,0.4)",
                    paddingBottom: "2px", textDecoration: "none",
                  }}
                >
                  Make your first booking →
                </a>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {bookings.map((b) => {
                  const isPending    = b.status === "pending";
                  const isConfirmed  = b.status === "confirmed";
                  const isCancelled  = b.status === "cancelled";
                  const isExpanded   = expandedId === b.id;
                  const ef           = editForms[b.id];
                  const isCancelling = cancellingId === b.id;
                  const isSaving     = savingBookingId === b.id;

                  const waDigits = whatsappNumber.replace(/\D/g, "");
                  const waText   = encodeURIComponent(
                    `Hi Oraya, I'd like to modify my booking at ${b.villa} (Ref: ${b.id.slice(0, 8).toUpperCase()}).`
                  );
                  const waUrl = `https://wa.me/${waDigits}?text=${waText}`;

                  return (
                    <div
                      key={b.id}
                      style={{
                        backgroundColor: SURFACE,
                        border: `0.5px solid ${BORDER}`,
                        padding: "1.5rem 1.75rem",
                        opacity: isCancelled ? 0.45 : 1,
                        transition: "opacity 0.2s",
                      }}
                    >
                      {/* Top row: villa + badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "8px" }}>
                        <div>
                          <p style={{ fontFamily: PLAYFAIR, fontSize: "17px", color: WHITE, margin: "0 0 3px" }}>
                            {b.villa}
                          </p>
                          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", color: MUTED, margin: 0, textTransform: "uppercase" }}>
                            Ref: {b.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>

                      {/* Details grid — always visible */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px 24px" }}>
                        {[
                          { label: "Check-in",      value: fmtDate(b.check_in) },
                          { label: "Check-out",      value: fmtDate(b.check_out) },
                          { label: "Guests staying", value: String(b.sleeping_guests) },
                          { label: "Day visitors",   value: String(b.day_visitors) },
                          ...(b.event_type ? [{ label: "Event type", value: b.event_type }] : []),
                          { label: "Submitted",      value: fmtDate(b.created_at) },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 3px" }}>
                              {label}
                            </p>
                            <p style={{ fontFamily: LATO, fontSize: "13px", color: "rgba(255,255,255,0.75)", fontWeight: 300, margin: 0 }}>
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* ── Modify form (pending + expanded) ── */}
                      {isPending && isExpanded && ef && (
                        <div style={{ marginTop: "1.5rem", borderTop: `0.5px solid ${BORDER}`, paddingTop: "1.5rem" }}>
                          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
                            Modify booking
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            {/* Check-in / Check-out */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                              <div>
                                <label style={labelStyle}>Check-in</label>
                                <input
                                  type="date"
                                  value={ef.check_in}
                                  onChange={(e) => setEditField(b.id, "check_in", e.target.value)}
                                  style={{ ...inputStyle, colorScheme: "dark" }}
                                  onFocus={focusBorder} onBlur={blurBorder}
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Check-out</label>
                                <input
                                  type="date"
                                  value={ef.check_out}
                                  onChange={(e) => setEditField(b.id, "check_out", e.target.value)}
                                  style={{ ...inputStyle, colorScheme: "dark" }}
                                  onFocus={focusBorder} onBlur={blurBorder}
                                />
                              </div>
                            </div>
                            {/* Guests / Day visitors */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                              <div>
                                <label style={labelStyle}>Sleeping guests</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={ef.sleeping_guests}
                                  onChange={(e) => setEditField(b.id, "sleeping_guests", e.target.value)}
                                  style={inputStyle}
                                  onFocus={focusBorder} onBlur={blurBorder}
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Day visitors</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={ef.day_visitors}
                                  onChange={(e) => setEditField(b.id, "day_visitors", e.target.value)}
                                  style={inputStyle}
                                  onFocus={focusBorder} onBlur={blurBorder}
                                />
                              </div>
                            </div>
                            {/* Event type */}
                            <div>
                              <label style={labelStyle}>Event type</label>
                              <input
                                type="text"
                                value={ef.event_type}
                                onChange={(e) => setEditField(b.id, "event_type", e.target.value)}
                                placeholder="Birthday, wedding, gathering…"
                                style={inputStyle}
                                onFocus={focusBorder} onBlur={blurBorder}
                              />
                            </div>
                            {/* Special requests */}
                            <div>
                              <label style={labelStyle}>Special requests</label>
                              <textarea
                                value={ef.message}
                                onChange={(e) => setEditField(b.id, "message", e.target.value)}
                                placeholder="Any additional requests or notes…"
                                rows={3}
                                style={{
                                  ...inputStyle,
                                  resize: "vertical",
                                  minHeight: "80px",
                                  lineHeight: 1.6,
                                }}
                                onFocus={focusBorder} onBlur={blurBorder}
                              />
                            </div>
                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                              <button
                                onClick={() => handleSaveBooking(b.id)}
                                disabled={isSaving}
                                style={{
                                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                                  textTransform: "uppercase", color: CHARCOAL,
                                  backgroundColor: GOLD, border: "none",
                                  padding: "11px 28px",
                                  cursor: isSaving ? "not-allowed" : "pointer",
                                  opacity: isSaving ? 0.7 : 1,
                                }}
                                onMouseEnter={(e) => { if (!isSaving) (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                              >
                                {isSaving ? "Saving…" : "Save Changes"}
                              </button>
                              <button
                                onClick={() => setExpandedId(null)}
                                disabled={isSaving}
                                style={{
                                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                                  textTransform: "uppercase", color: MUTED,
                                  backgroundColor: "transparent",
                                  border: "0.5px solid rgba(138,128,112,0.3)",
                                  padding: "11px 24px",
                                  cursor: "pointer",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.color = WHITE;
                                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.color = MUTED;
                                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(138,128,112,0.3)";
                                }}
                              >
                                Discard
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Pending actions (not expanded) ── */}
                      {isPending && !isExpanded && (
                        <div style={{ display: "flex", gap: "10px", marginTop: "1.25rem", paddingTop: "1rem", borderTop: `0.5px solid ${BORDER}` }}>
                          <button
                            onClick={() => openModify(b)}
                            style={{
                              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                              textTransform: "uppercase", color: GOLD,
                              backgroundColor: "transparent",
                              border: "0.5px solid rgba(197,164,109,0.35)",
                              padding: "9px 22px",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(197,164,109,0.08)";
                              (e.currentTarget as HTMLElement).style.borderColor = GOLD;
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.35)";
                            }}
                          >
                            Modify
                          </button>
                          <button
                            onClick={() => handleCancel(b.id)}
                            disabled={isCancelling}
                            style={{
                              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                              textTransform: "uppercase", color: MUTED,
                              backgroundColor: "transparent",
                              border: "0.5px solid rgba(138,128,112,0.25)",
                              padding: "9px 22px",
                              cursor: isCancelling ? "not-allowed" : "pointer",
                              opacity: isCancelling ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isCancelling) {
                                (e.currentTarget as HTMLElement).style.color = RED;
                                (e.currentTarget as HTMLElement).style.borderColor = "rgba(224,112,112,0.4)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.color = MUTED;
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(138,128,112,0.25)";
                            }}
                          >
                            {isCancelling ? "Cancelling…" : "Cancel"}
                          </button>
                        </div>
                      )}

                      {/* ── Confirmed: WhatsApp contact ── */}
                      {isConfirmed && (
                        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: `0.5px solid ${BORDER}` }}>
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 10px", lineHeight: 1.6 }}>
                            To modify or cancel a confirmed booking, please contact us via WhatsApp.
                          </p>
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              fontFamily: LATO,
                              fontSize: "10px",
                              letterSpacing: "2px",
                              textTransform: "uppercase",
                              color: "#25D366",
                              border: "0.5px solid rgba(37,211,102,0.35)",
                              padding: "9px 22px",
                              textDecoration: "none",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(37,211,102,0.07)";
                              (e.currentTarget as HTMLElement).style.borderColor = "#25D366";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(37,211,102,0.35)";
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            WhatsApp
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Danger zone ── */}
          <section style={{
            borderTop: "0.5px solid rgba(255,255,255,0.06)",
            paddingTop: "2.5rem",
          }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: RED, marginBottom: "0.75rem" }}>
              Danger zone
            </p>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.75, marginBottom: "1.5rem", maxWidth: "480px" }}>
              Permanently delete your account, profile, and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              style={{
                fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                textTransform: "uppercase", color: RED,
                backgroundColor: "transparent",
                border: "0.5px solid rgba(224,112,112,0.35)",
                padding: "12px 28px",
                cursor: deleting ? "not-allowed" : "pointer",
                opacity: deleting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!deleting) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(224,112,112,0.08)";
                  (e.currentTarget as HTMLElement).style.borderColor = RED;
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(224,112,112,0.35)";
              }}
            >
              {deleting ? "Deleting account…" : "Delete My Account"}
            </button>
          </section>

        </div>
      </main>
    </>
  );
}
