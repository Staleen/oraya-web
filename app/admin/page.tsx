"use client";
import { useEffect, useState } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import MediaManager from "@/components/MediaManager";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";
const SURFACE  = "rgba(255,255,255,0.03)";
const BORDER   = "rgba(197,164,109,0.12)";

const SESSION_KEY = "oraya_admin_auth";

interface BookingAddon {
  id:    string;
  label: string;
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
  addons: BookingAddon[] | null;
  status: string;
  created_at: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_country: string | null;
}

interface Member {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  address: string | null;
  created_at: string;
}

interface CalendarSource {
  id: string;
  villa: string;
  source_name: string;
  feed_url: string;
  is_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
  created_at: string;
}

interface Addon {
  id:            string;
  label:         string;
  enabled:       boolean;
  currency:      string;
  price:         number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
}

const PRICING_MODELS: { value: Addon["pricing_model"]; label: string }[] = [
  { value: "flat_fee",           label: "Flat fee"          },
  { value: "per_night",          label: "Per night"         },
  { value: "per_person_per_day", label: "Per person / day"  },
  { value: "per_unit",           label: "Per unit"          },
];

const CURRENCIES = ["USD", "EUR", "GBP", "LBP"];
const CALENDAR_EXPORTS = [
  { villa: "Villa Mechmech", slug: "mechmech" },
  { villa: "Villa Byblos", slug: "byblos" },
];

function fmt(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function fmtDateTime(iso: string) {
  if (!iso) return "-";
  const dt = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const date = `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  const hh   = String(dt.getHours()).padStart(2, "0");
  const mm   = String(dt.getMinutes()).padStart(2, "0");
  const ss   = String(dt.getSeconds()).padStart(2, "0");
  return `${date} ${hh}:${mm}:${ss}`;
}

function formatSyncStatus(status: string | null) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "syncing") return "Syncing";
  return "Never run";
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:   "rgba(197,164,109,0.15)",
    confirmed: "rgba(80,180,100,0.15)",
    cancelled: "rgba(200,80,80,0.15)",
  };
  const text: Record<string, string> = {
    pending:   GOLD,
    confirmed: "#6fcf8a",
    cancelled: "#e07070",
  };
  return (
    <span style={{
      fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px",
      textTransform: "uppercase", color: text[status] ?? MUTED,
      backgroundColor: colors[status] ?? "transparent",
      padding: "3px 10px", borderRadius: "2px",
    }}>
      {status}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  fontFamily: LATO, fontSize: "9px", letterSpacing: "2px",
  textTransform: "uppercase", color: GOLD, padding: "12px 16px",
  textAlign: "left", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  fontFamily: LATO, fontSize: "13px", fontWeight: 300,
  color: "rgba(255,255,255,0.75)", padding: "14px 16px",
  borderBottom: `0.5px solid rgba(255,255,255,0.04)`, verticalAlign: "middle",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(197,164,109,0.25)",
  padding: "12px 14px",
  fontFamily: LATO, fontSize: "14px", color: WHITE,
  outline: "none", boxSizing: "border-box",
};

// --- Password gate -----------------------------------------------------------

function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [input, setInput]   = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      const row = (data.settings ?? []).find(
        (s: { key: string; value: string }) => s.key === "admin_password"
      );
      const correct = row?.value ?? "Oraya2026";
      if (input === correct) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onSuccess();
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Could not verify password. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh", backgroundColor: MIDNIGHT,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 1.75rem", opacity: 0.5 }} />

        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
          Restricted area
        </p>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 2rem" }}>
          Admin Access
        </h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            placeholder="Enter admin password"
            autoFocus
            style={{
              ...fieldStyle,
              padding: "14px 16px",
              fontSize: "15px",
              textAlign: "center",
              letterSpacing: "3px",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
          />

          {error && (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !input}
            style={{
              fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
              textTransform: "uppercase", color: CHARCOAL,
              backgroundColor: GOLD, border: "none", padding: "15px",
              cursor: loading || !input ? "not-allowed" : "pointer",
              opacity: loading || !input ? 0.6 : 1,
            }}
          >
            {loading ? "Verifying..." : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}

// --- Main dashboard ----------------------------------------------------------

export default function AdminPage() {
  const [authed, setAuthed]             = useState<boolean | null>(null);
  const [bookings, setBookings]         = useState<Booking[]>([]);
  const [members, setMembers]           = useState<Member[]>([]);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [tab, setTab]                   = useState<"bookings" | "members">("bookings");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [villaFilter, setVillaFilter]   = useState("all");
  const [dateFilter, setDateFilter]     = useState("");
  const [emailWarnings, setEmailWarnings] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile]         = useState(false);

  // WhatsApp setting
  const [whatsappNum, setWhatsappNum]       = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved]   = useState(false);

  // Password change
  const [newPassword, setNewPassword]       = useState("");
  const [pwSaving, setPwSaving]             = useState(false);
  const [pwSaved, setPwSaved]               = useState(false);

  // Add-ons management
  const [addons,        setAddons]        = useState<Addon[]>([]);
  const [addonsSaving,  setAddonsSaving]  = useState(false);
  const [addonsSaved,   setAddonsSaved]   = useState(false);

  // Notification emails
  const [notifEmails,  setNotifEmails]  = useState("");
  const [notifSaving,  setNotifSaving]  = useState(false);
  const [notifSaved,   setNotifSaved]   = useState(false);

  // Member deletion
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  // Booking status updating
  const [updatingId, setUpdatingId]         = useState<string | null>(null);
  const [syncingCalendars, setSyncingCalendars] = useState(false);
  const [syncMessage, setSyncMessage]         = useState("");

  // Check sessionStorage on mount
  useEffect(() => {
    const ok = sessionStorage.getItem(SESSION_KEY) === "1";
    setAuthed(ok);
  }, []);

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth <= 768);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  // Fetch bookings + members - called on auth and after status changes.
  // Pass silent=true to skip the global loading state (used for background refreshes).
  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r    = await fetch("/api/admin/data", { cache: "no-store" });
      const text = await r.text();
      console.log("[admin] /api/admin/data raw response:", text);
      let d: Record<string, unknown>;
      try { d = JSON.parse(text); }
      catch { throw new Error(`Non-JSON response (${r.status}): ${text.slice(0, 200)}`); }
      if (d.error) { console.error("[admin] data error from API:", d.error); setError(d.error as string); return; }
      console.log(`[admin] loaded ${(d.bookings as unknown[])?.length ?? 0} bookings, ${(d.members as unknown[])?.length ?? 0} members`);
      setBookings((d.bookings as Booking[]) ?? []);
      setMembers((d.members as Member[]) ?? []);
      setCalendarSources((d.calendar_sources as CalendarSource[]) ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[admin] fetch error:", msg);
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Load data once authenticated
  useEffect(() => {
    if (authed !== true) return;

    loadData();

    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.settings ?? [];
        const wa = rows.find((s: { key: string; value: string }) => s.key === "whatsapp_number");
        if (wa) setWhatsappNum(wa.value);
        const ne = rows.find((s: { key: string; value: string }) => s.key === "notification_emails");
        if (ne) setNotifEmails(ne.value);
      })
      .catch((e) => console.error("[admin] settings fetch error:", e));

    fetch("/api/addons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.addons)) setAddons(d.addons); })
      .catch((e) => console.error("[admin] addons fetch error:", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function saveWhatsapp() {
    setWhatsappSaving(true); setWhatsappSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "whatsapp_number", value: whatsappNum }),
    });
    setWhatsappSaving(false);
    if (res.ok) { setWhatsappSaved(true); setTimeout(() => setWhatsappSaved(false), 3000); }
    else { const d = await res.json(); setError(d.error ?? "Failed to save."); }
  }

  async function savePassword() {
    if (!newPassword.trim()) return;
    setPwSaving(true); setPwSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "admin_password", value: newPassword }),
    });
    setPwSaving(false);
    if (res.ok) {
      setPwSaved(true);
      setNewPassword("");
      setTimeout(() => setPwSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save password.");
    }
  }

  async function saveNotifEmails() {
    setNotifSaving(true); setNotifSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "notification_emails", value: notifEmails }),
    });
    setNotifSaving(false);
    if (res.ok) { setNotifSaved(true); setTimeout(() => setNotifSaved(false), 3000); }
    else { const d = await res.json(); setError(d.error ?? "Failed to save notification emails."); }
  }

  function updateAddon(id: string, patch: Partial<Addon>) {
    setAddons(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
    setAddonsSaved(false);
  }

  async function saveAddons() {
    setAddonsSaving(true); setAddonsSaved(false);
    const res = await fetch("/api/admin/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addons }),
    });
    setAddonsSaving(false);
    if (res.ok) { setAddonsSaved(true); setTimeout(() => setAddonsSaved(false), 3000); }
    else { const d = await res.json(); setError(d.error ?? "Failed to save add-ons."); }
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  }

  async function deleteMember(id: string, name: string) {
    if (!confirm(`Delete member "${name}"? This will permanently remove their account and they will not be able to sign in again.`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to delete member.");
    }
  }

  async function updateStatus(id: string, status: "confirmed" | "cancelled") {
    const label = status === "confirmed" ? "confirm" : "cancel";
    if (!confirm(`Are you sure you want to ${label} this booking?`)) return;

    setError("");
    setUpdatingId(id);

    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const d = await res.json();
    setUpdatingId(null);

    if (!res.ok) {
      setError(d.error ?? "Failed to update status.");
    } else {
      setEmailWarnings((prev) => {
        const next = { ...prev };
        if (d.email_sent === false) next[id] = "Booking updated but email was not sent";
        else delete next[id];
        return next;
      });
      // Update the single row immediately from the confirmed DB value - no full-table flicker
      if (d.booking) {
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: d.booking.status } : b)));
      }
      // Then silently re-fetch all data in the background to stay in sync
      loadData(true);
    }
  }

  async function runCalendarSync() {
    setSyncingCalendars(true);
    setSyncMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/calendar-sync/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Calendar sync failed.");
      } else {
        setSyncMessage(`Synced ${data.sources_processed} source(s), upserted ${data.blocks_upserted} block(s), ${data.sources_failed} failed.`);
        loadData(true);
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      setError(message);
    } finally {
      setSyncingCalendars(false);
    }
  }

  const tabBtn = (t: "bookings" | "members", label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px",
        textTransform: "uppercase", color: tab === t ? GOLD : MUTED,
        backgroundColor: "transparent", border: "none",
        borderBottom: tab === t ? `1px solid ${GOLD}` : "1px solid transparent",
        padding: "10px 0", cursor: "pointer", marginRight: "2rem",
      }}
    >
      {label}
    </button>
  );

  const villaOptions = Array.from(new Set(bookings.map((b) => b.villa))).sort();
  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (villaFilter !== "all" && b.villa !== villaFilter) return false;
    if (dateFilter && b.check_in !== dateFilter) return false;
    return true;
  });

  function clearFilters() {
    setStatusFilter("all");
    setVillaFilter("all");
    setDateFilter("");
  }

  // Waiting for session check
  if (authed === null) return null;

  // Not authenticated: show gate
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  // Dashboard
  return (
    <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "0" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.25rem 2.5rem", borderBottom: `0.5px solid ${BORDER}`,
        backgroundColor: "rgba(31,43,56,0.98)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <a href="/" style={{ display: "block", width: "32px", cursor: "pointer" }}><OrayaEmblem /></a>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Oraya
            </p>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "15px", color: WHITE, margin: 0, lineHeight: 1.2 }}>
              Admin dashboard
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <a
            href="/"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Back to site
          </a>
          <button
            onClick={signOut}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", color: MUTED, backgroundColor: "transparent",
              border: "none", cursor: "pointer", padding: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#e07070"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: "2.5rem" }}>
        {/* Settings */}
        <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.75rem", marginBottom: "2rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1.5rem" }}>
            Settings
          </p>

          {/* WhatsApp number */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap", marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: `0.5px solid ${BORDER}` }}>
            <div style={{ flex: "1", minWidth: "220px" }}>
              <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                WhatsApp number
              </label>
              <input
                type="tel"
                value={whatsappNum}
                onChange={(e) => { setWhatsappNum(e.target.value); setWhatsappSaved(false); }}
                placeholder="e.g. 96170000000"
                style={fieldStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "5px" }}>
                Include country code, no + or spaces (e.g. 96170123456)
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "22px" }}>
              <button
                onClick={saveWhatsapp}
                disabled={whatsappSaving}
                style={{
                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                  textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
                  border: "none", padding: "12px 28px",
                  cursor: whatsappSaving ? "not-allowed" : "pointer",
                  opacity: whatsappSaving ? 0.7 : 1, whiteSpace: "nowrap",
                }}
              >
                {whatsappSaving ? "Saving..." : "Save"}
              </button>
              {whatsappSaved && (
                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
              )}
            </div>
          </div>

          {/* Change password */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap", marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: `0.5px solid ${BORDER}` }}>
            <div style={{ flex: "1", minWidth: "220px" }}>
              <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                Change admin password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPwSaved(false); }}
                placeholder="New password"
                style={fieldStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "2px" }}>
              <button
                onClick={savePassword}
                disabled={pwSaving || !newPassword.trim()}
                style={{
                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                  textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
                  border: "none", padding: "12px 28px",
                  cursor: pwSaving || !newPassword.trim() ? "not-allowed" : "pointer",
                  opacity: pwSaving || !newPassword.trim() ? 0.6 : 1, whiteSpace: "nowrap",
                }}
              >
                {pwSaving ? "Saving..." : "Update password"}
              </button>
              {pwSaved && (
                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Password updated</span>
              )}
            </div>
          </div>

          {/* Notification emails */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "220px" }}>
              <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                Booking notification recipients
              </label>
              <input
                type="text"
                value={notifEmails}
                onChange={(e) => { setNotifEmails(e.target.value); setNotifSaved(false); }}
                placeholder="e.g. admin@oraya.com, ops@oraya.com"
                style={fieldStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "5px" }}>
                Comma-separated. These addresses receive an email when a new booking request is submitted.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "22px" }}>
              <button
                onClick={saveNotifEmails}
                disabled={notifSaving}
                style={{
                  fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                  textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
                  border: "none", padding: "12px 28px",
                  cursor: notifSaving ? "not-allowed" : "pointer",
                  opacity: notifSaving ? 0.7 : 1, whiteSpace: "nowrap",
                }}
              >
                {notifSaving ? "Saving..." : "Save"}
              </button>
              {notifSaved && (
                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
              )}
            </div>
          </div>
        </div>

        {/* Add-ons management */}
        <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.75rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Add-ons
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {addonsSaved && (
                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
              )}
              <button
                onClick={saveAddons}
                disabled={addonsSaving}
                style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "10px 24px", cursor: addonsSaving ? "not-allowed" : "pointer", opacity: addonsSaving ? 0.7 : 1 }}
              >
                {addonsSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 110px 160px", gap: "10px", alignItems: "center", paddingBottom: "10px", borderBottom: `0.5px solid ${BORDER}`, marginBottom: "8px" }}>
            {["On", "Name", "Currency", "Price", "Pricing model"].map(h => (
              <span key={h} style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED }}>{h}</span>
            ))}
          </div>

          {/* Addon rows */}
          {addons.map(addon => (
            <div
              key={addon.id}
              style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 110px 160px", gap: "10px", alignItems: "center", padding: "10px 0", borderBottom: `0.5px solid rgba(255,255,255,0.03)` }}
            >
              {/* Enabled toggle */}
              <div style={{ display: "flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={addon.enabled}
                  onChange={e => updateAddon(addon.id, { enabled: e.target.checked })}
                  style={{ accentColor: GOLD, width: "16px", height: "16px", cursor: "pointer" }}
                />
              </div>

              {/* Label */}
              <input
                type="text"
                value={addon.label}
                onChange={e => updateAddon(addon.id, { label: e.target.value })}
                style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />

              {/* Currency */}
              <select
                value={addon.currency}
                onChange={e => updateAddon(addon.id, { currency: e.target.value })}
                style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c} style={{ backgroundColor: MIDNIGHT }}>{c}</option>
                ))}
              </select>

              {/* Price */}
              <input
                type="number"
                min={0}
                value={addon.price ?? ""}
                onChange={e => updateAddon(addon.id, { price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="-"
                style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", opacity: addon.enabled ? 1 : 0.5 }}
                onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              />

              {/* Pricing model */}
              <select
                value={addon.pricing_model}
                onChange={e => updateAddon(addon.id, { pricing_model: e.target.value as Addon["pricing_model"] })}
                style={{ ...fieldStyle, padding: "8px 10px", fontSize: "13px", cursor: "pointer", opacity: addon.enabled ? 1 : 0.5 }}
                onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
              >
                {PRICING_MODELS.map(pm => (
                  <option key={pm.value} value={pm.value} style={{ backgroundColor: MIDNIGHT }}>{pm.label}</option>
                ))}
              </select>
            </div>
          ))}

          {addons.length === 0 && (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>No add-ons loaded.</p>
          )}
        </div>

        {/* Media Manager */}
        <MediaManager />

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "2.5rem" }}>
          {[
            { label: "Total bookings", value: loading ? "-" : bookings.length },
            { label: "Pending",        value: loading ? "-" : bookings.filter((b) => b.status === "pending").length },
            { label: "Confirmed",      value: loading ? "-" : bookings.filter((b) => b.status === "confirmed").length },
            { label: "Total members",  value: loading ? "-" : members.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem" }}>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: MUTED, margin: "0 0 8px" }}>
                {label}
              </p>
              <p style={{ fontFamily: PLAYFAIR, fontSize: "2rem", color: GOLD, margin: 0, lineHeight: 1 }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.75rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                Calendar Sync
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
                Export confirmed Oraya bookings per villa and review external feed sync status. Sync also runs automatically every 10 minutes.
              </p>
            </div>
            <button
              onClick={runCalendarSync}
              disabled={syncingCalendars}
              style={{
                fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
                border: "none", padding: "10px 20px", cursor: syncingCalendars ? "not-allowed" : "pointer",
                opacity: syncingCalendars ? 0.7 : 1,
              }}
            >
              {syncingCalendars ? "Syncing..." : "Run sync"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px", marginBottom: "1rem" }}>
            {CALENDAR_EXPORTS.map((item) => (
              <div key={item.slug} style={{ border: `0.5px solid ${BORDER}`, padding: "14px 16px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>
                  {item.villa}
                </p>
                <a
                  href={`/api/calendar/${item.slug}.ics`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, textDecoration: "none", wordBreak: "break-all" }}
                >
                  {`/api/calendar/${item.slug}.ics`}
                </a>
              </div>
            ))}
          </div>

          {syncMessage && (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "#6fcf8a", marginBottom: "1rem" }}>
              {syncMessage}
            </p>
          )}

          {calendarSources.length === 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
              No external calendar sources configured yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", border: `0.5px solid ${BORDER}` }}>
                <thead>
                  <tr>
                    {["Villa", "Source", "Status", "Last sync", "Error"].map((heading) => (
                      <th key={heading} style={thStyle}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendarSources.map((source) => (
                    <tr key={source.id}>
                      <td style={tdStyle}>{source.villa}</td>
                      <td style={tdStyle}>
                        <span style={{ display: "block", color: WHITE }}>{source.source_name}</span>
                        <span style={{ display: "block", fontSize: "11px", color: MUTED, marginTop: "4px", wordBreak: "break-all" }}>
                          {source.feed_url}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: source.last_sync_status === "success" ? "#6fcf8a" : source.last_sync_status === "failed" ? "#e07070" : MUTED }}>
                          {formatSyncStatus(source.last_sync_status)}
                        </span>
                        {!source.is_enabled && (
                          <span style={{ display: "block", fontSize: "11px", color: MUTED, marginTop: "4px" }}>
                            Disabled
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{source.last_synced_at ? fmtDateTime(source.last_synced_at) : "-"}</td>
                      <td style={{ ...tdStyle, color: source.last_error ? "#e0b070" : MUTED }}>
                        {source.last_error?.trim() || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
            Error: {error}
          </p>
        )}

        {/* Tabs */}
        <div style={{ borderBottom: `0.5px solid ${BORDER}`, marginBottom: "1.5rem" }}>
          {tabBtn("bookings", `Bookings (${bookings.length})`)}
          {tabBtn("members",  `Members (${members.length})`)}
        </div>

        {/* Bookings table */}
        {tab === "bookings" && (
          <div>
            <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ minWidth: isMobile ? "100%" : "180px", flex: "1 1 180px" }}>
                  <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | "pending" | "confirmed" | "cancelled")}
                    style={{ ...fieldStyle, cursor: "pointer" }}
                  >
                    <option value="all" style={{ backgroundColor: MIDNIGHT }}>All</option>
                    <option value="pending" style={{ backgroundColor: MIDNIGHT }}>Pending</option>
                    <option value="confirmed" style={{ backgroundColor: MIDNIGHT }}>Confirmed</option>
                    <option value="cancelled" style={{ backgroundColor: MIDNIGHT }}>Cancelled</option>
                  </select>
                </div>
                <div style={{ minWidth: isMobile ? "100%" : "220px", flex: "1 1 220px" }}>
                  <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                    Villa
                  </label>
                  <select
                    value={villaFilter}
                    onChange={(e) => setVillaFilter(e.target.value)}
                    style={{ ...fieldStyle, cursor: "pointer" }}
                  >
                    <option value="all" style={{ backgroundColor: MIDNIGHT }}>All villas</option>
                    {villaOptions.map((villa) => (
                      <option key={villa} value={villa} style={{ backgroundColor: MIDNIGHT }}>{villa}</option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: isMobile ? "100%" : "180px", flex: "1 1 180px" }}>
                  <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
                    Check-in
                  </label>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <button
                  onClick={clearFilters}
                  style={{
                    fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                    textTransform: "uppercase", color: MUTED, backgroundColor: "transparent",
                    border: `0.5px solid ${BORDER}`, padding: "12px 18px", cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div style={{ overflowX: isMobile ? "visible" : "auto" }}>
            {loading ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading...</p>
            ) : filteredBookings.length === 0 ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No bookings match the current filters.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
                <thead>
                  <tr>
                    {(isMobile
                      ? ["Guest / Member", "Villa", "Dates", "Message", "Status", "Actions"]
                      : ["Ref", "Guest / Member", "Contact", "Villa", "Check-in", "Check-out", "Sleeping", "Visitors", "Event", "Message", "Add-ons", "Status", "Submitted", "Actions"]
                    ).map((h) => (
                      <th key={h} style={{ ...thStyle, textAlign: h === "Actions" ? "center" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b) => {
                    const isGuest     = !b.member_id;
                    const isCancelled = b.status === "cancelled";
                    const isConfirmed = b.status === "confirmed";
                    const isPending   = b.status === "pending";
                    const isUpdating  = updatingId === b.id;
                    // For member bookings, resolve contact details from the members list
                    const memberInfo   = !isGuest ? members.find((m) => m.id === b.member_id) : null;
                    const displayName  = isGuest ? (b.guest_name ?? "Guest") : (memberInfo?.full_name ?? "Member");
                    const displayEmail = isGuest ? (b.guest_email ?? "-") : (memberInfo?.email ?? "-");
                    const displayPhone   = isGuest ? b.guest_phone   : (memberInfo?.phone   ?? null);
                    const displayCountry = isGuest ? b.guest_country : (memberInfo?.country ?? null);
                    const rowOpacity     = isCancelled ? 0.72 : 1;
                    const rowBackground  = isPending ? "rgba(197,164,109,0.05)" : "transparent";
                    return (
                      <tr
                        key={b.id}
                        style={{ opacity: rowOpacity, transition: "opacity 0.2s", backgroundColor: rowBackground }}
                        onMouseEnter={(e) => { if (!isCancelled) (e.currentTarget as HTMLElement).style.backgroundColor = isPending ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBackground; }}
                      >
                        {!isMobile && (
                          <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: MUTED }}>
                            {b.id.slice(0, 8).toUpperCase()}
                          </td>
                        )}
                        <td style={tdStyle}>
                          <span style={{ color: isGuest ? "rgba(255,255,255,0.65)" : GOLD }}>
                            {displayName}
                          </span>
                          <span style={{ display: "block", fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: isGuest ? MUTED : GOLD, marginTop: "2px", opacity: isGuest ? 1 : 0.6 }}>
                            {isGuest ? "guest" : "member"}
                          </span>
                          {isMobile && (
                            <span style={{ display: "block", fontSize: "11px", marginTop: "4px", color: MUTED, lineHeight: 1.5 }}>
                              {displayEmail}
                            </span>
                          )}
                        </td>
                        {!isMobile && (
                          <td style={{ ...tdStyle, color: MUTED, fontSize: "12px" }}>
                            <span style={{ display: "block" }}>{displayEmail}</span>
                            {displayPhone && (
                              <span style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{displayPhone}</span>
                            )}
                            {displayCountry && (
                              <span style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{displayCountry}</span>
                            )}
                          </td>
                        )}
                        <td style={tdStyle}>{b.villa}</td>
                        {isMobile ? (
                          <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                            <span style={{ display: "block" }}>{fmt(b.check_in)}</span>
                            <span style={{ display: "block", fontSize: "11px", color: MUTED, marginTop: "4px" }}>
                              to {fmt(b.check_out)}
                            </span>
                          </td>
                        ) : (
                          <td style={tdStyle}>{fmt(b.check_in)}</td>
                        )}
                        {!isMobile && <td style={tdStyle}>{fmt(b.check_out)}</td>}
                        {!isMobile && <td style={{ ...tdStyle, textAlign: "center" }}>{b.sleeping_guests}</td>}
                        {!isMobile && <td style={{ ...tdStyle, textAlign: "center" }}>{b.day_visitors}</td>}
                        {!isMobile && <td style={{ ...tdStyle, color: MUTED }}>{b.event_type ?? "-"}</td>}
                        <td style={{ ...tdStyle, color: MUTED, fontSize: "12px", maxWidth: isMobile ? "180px" : "240px", whiteSpace: "normal", lineHeight: 1.5 }}>
                          {b.message?.trim() || "-"}
                        </td>
                        {!isMobile && (
                          <td style={{ ...tdStyle, color: MUTED, fontSize: "12px" }}>
                            {b.addons && b.addons.length > 0
                              ? b.addons.map(a => a.label).join(", ")
                              : "-"}
                          </td>
                        )}
                        <td style={tdStyle}><StatusBadge status={b.status} /></td>
                        {!isMobile && (
                          <td style={{ ...tdStyle, color: MUTED, fontSize: "11px", whiteSpace: "nowrap" }}>{fmtDateTime(b.created_at)}</td>
                        )}
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {isCancelled ? (
                            <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED }}>-</span>
                          ) : (
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                              {isPending && (
                                <button
                                  onClick={() => updateStatus(b.id, "confirmed")}
                                  disabled={isUpdating}
                                  style={{
                                    fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                                    textTransform: "uppercase",
                                    color: "#2E2E2E",
                                    backgroundColor: isUpdating ? "rgba(80,180,100,0.5)" : "#6fcf8a",
                                    border: "none",
                                    padding: "5px 12px",
                                    cursor: isUpdating ? "not-allowed" : "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                  onMouseEnter={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#50c472"; }}
                                  onMouseLeave={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#6fcf8a"; }}
                                >
                                  Confirm
                                </button>
                              )}
                              {(isPending || isConfirmed) && (
                                <button
                                  onClick={() => updateStatus(b.id, "cancelled")}
                                  disabled={isUpdating}
                                  style={{
                                    fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                                    textTransform: "uppercase",
                                    color: WHITE,
                                    backgroundColor: isUpdating ? "rgba(224,112,112,0.5)" : "#e07070",
                                    border: "none",
                                    padding: "5px 12px",
                                    cursor: isUpdating ? "not-allowed" : "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                  onMouseEnter={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#c85a5a"; }}
                                  onMouseLeave={(e) => { if (!isUpdating) (e.currentTarget as HTMLElement).style.backgroundColor = "#e07070"; }}
                                >
                                  Cancel
                                </button>
                              )}
                              {emailWarnings[b.id] && (
                                <span style={{ display: "block", width: "100%", fontFamily: LATO, fontSize: "10px", color: "#e0b070", marginTop: "4px", lineHeight: 1.4 }}>
                                  {emailWarnings[b.id]}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          </div>
        )}

        {/* Members table */}
        {tab === "members" && (
          <div style={{ overflowX: "auto" }}>
            {loading ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading...</p>
            ) : members.length === 0 ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No members yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
                <thead>
                  <tr>
                    {["Name", "Email", "Phone", "Country", "Address", "Joined", ""].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <td style={tdStyle}>{m.full_name || "-"}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{m.email || "-"}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{m.phone || "-"}</td>
                      <td style={tdStyle}>{m.country || "-"}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{m.address || "-"}</td>
                      <td style={{ ...tdStyle, color: MUTED, fontSize: "11px" }}>{fmt(m.created_at)}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button
                          onClick={() => deleteMember(m.id, m.full_name || m.email || m.id)}
                          disabled={deletingId === m.id}
                          style={{
                            fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px",
                            textTransform: "uppercase", color: "#e07070",
                            backgroundColor: "transparent",
                            border: "0.5px solid rgba(224,112,112,0.3)",
                            padding: "5px 12px", cursor: deletingId === m.id ? "not-allowed" : "pointer",
                            opacity: deletingId === m.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => { if (deletingId !== m.id) (e.currentTarget as HTMLElement).style.borderColor = "#e07070"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(224,112,112,0.3)"; }}
                        >
                          {deletingId === m.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

