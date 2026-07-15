import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

/**
 * Public Explore / Living List page (Phase 16C Stage 1).
 *
 * This is the destination of the printed House Book "living list" QR codes
 * (https://stayoraya.com/explore/mechmech and /explore/byblos — permanent
 * route contract, see DECISIONS_LOG). Public content only: villa-area
 * guide seeded from the approved Claude Design package. No access codes,
 * no guest-specific data, no booking data. Venue names ship later —
 * copy stays placeholder-free until David approves specific venues.
 *
 * Styling follows the site convention (inline styles + theme CSS vars) so
 * the page is mobile-first and dark-mode aware like the villa pages.
 */

const GOLD = "var(--oraya-gold)";
const GOLD_CTA = "var(--oraya-gold-cta-text)";
const SURFACE = "var(--oraya-surface)";
const BG = "var(--oraya-bg)";
const INK = "var(--oraya-ink)";
const MUTED = "var(--oraya-text-muted)";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO = "'Lato', system-ui, sans-serif";

export interface ExploreAttraction {
  time: string; // "~10 min"
  name: string; // "Byblos Castle"
  text: string;
}

export interface ExploreContent {
  villaName: string;      // "Villa Mechmech"
  areaEyebrow: string;    // "Around Villa Mechmech"
  localityLine: string;   // "Mechmech · near Annaya · Mount Lebanon"
  intro: string;
  plateSrc: string;       // area/coast plate SVG under /explore/
  plateAlt: string;
  attractions: ExploreAttraction[];
  tablesTitle: string;
  tablesCopy: string;     // placeholder-free
  practicalTitle: string;
  practicalCopy: string;  // placeholder-free
  mapsUrl: string;
  villaHref: string;
  houseBookHref: string;
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "4px",
  textTransform: "uppercase",
  color: GOLD,
  margin: "0 0 12px",
};

function ActionButton({ href, primary = false, external = false, children }: {
  href: string;
  primary?: boolean;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="oraya-pressable oraya-cta-gold-hover"
      style={{
        display: "block",
        textAlign: "center",
        fontFamily: LATO,
        fontSize: "11px",
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: "14px 20px",
        ...(primary
          ? { color: GOLD_CTA, backgroundColor: GOLD }
          : { color: GOLD, border: `1px solid ${GOLD}`, backgroundColor: "transparent" }),
      }}
    >
      {children}
    </a>
  );
}

export default function ExploreVillaPage({ content }: { content: ExploreContent }) {
  const c = content;
  return (
    <div style={{ overflowX: "hidden" }}>
      <SiteNav base="/" />

      {/* ── Header ── */}
      <section className="oraya-section-tone" style={{ backgroundColor: BG, padding: "120px clamp(1rem, 5vw, 3rem) 3rem" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}>
          <p style={eyebrowStyle}>{c.areaEyebrow}</p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(2rem, 6vw, 3rem)", fontWeight: 400, color: INK, margin: "0 0 6px", lineHeight: 1.15 }}>
            The <em style={{ fontStyle: "italic" }}>Living List</em>
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: MUTED, margin: "0 0 24px" }}>
            {c.localityLine}
          </p>
          <img src={c.plateSrc} alt={c.plateAlt} style={{ width: "min(320px, 80%)", display: "block", margin: "0 auto 24px" }} />
          <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, lineHeight: 1.85, fontWeight: 300, margin: 0 }}>
            {c.intro}
          </p>
        </div>
      </section>

      {/* ── Attractions ── */}
      <section className="oraya-section-tone" style={{ backgroundColor: SURFACE, padding: "3.5rem clamp(1rem, 5vw, 3rem)" }}>
        <div style={{ maxWidth: "980px", margin: "0 auto" }}>
          <p style={{ ...eyebrowStyle, textAlign: "center" }}>Worth the drive</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "18px" }}>
            {c.attractions.map((a) => (
              <div
                key={a.name}
                style={{
                  border: `1px solid ${GOLD}`,
                  borderRadius: "999px 999px 0 0",
                  padding: "34px 20px 22px",
                  textAlign: "center",
                  backgroundColor: BG,
                }}
              >
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--oraya-gold)", margin: "0 0 8px" }}>
                  {a.time}
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "19px", color: INK, margin: "0 0 10px", lineHeight: 1.3 }}>{a.name}</p>
                <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.7, fontWeight: 300, margin: 0 }}>{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tables & practical ── */}
      <section className="oraya-section-tone" style={{ backgroundColor: BG, padding: "3.5rem clamp(1rem, 5vw, 3rem)" }}>
        <div style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "18px" }}>
          <div style={{ backgroundColor: SURFACE, border: "0.5px solid rgba(197,164,109,0.25)", padding: "26px 24px" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
              {c.tablesTitle}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "13.5px", color: MUTED, lineHeight: 1.8, fontWeight: 300, margin: 0 }}>{c.tablesCopy}</p>
          </div>
          <div style={{ backgroundColor: SURFACE, border: "0.5px solid rgba(197,164,109,0.25)", padding: "26px 24px" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
              {c.practicalTitle}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "13.5px", color: MUTED, lineHeight: 1.8, fontWeight: 300, margin: 0 }}>{c.practicalCopy}</p>
          </div>
        </div>
      </section>

      {/* ── Oraya arranges + actions ── */}
      <section className="oraya-section-tone" style={{ backgroundColor: SURFACE, padding: "3.5rem clamp(1rem, 5vw, 3rem) 4.5rem" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", textAlign: "center" }}>
          <img src="/explore/oraya-olive-mark.svg" alt="" style={{ width: "52px", display: "block", margin: "0 auto 14px" }} />
          <p style={eyebrowStyle}>Oraya arranges</p>
          <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, lineHeight: 1.85, fontWeight: 300, margin: "0 0 28px" }}>
            Reservations, drivers, boat days, guided visits — message the concierge at{" "}
            <strong style={{ color: INK, fontWeight: 700 }}>+961 71 140 041</strong>, day or night.
          </p>
          <div style={{ display: "grid", gap: "12px" }}>
            <ActionButton href="https://wa.me/96171140041" external primary>
              Message Oraya on WhatsApp
            </ActionButton>
            <ActionButton href={c.mapsUrl} external>
              Open {c.villaName} in Google Maps
            </ActionButton>
            <ActionButton href={c.houseBookHref}>The House Book</ActionButton>
            <ActionButton href={c.villaHref}>{c.villaName}</ActionButton>
          </div>
          <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", color: MUTED, margin: "26px 0 0" }}>
            <a href="https://stayoraya.com" className="oraya-link-text" style={{ color: GOLD, textDecoration: "none" }}>
              stayoraya.com
            </a>
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
