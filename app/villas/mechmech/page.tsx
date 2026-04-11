"use client";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import OrayaEmblem from "@/components/OrayaEmblem";

// ── PLACEHOLDER IMAGE — swap with real photo URL when ready ──────────────────
// Recommended: 1920×800, landscape orientation
const HERO_IMG      = ""; // e.g. "/photos/mechmech-hero.jpg"
const HERO_GRADIENT = "linear-gradient(160deg, #1b3a2f 0%, #2b5040 35%, #1a2f24 65%, #0f1e17 100%)";

const GOLD      = "#C5A46D";
const WHITE     = "#FFFFFF";
const BEIGE     = "#EAE3D9";
const BEIGELIGHT = "#F5F1EB";
const CHARCOAL  = "#2E2E2E";
const MIDNIGHT  = "#1F2B38";
const MUTED     = "#8a8070";
const PLAYFAIR  = "'Playfair Display', Georgia, serif";
const LATO      = "'Lato', system-ui, sans-serif";

const details = [
  { label: "Bedrooms",   value: "3 (master with en-suite)" },
  { label: "Bathrooms",  value: "3" },
  { label: "Pool",       value: "Heated private pool" },
  { label: "Terrace",    value: "Rooftop terrace" },
  { label: "Winter room",value: "Panoramic — converts to open-air" },
  { label: "Outdoor",    value: "BBQ & stamped concrete terraces" },
  { label: "Parking",    value: "Private parking" },
  { label: "Amenities",  value: "Towels, robes, slippers, toiletries" },
];

const highlights = [
  "No AC needed — natural mountain breeze at night",
  "5 minutes from Saint Charbel Monastery",
  "Private modern villa in a charming mountain town",
  "Sleeps 6 (up to 8 with extra bedding), up to 25 day visitors",
];

export default function VillaMechmechPage() {
  return (
    <>
      <SiteNav base="/" />

      {/* ── Hero ── */}
      <section style={{ paddingTop: "80px", backgroundColor: MIDNIGHT, minHeight: "65vh", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1,
          minHeight: "520px",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          ...(HERO_IMG
            ? { backgroundImage: `url(${HERO_IMG})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundImage: HERO_GRADIENT }),
        }}>
          {/* Placeholder text — hidden once HERO_IMG is set */}
          {!HERO_IMG && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", opacity: 0.25 }}>
              <div style={{ width: "64px" }}>
                <OrayaEmblem />
              </div>
              <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: WHITE }}>
                Villa photography coming soon
              </span>
            </div>
          )}

          {/* Bottom overlay — gradient for photos, solid-ish for gradient bg */}
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            background: HERO_IMG
              ? "linear-gradient(to top, rgba(10,20,28,0.95) 0%, rgba(10,20,28,0.6) 50%, transparent 100%)"
              : "linear-gradient(to top, rgba(10,18,25,0.98) 0%, rgba(10,18,25,0.7) 55%, transparent 100%)",
            padding: "2.5rem 3rem 2rem",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}>
            <div>
              <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "6px" }}>
                Nature retreat · Mechmech, North Lebanon
              </p>
              <h1 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.8rem, 4vw, 3rem)", fontWeight: 400, color: WHITE, margin: 0, lineHeight: 1.15 }}>
                Villa Mechmech<br />
                <span style={{ fontStyle: "italic", opacity: 0.7 }}>Modern Mountain Retreat</span>
              </h1>
            </div>
            <a
              href="/book?villa=Villa+Mechmech"
              style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
                textTransform: "uppercase", color: CHARCOAL,
                backgroundColor: GOLD, padding: "14px 36px",
                textDecoration: "none", flexShrink: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
            >
              Book this villa
            </a>
          </div>
        </div>
      </section>

      {/* ── Description ── */}
      <section style={{ backgroundColor: WHITE, padding: "5rem 3rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            About the villa
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 400, color: CHARCOAL, lineHeight: 1.25, marginBottom: "1.5rem" }}>
            Where modern design meets<br />mountain serenity
          </h2>
          <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, marginBottom: "1.75rem" }} />
          <p style={{ fontFamily: LATO, fontSize: "15px", color: MUTED, lineHeight: 1.9, fontWeight: 300 }}>
            A modern luxury retreat nestled in the mountains of North Lebanon. Sleek design meets mountain serenity — heated pool, stamped concrete terraces, panoramic views, and cool mountain breezes. Just 5 minutes from Saint Charbel Monastery.
          </p>
        </div>
      </section>

      {/* ── Details ── */}
      <section style={{ backgroundColor: BEIGELIGHT, padding: "5rem 3rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Villa details
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.4rem, 2.5vw, 2rem)", fontWeight: 400, color: CHARCOAL, marginBottom: "2.5rem" }}>
            Everything included
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1px", backgroundColor: "rgba(197,164,109,0.15)" }}>
            {details.map(({ label, value }) => (
              <div key={label} style={{ backgroundColor: WHITE, padding: "1.5rem 1.75rem" }}>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, marginBottom: "6px" }}>
                  {label}
                </p>
                <p style={{ fontFamily: LATO, fontSize: "14px", color: CHARCOAL, fontWeight: 300, lineHeight: 1.5 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Highlights ── */}
      <section style={{ backgroundColor: MIDNIGHT, padding: "5rem 3rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Why Mechmech
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.4rem, 2.5vw, 2rem)", fontWeight: 400, color: WHITE, marginBottom: "2.5rem" }}>
            What makes it special
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 3rem", display: "flex", flexDirection: "column", gap: "16px" }}>
            {highlights.map((h) => (
              <li key={h} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <span style={{ color: GOLD, fontSize: "10px", marginTop: "4px", flexShrink: 0 }}>◆</span>
                <span style={{ fontFamily: LATO, fontSize: "15px", color: "rgba(255,255,255,0.65)", fontWeight: 300, lineHeight: 1.7 }}>{h}</span>
              </li>
            ))}
          </ul>

          <a
            href="/book?villa=Villa+Mechmech"
            style={{
              display: "inline-block",
              fontFamily: LATO,
              fontSize: "11px",
              letterSpacing: "2.5px",
              textTransform: "uppercase",
              color: CHARCOAL,
              backgroundColor: GOLD,
              padding: "15px 44px",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
          >
            Book this villa
          </a>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
