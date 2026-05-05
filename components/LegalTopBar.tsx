"use client";

import Link from "next/link";
import OrayaEmblem from "@/components/OrayaEmblem";
import PublicThemeToggle from "@/components/PublicThemeToggle";

const LATO = "'Lato', system-ui, sans-serif";

const LINKS = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Refund", href: "/legal/refund" },
  { label: "Payment", href: "/legal/payment" },
] as const;

export default function LegalTopBar() {
  return (
    <header
      style={{
        backgroundColor: "var(--oraya-surface)",
        padding: "1.5rem 2rem",
        borderBottom: "0.5px solid var(--oraya-nav-border)",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
          <div style={{ width: "32px" }}>
            <OrayaEmblem />
          </div>
          <span
            style={{
              fontFamily: LATO,
              fontSize: "11px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "var(--oraya-gold)",
            }}
          >
            Oraya
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <nav style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            {LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                style={{
                  fontFamily: LATO,
                  fontSize: "11px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--oraya-text-muted)",
                  textDecoration: "none",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <PublicThemeToggle variant="public" />
        </div>
      </div>
    </header>
  );
}
