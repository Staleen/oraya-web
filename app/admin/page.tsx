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

function fmt(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
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

// ─── Password gate ───────────────────────────────────────────────────────────

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
            {loading ? "Verifying…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}

// ─── Main dashboard ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed]             = useState<boolean | null>(null);
  const [bookings, setBookings]         = useState<Booking[]>([]);
  const [members, setMembers]           = useState<Member[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [tab, setTab]                   = useState<"bookings" | "members">("bookings");

  // WhatsApp setting
  const [whatsappNum, setWhatsappNum]       = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved]   = useState(false);

  // Password change
  const [newPassword, setNewPassword]       = useState("");
  const [pwSaving, setPwSaving]             = useState(false);
  const [pwSaved, setPwSaved]               = useState(false);

  // Member deletion
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  // Check sessionStorage on mount
  useEffect(() => {
    const ok = sessionStorage.getItem(SESSION_KEY) === "1";
    setAuthed(ok);
  }, []);

  // Load data once authenticated
  useEffect(() => {
    if (authed !== true) return;

    fetch("/api/admin/data", { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        console.log("[admin] /api/admin/data raw response:", text);
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Non-JSON response (${r.status}): ${text.slice(0, 200)}`);
        }
      })
      .then((d) => {
        if (d.error) {
          console.error("[admin] data error from API:", d.error);
          setError(d.error);
          return;
        }
        console.log(`[admin] loaded ${d.bookings?.length ?? 0} bookings, ${d.members?.length ?? 0} members`);
        setBookings(d.bookings ?? []);
        setMembers(d.members ?? []);
      })
      .catch((e) => {
        console.error("[admin] fetch error:", e);
        setError(e.message);
      })
      .finally(() => setLoading(false));

    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const wa = (d.settings ?? []).find((s: { key: string; value: string }) => s.key === "whatsapp_number");
        if (wa) setWhatsappNum(wa.value);
      })
      .catch((e) => console.error("[admin] settings fetch error:", e));
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

  async function updateStatus(id: string, status: string) {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to update status."); }
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

  // Waiting for session check
  if (authed === null) return null;

  // Not authenticated → show gate
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  // ── Dashboard ──
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
            ← Back to site
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
                {whatsappSaving ? "Saving…" : "Save"}
              </button>
              {whatsappSaved && (
                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>✓ Saved</span>
              )}
            </div>
          </div>

          {/* Change password */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
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
                {pwSaving ? "Saving…" : "Update password"}
              </button>
              {pwSaved && (
                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>✓ Password updated</span>
              )}
            </div>
          </div>
        </div>

        {/* Media Manager */}
        <MediaManager />

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "2.5rem" }}>
          {[
            { label: "Total bookings", value: loading ? "—" : bookings.length },
            { label: "Pending",        value: loading ? "—" : bookings.filter((b) => b.status === "pending").length },
            { label: "Confirmed",      value: loading ? "—" : bookings.filter((b) => b.status === "confirmed").length },
            { label: "Total members",  value: loading ? "—" : members.length },
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
          <div style={{ overflowX: "auto" }}>
            {loading ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading…</p>
            ) : bookings.length === 0 ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No bookings yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
                <thead>
                  <tr>
                    {["Ref", "Guest / Member", "Contact", "Villa", "Check-in", "Check-out", "Sleeping", "Visitors", "Event", "Status", "Submitted"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center" }}>Update status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const isGuest = !b.member_id;
                    const displayName  = isGuest ? (b.guest_name ?? "Guest") : "Member";
                    const displayEmail = isGuest ? (b.guest_email ?? "—") : "—";
                    return (
                      <tr key={b.id}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      >
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: MUTED }}>
                          {b.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: isGuest ? "rgba(255,255,255,0.65)" : GOLD }}>
                            {displayName}
                          </span>
                          {isGuest && (
                            <span style={{ display: "block", fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: MUTED, marginTop: "2px" }}>
                              guest
                            </span>
                          )}
                          {!isGuest && (
                            <span style={{ display: "block", fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: GOLD, marginTop: "2px", opacity: 0.6 }}>
                              member
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: MUTED, fontSize: "12px" }}>
                          <span style={{ display: "block" }}>{displayEmail}</span>
                          {isGuest && b.guest_phone && (
                            <span style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{b.guest_phone}</span>
                          )}
                          {isGuest && b.guest_country && (
                            <span style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>{b.guest_country}</span>
                          )}
                        </td>
                        <td style={tdStyle}>{b.villa}</td>
                        <td style={tdStyle}>{fmt(b.check_in)}</td>
                        <td style={tdStyle}>{fmt(b.check_out)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{b.sleeping_guests}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{b.day_visitors}</td>
                        <td style={{ ...tdStyle, color: MUTED }}>{b.event_type ?? "—"}</td>
                        <td style={tdStyle}><StatusBadge status={b.status} /></td>
                        <td style={{ ...tdStyle, color: MUTED, fontSize: "11px" }}>{fmt(b.created_at)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <select
                            value={b.status}
                            onChange={(e) => updateStatus(b.id, e.target.value)}
                            style={{
                              fontFamily: LATO, fontSize: "11px", letterSpacing: "1px",
                              backgroundColor: "rgba(255,255,255,0.05)", color: WHITE,
                              border: `0.5px solid ${BORDER}`, padding: "6px 10px",
                              cursor: "pointer", outline: "none",
                            }}
                          >
                            <option value="pending"   style={{ backgroundColor: MIDNIGHT }}>Pending</option>
                            <option value="confirmed" style={{ backgroundColor: MIDNIGHT }}>Confirmed</option>
                            <option value="cancelled" style={{ backgroundColor: MIDNIGHT }}>Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Members table */}
        {tab === "members" && (
          <div style={{ overflowX: "auto" }}>
            {loading ? (
              <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading…</p>
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
                      <td style={tdStyle}>{m.full_name || "—"}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{m.email || "—"}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{m.phone || "—"}</td>
                      <td style={tdStyle}>{m.country || "—"}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{m.address || "—"}</td>
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
                          {deletingId === m.id ? "Deleting…" : "Delete"}
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
