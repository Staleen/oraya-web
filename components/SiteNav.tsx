"use client";
import OrayaEmblem from "@/components/OrayaEmblem";

const GOLD    = "#C5A46D";
const WHITE   = "#FFFFFF";
const CHARCOAL = "#2E2E2E";
const LATO    = "'Lato', system-ui, sans-serif";

interface Props {
  /** prefix for anchor links — pass "/" when not on homepage */
  base?: string;
}

export default function SiteNav({ base = "" }: Props) {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1.1rem 3rem",
        backgroundColor: "rgba(255,255,255,0.97)",
        borderBottom: "0.5px solid rgba(197,164,109,0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      <a href="/" style={{ width: "44px", height: "44px", flexShrink: 0, display: "block" }}>
        <OrayaEmblem />
      </a>

      <ul style={{ display: "flex", gap: "2.5rem", listStyle: "none", margin: 0, padding: 0 }}>
        {[
          { href: `${base}#villas`,     label: "Our villas" },
          { href: `${base}#experience`, label: "Experience" },
          { href: `${base}#events`,     label: "Events" },
          { href: `${base}#membership`, label: "Membership" },
        ].map(({ href, label }) => (
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

      <a
        href="/join"
        style={{
          fontFamily: LATO,
          fontSize: "11px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: GOLD,
          border: "0.5px solid #C5A46D",
          padding: "10px 28px",
          backgroundColor: "transparent",
          textDecoration: "none",
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
    </nav>
  );
}
