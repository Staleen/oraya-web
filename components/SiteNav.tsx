"use client";
import { useState, useEffect, useRef } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import { supabase } from "@/lib/supabase";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const LATO     = "'Lato', system-ui, sans-serif";

interface Props {
  /** prefix for anchor links — pass "/" when not on homepage */
  base?: string;
}

export default function SiteNav({ base = "" }: Props) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [firstName, setFirstName]   = useState("");
  const [authReady, setAuthReady]   = useState(false);
  const [dropOpen, setDropOpen]     = useState(false);
  const closeTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openDrop() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setDropOpen(true);
  }
  function scheduleDrop() {
    closeTimer.current = setTimeout(() => setDropOpen(false), 200);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setIsLoggedIn(true);
        const { data } = await supabase
          .from("members")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (data?.full_name) setFirstName(data.full_name.split(" ")[0]);
      }
      setAuthReady(true);
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const navLinks = [
    { href: `${base}#villas`,     label: "Our villas" },
    { href: `${base}#experience`, label: "Experience" },
    { href: "/events/inquiry",    label: "Events" },
    ...(!isLoggedIn ? [{ href: `${base}#membership`, label: "Membership" }] : []),
  ];

  return (
    <nav style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 100,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "1.1rem 3rem",
      backgroundColor: "rgba(255,255,255,0.97)",
      borderBottom: "0.5px solid rgba(197,164,109,0.2)",
      backdropFilter: "blur(8px)",
    }}>
      <a href="/" style={{ width: "44px", height: "44px", flexShrink: 0, display: "block", cursor: "pointer" }}>
        <OrayaEmblem />
      </a>

      <ul style={{ display: "flex", gap: "2.5rem", listStyle: "none", margin: 0, padding: 0 }}>
        {navLinks.map(({ href, label }) => (
          <li key={label}>
            <a
              href={href}
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, textDecoration: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>

      {/* Auth nav — hidden until session resolves to avoid flash */}
      {authReady && (
        isLoggedIn ? (
          /* ── Logged-in dropdown ── */
          <div
            style={{ position: "relative" }}
            onMouseEnter={openDrop}
            onMouseLeave={scheduleDrop}
          >
            <button
              style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px",
                textTransform: "uppercase", color: GOLD,
                backgroundColor: "transparent", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 0",
              }}
              onClick={() => setDropOpen((o) => !o)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              Hi, {firstName || "Member"}
              <span style={{ fontSize: "7px", opacity: 0.5, marginTop: "1px" }}>▾</span>
            </button>

            {dropOpen && (
              <div style={{
                position: "absolute", top: "100%", right: 0,
                minWidth: "180px",
                zIndex: 200,
              }}>
              <div style={{
                backgroundColor: WHITE,
                border: "0.5px solid rgba(197,164,109,0.25)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
              }}>
                <a
                  href="/profile"
                  style={{
                    display: "block", padding: "13px 20px",
                    fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                    textTransform: "uppercase", color: CHARCOAL, textDecoration: "none",
                    borderBottom: "0.5px solid rgba(197,164,109,0.15)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(197,164,109,0.07)";
                    (e.currentTarget as HTMLElement).style.color = GOLD;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    (e.currentTarget as HTMLElement).style.color = CHARCOAL;
                  }}
                >
                  My Profile
                </a>
                <button
                  onClick={signOut}
                  style={{
                    display: "block", width: "100%",
                    padding: "13px 20px", textAlign: "left",
                    fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                    textTransform: "uppercase", color: MUTED,
                    backgroundColor: "transparent", border: "none", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(197,164,109,0.07)";
                    (e.currentTarget as HTMLElement).style.color = CHARCOAL;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    (e.currentTarget as HTMLElement).style.color = MUTED;
                  }}
                >
                  Sign Out
                </button>
              </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Logged-out: Sign In + Reserve ── */
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <a
              href="/login"
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, textDecoration: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
            >
              Sign In
            </a>
            <a
              href="/book"
              style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "2px",
                textTransform: "uppercase", color: GOLD,
                border: "0.5px solid #C5A46D", padding: "10px 28px",
                backgroundColor: "transparent", textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = GOLD;
                (e.currentTarget as HTMLElement).style.color = WHITE;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                (e.currentTarget as HTMLElement).style.color = GOLD;
              }}
            >
              Reserve
            </a>
          </div>
        )
      )}
    </nav>
  );
}
