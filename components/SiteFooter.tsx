"use client";
import OrayaLogoFull from "@/components/OrayaLogoFull";

const GOLD    = "#C5A46D";
const CHARCOAL = "#2E2E2E";
const MUTED   = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO    = "'Lato', system-ui, sans-serif";

export default function SiteFooter() {
  const columns = [
    {
      title: "Explore",
      links: [
        { label: "Villa Mechmech", href: "/villas/mechmech" },
        { label: "Villa Byblos",   href: "/villas/byblos" },
        { label: "Gallery",        href: "#" },
        { label: "Events",         href: "/events/inquiry" },
      ],
    },
    {
      title: "Members",
      links: [
        { label: "Join Oraya",   href: "/join" },
        { label: "Sign in",      href: "/login" },
        { label: "My bookings",  href: "#" },
        { label: "My profile",   href: "#" },
      ],
    },
    {
      title: "Contact",
      links: [
        { label: "hello@oraya.com", href: "mailto:hello@oraya.com" },
        { label: "WhatsApp",        href: "#" },
        { label: "Instagram",       href: "#" },
        { label: "Lebanon",         href: "#" },
      ],
    },
  ];

  return (
    <>
      {/* Social strip */}
      <div style={{ backgroundColor: CHARCOAL, padding: "3rem", textAlign: "center" }}>
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "1.5rem" }}>
          Follow Oraya
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "2.5rem" }}>
          {["Instagram", "TikTok", "Facebook"].map((s) => (
            <a
              key={s}
              href="#"
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, textDecoration: "none", borderBottom: "0.5px solid rgba(197,164,109,0.25)", paddingBottom: "2px" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderBottomColor = GOLD; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderBottomColor = "rgba(197,164,109,0.25)"; }}
            >
              {s}
            </a>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer style={{ backgroundColor: CHARCOAL, padding: "4.5rem 3rem 2rem", borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "3rem", marginBottom: "3rem" }}>
          <div>
            <div style={{ width: "120px", marginBottom: "1.25rem" }}>
              <OrayaLogoFull />
            </div>
            <p style={{ fontFamily: PLAYFAIR, fontStyle: "italic", fontSize: "13px", color: "rgba(255,255,255,0.3)", lineHeight: 1.8, marginTop: "0.5rem" }}>
              &ldquo;A boutique sanctuary<br />of luxury and tranquility.&rdquo;
            </p>
          </div>
          {columns.map(({ title, links }) => (
            <div key={title}>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
                {title}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {links.map(({ label, href }) => (
                  <li key={label} style={{ marginBottom: "8px" }}>
                    <a
                      href={href}
                      style={{ fontFamily: LATO, fontSize: "13px", fontWeight: 300, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)"; }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid rgba(255,255,255,0.07)", paddingTop: "1.5rem", fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.18)" }}>
          <span>© 2026 Oraya. All rights reserved.</span>
          <span>Lebanon · Boutique Villas</span>
        </div>
      </footer>
    </>
  );
}
