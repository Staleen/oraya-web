"use client";
import { useEffect, useState } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";
const SURFACE  = "rgba(255,255,255,0.03)";
const BORDER   = "rgba(197,164,109,0.12)";

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
      fontFamily: LATO,
      fontSize: "10px",
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      color: text[status] ?? MUTED,
      backgroundColor: colors[status] ?? "transparent",
      padding: "3px 10px",
      borderRadius: "2px",
    }}>
      {status}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  fontFamily: LATO,
  fontSize: "9px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  padding: "12px 16px",
  textAlign: "left",
  borderBottom: `0.5px solid ${BORDER}`,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  fontFamily: LATO,
  fontSize: "13px",
  fontWeight: 300,
  color: "rgba(255,255,255,0.75)",
  padding: "14px 16px",
  borderBottom: `0.5px solid rgba(255,255,255,0.04)`,
  verticalAlign: "middle",
};

export default function AdminPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [members, setMembers]   = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [tab, setTab]           = useState<"bookings" | "members">("bookings");

  useEffect(() => {
    fetch("/api/admin/data")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setBookings(d.bookings);
        setMembers(d.members);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: string) {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b))
    );
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to update status.");
    }
  }

  const tabBtn = (t: "bookings" | "members", label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        fontFamily: LATO,
        fontSize: "10px",
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        color: tab === t ? GOLD : MUTED,
        backgroundColor: "transparent",
        border: "none",
        borderBottom: tab === t ? `1px solid ${GOLD}` : "1px solid transparent",
        padding: "10px 0",
        cursor: "pointer",
        marginRight: "2rem",
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "0" }}>
      {/* Top bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.25rem 2.5rem",
        borderBottom: `0.5px solid ${BORDER}`,
        backgroundColor: "rgba(31,43,56,0.98)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "32px" }}><OrayaEmblem /></div>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Oraya
            </p>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "15px", color: WHITE, margin: 0, lineHeight: 1.2 }}>
              Admin dashboard
            </p>
          </div>
        </div>
        <a
          href="/"
          style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
        >
          ← Back to site
        </a>
      </div>

      <div style={{ padding: "2.5rem" }}>
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
                    {["Ref", "Villa", "Check-in", "Check-out", "Sleeping", "Visitors", "Event", "Status", "Submitted"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center" }}>Update status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: MUTED }}>
                        {b.id.slice(0, 8).toUpperCase()}
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
                            fontFamily: LATO,
                            fontSize: "11px",
                            letterSpacing: "1px",
                            backgroundColor: "rgba(255,255,255,0.05)",
                            color: WHITE,
                            border: `0.5px solid ${BORDER}`,
                            padding: "6px 10px",
                            cursor: "pointer",
                            outline: "none",
                          }}
                        >
                          <option value="pending"   style={{ backgroundColor: MIDNIGHT }}>Pending</option>
                          <option value="confirmed" style={{ backgroundColor: MIDNIGHT }}>Confirmed</option>
                          <option value="cancelled" style={{ backgroundColor: MIDNIGHT }}>Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
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
                    {["Name", "Email", "Phone", "Country", "Address", "Joined"].map((h) => (
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
