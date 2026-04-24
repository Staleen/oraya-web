"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { BORDER, GOLD, MUTED, PLAYFAIR, WHITE, LATO } from "@/components/admin/theme";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/rates", label: "Rates" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAdminData();
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;

  return (
    <main style={{ backgroundColor: "#1F2B38", minHeight: "100vh", padding: "0", overflowX: "hidden" }}>
      <div style={{
        display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "14px",
        padding: isMobile ? "1rem 1rem 0.9rem" : "1.25rem 2.5rem", borderBottom: `0.5px solid ${BORDER}`,
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
        <div style={{ display: "flex", gap: isMobile ? "0.75rem" : "2rem", alignItems: "center", flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end", width: isMobile ? "100%" : "auto" }}>
          <a
            href="/"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, textDecoration: "none", padding: isMobile ? "10px 0" : 0 }}
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
              border: "none", cursor: "pointer", padding: isMobile ? "10px 0" : 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#e07070"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? "0 1rem" : "0 2.5rem", borderBottom: `0.5px solid ${BORDER}`, overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ display: "flex", gap: isMobile ? "1.25rem" : "2rem", minWidth: "max-content" }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "inline-block",
                fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px",
                textTransform: "uppercase", color: pathname === item.href ? GOLD : MUTED,
                textDecoration: "none",
                borderBottom: pathname === item.href ? `1px solid ${GOLD}` : "1px solid transparent",
                padding: isMobile ? "14px 0" : "10px 0", whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? "1rem" : "2.5rem", overflowX: "hidden" }}>
        {children}
      </div>
    </main>
  );
}
