"use client";
import { Fragment, useState, useEffect } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import OrayaLogoFull from "@/components/OrayaLogoFull";
import LegalEntityNotice from "@/components/LegalEntityNotice";
import PublicThemeToggle from "@/components/PublicThemeToggle";
import { VILLA_FROM_PRICE_MICROLABEL, formatVillaFromPrice } from "@/lib/admin-pricing";
import {
  GUEST_TESTIMONIALS_SETTINGS_KEY,
  getApprovedPublicTestimonials,
  parseGuestTestimonialsJson,
  type GuestTestimonialRecord,
} from "@/lib/guest-testimonials";
import { usePublicPricing } from "@/lib/public-pricing";
import { supabase } from "@/lib/supabase";

// Branded gradient fallbacks
const GRAD_HERO     = "linear-gradient(145deg, #1a2a38 0%, #243444 45%, #1c2e3e 75%, #111e2a 100%)";
const GRAD_MECHMECH = "linear-gradient(160deg, #1b3a2f 0%, #2b5040 45%, #162a20 80%, #0e1e17 100%)";
const GRAD_BYBLOS   = "linear-gradient(160deg, #283520 0%, #3a5028 45%, #1e2e14 80%, #131d0c 100%)";

function villaBg(img: string, gradient: string): React.CSSProperties {
  return img
    ? { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: gradient };
}

const GOLD       = "var(--oraya-gold)";
const WHITE      = "var(--oraya-surface)";
const BEIGE      = "var(--oraya-surface-muted)";
const BEIGELIGHT = "var(--oraya-bg)";
const CHARCOAL   = "var(--oraya-ink)";
const MIDNIGHT   = "var(--oraya-band-dark-bg)";
const MUTED      = "var(--oraya-text-muted)";
const BAND_TEXT  = "var(--oraya-band-text)";
const BAND_MUTED = "var(--oraya-band-muted)";
const BAND_MUTED2 = "var(--oraya-band-muted-2)";
const ON_GOLD    = "var(--oraya-on-gold-text)";
const PLAYFAIR   = "'Playfair Display', Georgia, serif";
const LATO       = "'Lato', system-ui, sans-serif";

/** Mobile section rhythm: tight / medium / large — desktop keeps original `md:` padding. */
const SEC = {
  px: "px-4 sm:px-6 md:px-12",
  medY: "py-12 md:py-28",
  trustY: "py-10 md:py-20",
} as const;

const villaMeta = [
  {
    key:      "mechmech",
    tag:      "Nature retreat",
    name:     "Villa Mechmech",
    loc:      "Mechmech, North Lebanon",
    feats:    ["Private villa", "Mountain views", "Events"],
    href:     "/villas/mechmech",
    gradient: GRAD_MECHMECH,
    label:    "Mountain retreat · North Lebanon",
  },
  {
    key:      "byblos",
    tag:      "Cultural elegance",
    name:     "Villa Byblos",
    loc:      "Jbeil, Byblos, Lebanon",
    feats:    ["Private villa", "Historic setting", "Events"],
    href:     "/villas/byblos",
    gradient: GRAD_BYBLOS,
    label:    "Garden estate · Byblos coast",
  },
];

const experiences = [
  { num: "01", name: "Curated amenities",  desc: "Branded linens, robes, and bespoke toiletries throughout every villa" },
  { num: "02", name: "Coordinated arrival",  desc: "After confirmation and operational review, you receive clear arrival details — with our team available to support you before you reach the villa." },
  { num: "03", name: "Private events",     desc: "Intimate weddings, baptisms, and celebrations for small groups" },
  { num: "04", name: "Member pricing",     desc: "Preferential rates for members who book directly with Oraya — without a marketplace in the middle." },
];

const memberPerks = [
  "Preferential member rates when you book with us directly",
  "Personal guest profile with your preferences saved",
  "Priority access to availability and new dates",
  "Direct communication with our team — hello@stayoraya.com",
  "Event inquiry access for private occasions",
];

const values = [
  { name: "Elegance",     desc: "Sophisticated, understated luxury in every detail" },
  { name: "Serenity",     desc: "Calm, peaceful environments that restore" },
  { name: "Authenticity", desc: "Genuine, curated Lebanese experiences" },
  { name: "Exclusivity",  desc: "Personalized boutique hospitality, always" },
];

export default function Home() {
  const pricing = usePublicPricing();
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [memberName, setMemberName]   = useState("");
  const [authReady, setAuthReady]     = useState(false);
  const [dropOpen, setDropOpen]       = useState(false);

  // Dynamic images from villa_media
  const [heroImg,      setHeroImg]      = useState("");
  const [mechmechImg,  setMechmechImg]  = useState("");
  const [byblosImg,    setByblosImg]    = useState("");
  const [approvedTestimonials, setApprovedTestimonials] = useState<GuestTestimonialRecord[]>([]);

  useEffect(() => {
    fetch(`/api/settings?key=${encodeURIComponent(GUEST_TESTIMONIALS_SETTINGS_KEY)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { value?: string | null }) => {
        const rows = parseGuestTestimonialsJson(d.value ?? null);
        setApprovedTestimonials(getApprovedPublicTestimonials(rows));
      })
      .catch(() => setApprovedTestimonials([]));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setIsLoggedIn(true);
        const { data } = await supabase
          .from("members")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (data?.full_name) setMemberName(data.full_name.split(" ")[0]);
      }
      setAuthReady(true);
    });

    // Fetch cover images
    Promise.all([
      fetch("/api/media?villa=general&limit=1").then((r) => r.json()),
      fetch("/api/media?villa=mechmech&limit=1").then((r) => r.json()),
      fetch("/api/media?villa=byblos&limit=1").then((r) => r.json()),
    ]).then(([gen, mech, byb]) => {
      if (gen.media?.[0]?.file_url)   setHeroImg(gen.media[0].file_url);
      if (mech.media?.[0]?.file_url)  setMechmechImg(mech.media[0].file_url);
      if (byb.media?.[0]?.file_url)   setByblosImg(byb.media[0].file_url);
    }).catch(() => {});
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setMemberName("");
  }

  const navLinks = [
    { href: "#villas",     label: "Our villas" },
    { href: "#experience", label: "Experience" },
    { href: "#events",     label: "Events" },
    ...(!isLoggedIn ? [{ href: "#membership", label: "Membership" }] : []),
  ];

  return (
    <div style={{ overflowX: "hidden" }}>
      {/* ── Nav ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-[100] flex justify-between items-center gap-2 backdrop-blur-[8px] min-w-0"
        style={{
          padding: "1.1rem clamp(1rem, 4vw, 3rem)",
          backgroundColor: "var(--oraya-nav-bg)",
          borderBottom: "0.5px solid var(--oraya-nav-border)",
        }}
      >
        <a href="/" className="w-11 h-11 shrink-0 block" style={{ cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        <ul className="hidden md:flex gap-10 list-none">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                className="no-underline"
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0 max-w-[min(100%,calc(100vw-5rem))] justify-end">
          <PublicThemeToggle variant="public" />
          {/* Auth-aware nav CTA — hidden until auth resolves to avoid flash */}
          {authReady && (
          isLoggedIn ? (
            /* Logged-in dropdown */
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setDropOpen(true)}
              onMouseLeave={() => setDropOpen(false)}
            >
              <button style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px",
                textTransform: "uppercase", color: GOLD,
                backgroundColor: "transparent", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 0", maxWidth: "min(52vw, 240px)",
              }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Hi, {memberName || "Member"}
                </span>
                <span style={{ fontSize: "7px", opacity: 0.5, marginTop: "1px" }}>▾</span>
              </button>
              {dropOpen && (
                <div style={{
                  position: "absolute", top: "100%", right: 0,
                  backgroundColor: WHITE,
                  border: "0.5px solid rgba(197,164,109,0.25)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                  minWidth: "180px", zIndex: 200, marginTop: "6px",
                }}>
                  <a
                    href="/profile"
                    style={{
                      display: "block", padding: "13px 20px",
                      fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                      textTransform: "uppercase", color: CHARCOAL, textDecoration: "none",
                      borderBottom: "0.5px solid rgba(197,164,109,0.15)",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(197,164,109,0.07)"; (e.currentTarget as HTMLElement).style.color = GOLD; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
                  >
                    My Profile
                  </a>
                  <button
                    onClick={signOut}
                    style={{
                      display: "block", width: "100%", padding: "13px 20px", textAlign: "left",
                      fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                      textTransform: "uppercase", color: MUTED,
                      backgroundColor: "transparent", border: "none", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(197,164,109,0.07)"; (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = MUTED; }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Logged-out: Sign In + Reserve */
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <a
                href="/login"
                className="no-underline hidden sm:inline"
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
              >
                Sign In
              </a>
              <a
                href="/book"
                className="no-underline"
                style={{
                  fontFamily: LATO, fontSize: "11px", letterSpacing: "2px",
                  textTransform: "uppercase", color: GOLD,
                  border: "0.5px solid #C5A46D", padding: "10px 28px",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = GOLD;
                  (e.currentTarget as HTMLElement).style.color = ON_GOLD;
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
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{
          backgroundColor: "var(--oraya-hero-canvas)",
          ...(heroImg
            ? { backgroundImage: `url(${heroImg})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundImage: GRAD_HERO }),
        }}
      >
        {/* Overlay to ensure text legibility over photo */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "var(--oraya-hero-overlay)" }}
        />
        {/* Subtle texture */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: "repeating-linear-gradient(45deg,#C5A46D 0,#C5A46D 1px,transparent 1px,transparent 60px)" }}
        />

        <div className="text-center p-6 pt-6 md:p-8 md:pt-8 relative z-[2] animate-fade-up flex flex-col items-center max-w-[100vw]">
          <p
            className="uppercase mb-4 md:mb-8 mt-2 md:mt-0"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "5px", color: "var(--oraya-hero-kicker)" }}
          >
            Lebanon · Exclusive villas
          </p>

          <div className="w-[224px] max-w-[80vw] mx-auto mb-6 md:mb-10 md:w-[280px]">
            <OrayaLogoFull />
          </div>

          <p
            className="uppercase mb-8 md:mb-12 italic max-w-[34ch] md:max-w-none"
            style={{ fontFamily: PLAYFAIR, fontSize: "1.2rem", fontWeight: 400, letterSpacing: "3px", color: "var(--oraya-hero-tagline)" }}
          >
            A sanctuary of luxury and tranquility
          </p>

          <div className="flex gap-3 md:gap-4 justify-center flex-wrap">
            {isLoggedIn ? (
              <>
                <a
                  href="/book"
                  className="no-underline inline-block max-md:shadow-[0_6px_24px_rgba(0,0,0,0.2)]"
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: ON_GOLD, backgroundColor: GOLD, padding: "15px 44px" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                >
                  Request a stay
                </a>
                <a
                  href="#villas"
                  className="no-underline inline-block border-[0.5px] border-white/30 max-md:border-white/50 bg-transparent text-white"
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", padding: "15px 44px" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = GOLD;
                    (e.currentTarget as HTMLElement).style.color = GOLD;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.removeProperty("border-color");
                    (e.currentTarget as HTMLElement).style.removeProperty("color");
                  }}
                >
                  Explore our villas
                </a>
              </>
            ) : (
              <>
                <a
                  href="#villas"
                  className="no-underline inline-block max-md:shadow-[0_6px_24px_rgba(0,0,0,0.2)]"
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: ON_GOLD, backgroundColor: GOLD, padding: "15px 44px" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                >
                  Explore our villas
                </a>
                <a
                  href="/join"
                  className="no-underline inline-block border-[0.5px] border-white/30 max-md:border-white/50 bg-transparent text-white"
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", padding: "15px 44px" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = GOLD;
                    (e.currentTarget as HTMLElement).style.color = GOLD;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.removeProperty("border-color");
                    (e.currentTarget as HTMLElement).style.removeProperty("color");
                  }}
                >
                  Join as member
                </a>
              </>
            )}
          </div>
        </div>

        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 uppercase"
          style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", color: "var(--oraya-hero-discover)" }}
        >
          <div className="animate-pulse-line" style={{ width: "0.5px", height: "40px", background: "rgba(197,164,109,0.35)" }} />
          <span>Discover</span>
        </div>
      </section>

      {/* ── Intro / Philosophy ── */}
      <div style={{ backgroundColor: BEIGELIGHT }}>
        <div
          className={`max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 items-center min-w-0 ${SEC.px} ${SEC.medY} gap-8 md:gap-20`}
        >
          <div className="min-w-0">
            <p
              className="uppercase mb-4"
              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: GOLD }}
            >
              Our philosophy
            </p>
            <h2
              style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: CHARCOAL, lineHeight: 1.2, fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}
            >
              Refined stays,<br />timeless memories
            </h2>
            <div style={{ width: "40px", height: "0.5px", background: GOLD, margin: "1.5rem 0" }} />
            <p
              className="max-w-[34ch] md:max-w-none oraya-text-muted"
              style={{ fontFamily: LATO, fontSize: "15px", lineHeight: 1.85, fontWeight: 300 }}
            >
              Oraya was born from a belief that true luxury is not excess — it is intimacy, craft, and the feeling of belonging to a place. Our villas in Lebanon offer that feeling in entirely different ways.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:gap-4 mt-6 md:mt-8 auto-rows-fr min-w-0">
            {values.map(({ name, desc }) => (
              <div
                key={name}
                className="p-4 md:p-5 h-full flex flex-col min-w-0 max-md:shadow-[0_2px_20px_rgba(46,46,46,0.07)] md:shadow-none"
                style={{ backgroundColor: WHITE, border: "0.5px solid rgba(197,164,109,0.2)" }}
              >
                <p style={{ fontFamily: PLAYFAIR, fontSize: "15px", color: CHARCOAL, marginBottom: "4px" }}>{name}</p>
                <p
                  className="flex-1 oraya-text-muted"
                  style={{ fontFamily: LATO, fontSize: "12px", fontWeight: 300, lineHeight: 1.6 }}
                >
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Villas ── */}
      <section id="villas" className={`${SEC.px} ${SEC.medY}`} style={{ backgroundColor: WHITE }}>
        <div className="text-center mb-10 md:mb-16 min-w-0">
          <p
            className="uppercase mb-4"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: GOLD }}
          >
            Our properties
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: CHARCOAL, lineHeight: 1.2, fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}>
            Unique locations,<br />different worlds
          </h2>
          <div style={{ width: "40px", height: "0.5px", background: GOLD, margin: "1.5rem auto" }} />
          <p
            className="max-w-[34ch] md:max-w-[480px] mx-auto oraya-text-muted"
            style={{ fontFamily: LATO, fontSize: "15px", lineHeight: 1.85, fontWeight: 300, textAlign: "center" }}
          >
            Each property carries its own identity, its own landscape, its own rhythm.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 max-w-[1100px] mx-auto items-stretch min-w-0" style={{ gap: "2px" }}>
          {villaMeta.map(({ key, tag, name, loc, feats, href, gradient, label }) => {
            const img = key === "mechmech" ? mechmechImg : byblosImg;
            const fromPrice = formatVillaFromPrice(name, pricing);
            return (
            <a
              key={name}
              href={href}
              className="h-full min-w-0 flex flex-col"
              style={{
                textDecoration: "none",
                overflow: "hidden",
                cursor: "pointer",
                transition: "transform 0.25s ease, box-shadow 0.25s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 20px 56px rgba(0,0,0,0.13)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {/* Image area */}
              <div
                className="h-[300px] md:h-[360px]"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  ...villaBg(img, gradient),
                }}
              >
                {/* Placeholder overlay — hidden once real photo is set */}
                {!img && (
                  <>
                    <div style={{ width: "52px", opacity: 0.2 }}>
                      <OrayaEmblem />
                    </div>
                    <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
                      {label}
                    </span>
                  </>
                )}
                {/* Bottom gradient fade into content panel */}
                <div style={{
                  position: "absolute",
                  bottom: 0, left: 0, right: 0,
                  height: "80px",
                  background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.06))",
                  pointerEvents: "none",
                }} />
              </div>

              {/* Content panel */}
              <div className="min-w-0 py-6 px-6 md:py-7 md:px-8 flex flex-1 flex-col" style={{ backgroundColor: WHITE, borderTop: "0.5px solid rgba(197,164,109,0.2)" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, marginBottom: "6px" }}>
                  {tag}
                </p>
                <p className="text-[1.45rem] leading-tight md:text-[22px]" style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: CHARCOAL, marginBottom: "8px" }}>{name}</p>
                {fromPrice && (
                  <div style={{ marginBottom: "8px" }}>
                    <p className="text-lg md:text-[20px]" style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: CHARCOAL, margin: "0 0 2px" }}>
                      {fromPrice}
                    </p>
                    <p className="oraya-text-muted" style={{ fontFamily: LATO, fontSize: "10px", margin: 0 }}>
                      {VILLA_FROM_PRICE_MICROLABEL}
                    </p>
                  </div>
                )}
                <p className="text-[11px] md:text-[12px] oraya-text-muted" style={{ fontFamily: LATO, fontWeight: 300, marginBottom: "10px", lineHeight: 1.5 }}>
                  {loc}
                </p>
                <div
                  className="text-[11px] oraya-text-muted"
                  style={{ display: "flex", flexWrap: "wrap", fontFamily: LATO, gap: "10px", marginBottom: "4px" }}
                >
                  {feats.map((f, i) => (
                    <Fragment key={f}>
                      {i > 0 && <span>·</span>}
                      <span>{f}</span>
                    </Fragment>
                  ))}
                </div>
                <span
                  className="inline-block max-md:font-semibold mt-auto pt-4"
                  style={{
                    fontFamily: LATO,
                    fontSize: "11px",
                    letterSpacing: "2.5px",
                    textTransform: "uppercase",
                    color: GOLD,
                    borderBottom: "1px solid #C5A46D",
                    paddingBottom: "3px",
                  }}
                >
                  Explore this villa →
                </span>
              </div>
            </a>
            );
          })}
        </div>
      </section>

      {/* ── Experience ── */}
      <section
        id="experience"
        className={`relative max-md:shadow-[inset_0_36px_48px_-36px_rgba(234,227,217,0.18)] md:shadow-none ${SEC.px} py-12 md:py-24`}
        style={{ backgroundColor: MIDNIGHT }}
      >
        <div
          className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-[1fr_2fr] items-center gap-8 md:gap-20 min-w-0"
        >
          <div className="min-w-0">
            <p
              className="uppercase mb-4"
              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: GOLD }}
            >
              The Oraya experience
            </p>
            <h2
              style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: BAND_TEXT, lineHeight: 1.2, fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}
            >
              Every detail,<br />considered
            </h2>
            <div style={{ width: "40px", height: "0.5px", background: GOLD, margin: "1.5rem 0" }} />
            <p
              className="max-w-[34ch] md:max-w-none"
              style={{ fontFamily: LATO, fontSize: "15px", fontWeight: 300, lineHeight: 1.85, marginTop: "1rem", color: BAND_MUTED }}
            >
              From embroidered linens to curated welcome rituals, Oraya is designed to feel like a private world.
            </p>
          </div>

          <div className="grid grid-cols-2 min-w-0" style={{ gap: "1px", background: "rgba(197,164,109,0.08)" }}>
            {experiences.map(({ num, name, desc }) => (
              <div
                key={num}
                className="py-7 px-5 md:py-8 md:px-6"
                style={{ backgroundColor: "var(--oraya-band-card-fill)", border: "0.5px solid var(--oraya-band-card-border)" }}
              >
                <p
                  className="uppercase"
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", color: GOLD, marginBottom: "10px" }}
                >
                  {num}
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "16px", color: BAND_TEXT, marginBottom: "6px" }}>{name}</p>
                <p style={{ fontFamily: LATO, fontSize: "12px", fontWeight: 300, lineHeight: 1.7, color: BAND_MUTED2 }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Events ── */}
      <section id="events" className={`${SEC.px} py-10 md:py-24`} style={{ backgroundColor: BEIGELIGHT }}>
        <div className="max-w-[1100px] mx-auto min-w-0" style={{ textAlign: "center" }}>
          <p className="uppercase mb-4" style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: GOLD }}>
            Private events
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: CHARCOAL, lineHeight: 1.2, fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}>
            Celebrate in<br />intimate luxury
          </h2>
          <div style={{ width: "40px", height: "0.5px", background: GOLD, margin: "1.5rem auto" }} />
          <p
            className="max-w-[34ch] md:max-w-[520px] mx-auto mb-8 md:mb-10 oraya-text-muted"
            style={{ fontFamily: LATO, fontSize: "15px", lineHeight: 1.85, fontWeight: 300 }}
          >
            Weddings, baptisms, and private gatherings for small groups — hosted in complete privacy across our villas.
          </p>
          <a
            href="/events/inquiry"
            style={{
              display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
              textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
              padding: "15px 44px", textDecoration: "none",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
          >
            Enquire about events
          </a>
        </div>
      </section>

      {/* ── Membership — hidden when logged in ── */}
      {!isLoggedIn && (
        <section
          id="membership"
          className={`text-center ${SEC.px} ${SEC.medY}`}
          style={{ backgroundColor: WHITE }}
        >
          <p
            className="uppercase mb-4"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: GOLD }}
          >
            Oraya membership
          </p>
          <h2
            style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: CHARCOAL, lineHeight: 1.2, fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}
          >
            Join the Oraya circle
          </h2>
          <div style={{ width: "40px", height: "0.5px", background: GOLD, margin: "1.5rem auto" }} />
          <p
            className="max-w-[34ch] md:max-w-[480px] mx-auto oraya-text-muted"
            style={{ fontFamily: LATO, fontSize: "15px", lineHeight: 1.85, fontWeight: 300, textAlign: "center" }}
          >
            Create your guest profile and access exclusive member rates, priority booking, and a more personal experience with every stay.
          </p>

          <div
            className="mx-auto text-left min-w-0 max-w-[540px] mt-10 md:mt-12 py-6 px-5 md:p-12"
            style={{ backgroundColor: BEIGELIGHT, border: "0.5px solid rgba(197,164,109,0.2)" }}
          >
            <span
              className="inline-block uppercase mb-5 md:mb-6"
              style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", color: GOLD, border: "0.5px solid #C5A46D", padding: "5px 16px" }}
            >
              Member benefits
            </span>
            <ul className="list-none space-y-0" style={{ margin: "1.25rem 0 0" }}>
              {memberPerks
                .filter((perk) => !perk.includes("hello@stayoraya.com"))
                .map((perk) => (
                  <li
                    key={perk}
                    className="flex items-start gap-3 md:gap-3 py-3 md:py-2.5 border-b border-[var(--oraya-border)] oraya-text-muted"
                    style={{ fontFamily: LATO, fontSize: "14px", fontWeight: 300, lineHeight: 1.55 }}
                  >
                    <span className="shrink-0 mt-2" style={{ display: "inline-block", width: "20px", height: "0.5px", background: GOLD }} />
                    <span className="min-w-0">{perk}</span>
                  </li>
                ))}
            </ul>
            {(() => {
              const contactLine = memberPerks.find((p) => p.includes("hello@stayoraya.com"));
              if (!contactLine) return null;
              const parts = contactLine.split("hello@stayoraya.com");
              return (
                <p
                  className="mt-6 pt-5 border-t border-[rgba(197,164,109,0.35)] oraya-text-muted"
                  style={{ fontFamily: LATO, fontSize: "14px", fontWeight: 300, lineHeight: 1.65 }}
                >
                  {parts[0]}
                  <a href="mailto:hello@stayoraya.com" className="no-underline break-all" style={{ color: GOLD }}>
                    hello@stayoraya.com
                  </a>
                  {parts[1] ?? ""}
                </p>
              );
            })()}
            <a
              href="/join"
              className="no-underline block text-center uppercase mt-8"
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", color: ON_GOLD, backgroundColor: GOLD, padding: "15px 44px" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
            >
              Create your member account
            </a>
          </div>
        </section>
      )}

      {/* ── Phase 13Z / 15F.4: Trust Layer ── */}
      <section className={`${SEC.px} ${SEC.trustY} min-w-0`} style={{ backgroundColor: BEIGELIGHT }}>
        <div className="max-w-[1100px] mx-auto text-center min-w-0">
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Why Oraya
          </p>
          <h2 className="text-[clamp(1.5rem,5vw,2rem)] md:text-[32px]" style={{ fontFamily: PLAYFAIR, color: CHARCOAL, fontWeight: 400, marginBottom: "1rem", lineHeight: 1.2 }}>
            Booked directly. Handled with care.
          </h2>
          <p
            className="max-w-[34ch] md:max-w-[640px] mx-auto mb-8 md:mb-10 oraya-text-muted"
            style={{ fontFamily: LATO, fontSize: "13px", lineHeight: 1.75, fontWeight: 300 }}
          >
            Every stay is reviewed and prepared by the Oraya team before confirmation. Direct booking means your request is seen by us — not instant or unverified checkout. Guests receive coordinated support before arrival and during their stay.
          </p>
          <div className="grid gap-6 md:gap-8 text-left min-w-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
            {[
              { title: "Direct booking, reviewed by Oraya", body: "We review each request against availability and operations before confirming. Payment is requested only after that review — never as an unverified instant charge." },
              { title: "Human preparation & support", body: "From villa readiness to add-ons and arrival timing, our team coordinates the details. Automated arrival instructions are used only after confirmation and operational review." },
              { title: "Curated private villa stays", body: "Two boutique properties in Lebanon, each maintained and hosted to Oraya standards — intimate scale, not mass-market volume." },
              { title: approvedTestimonials.length > 0 ? "Guest voices" : "Verified reviews (coming soon)", body: approvedTestimonials.length > 0 ? "Selected quotes from guests who have approved sharing their words on our site." : "Verified guest testimonials will appear here once published. We never display quotes without approval." },
            ].map((item) => (
              <div key={item.title} className="p-5 md:p-6 min-w-0 max-md:shadow-[0_2px_18px_rgba(46,46,46,0.06)] md:shadow-none" style={{ border: `0.5px solid rgba(197,164,109,0.2)`, backgroundColor: WHITE }}>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "16px", color: CHARCOAL, margin: "0 0 8px", lineHeight: 1.4 }}>
                  {item.title}
                </p>
                <p className="oraya-text-muted" style={{ fontFamily: LATO, fontSize: "12px", margin: 0, lineHeight: 1.7, fontWeight: 300 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Phase 13Z / 15F.4: Guest Experiences — approved testimonials only (no fake reviews) ── */}
      <section className={`${SEC.px} ${SEC.trustY} min-w-0 border-t border-[rgba(197,164,109,0.2)]`} style={{ backgroundColor: WHITE }}>
        <div className="max-w-[900px] mx-auto text-center min-w-0">
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Guest Experiences
          </p>
          <h2 className="text-[clamp(1.35rem,4.5vw,1.75rem)] md:text-[28px]" style={{ fontFamily: PLAYFAIR, color: CHARCOAL, fontWeight: 400, marginBottom: "1.5rem", lineHeight: 1.2 }}>
            What guests are saying
          </h2>
          {approvedTestimonials.length === 0 ? (
            <>
              <p
                className="max-w-[34ch] md:max-w-[560px] mx-auto mb-8 md:mb-10 oraya-text-muted"
                style={{ fontFamily: LATO, fontSize: "13px", lineHeight: 1.8 }}
              >
                Verified guest reviews coming soon. We&apos;re collecting feedback from recent stays and will share their words here once guests have approved publication.
              </p>
              <div className="grid gap-5 min-w-0 text-left" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-5 min-w-0 max-md:shadow-[0_2px_16px_rgba(46,46,46,0.05)] md:shadow-none" style={{ border: `0.5px dashed rgba(197,164,109,0.2)`, backgroundColor: BEIGELIGHT, minHeight: "140px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p className="oraya-text-muted" style={{ fontFamily: LATO, fontSize: "11px", margin: 0, fontStyle: "italic", textAlign: "center", lineHeight: 1.6 }}>
                      Guest testimonial placeholder
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid gap-5 min-w-0 text-left" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
              {approvedTestimonials.map((t, idx) => (
                <div key={`${t.guest_label}-${idx}`} className="p-5 min-w-0 max-md:shadow-[0_2px_16px_rgba(46,46,46,0.06)] md:shadow-none" style={{ border: `0.5px solid rgba(197,164,109,0.22)`, backgroundColor: BEIGELIGHT }}>
                  <p style={{ fontFamily: PLAYFAIR, fontSize: "15px", color: CHARCOAL, margin: "0 0 12px", lineHeight: 1.55, fontStyle: "italic", fontWeight: 400 }}>
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <p className="oraya-text-muted" style={{ fontFamily: LATO, fontSize: "11px", margin: 0, letterSpacing: "1px", textTransform: "uppercase" }}>
                    {t.guest_label}
                    {t.villa ? ` · ${t.villa}` : ""}
                  </p>
                  {t.reference_url && /^https?:\/\//i.test(t.reference_url) ? (
                    <a href={t.reference_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: LATO, fontSize: "10px", color: GOLD, marginTop: "10px", display: "inline-block", textDecoration: "none", borderBottom: "0.5px solid rgba(197,164,109,0.35)" }}>
                      Reference link
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Social Strip ── */}
      <div className="text-center" style={{ backgroundColor: "var(--oraya-footer-bg)", padding: "3rem" }}>
        <p
          className="uppercase mb-6"
          style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: "var(--oraya-footer-muted)" }}
        >
          Follow Oraya
        </p>
        <div className="flex justify-center flex-wrap" style={{ gap: "1.25rem 2rem" }}>
          {["Instagram", "TikTok", "Facebook"].map((social) => (
            <a
              key={social}
              href="#"
              className="no-underline uppercase"
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", color: GOLD, borderBottom: "0.5px solid rgba(197,164,109,0.25)", paddingBottom: "2px" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderBottomColor = GOLD; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderBottomColor = "rgba(197,164,109,0.25)"; }}
            >
              {social}
            </a>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: "var(--oraya-footer-bg)", padding: "4.5rem clamp(1rem, 4vw, 3rem) 2rem", borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
        <div
          className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-6 min-w-0 md:gap-[2.5rem]"
          style={{ marginBottom: "3rem" }}
        >
          <div className="min-w-0">
            <div style={{ width: "120px", marginBottom: "1.25rem" }}>
              <OrayaLogoFull />
            </div>
            <p style={{ fontFamily: PLAYFAIR, fontStyle: "italic", fontSize: "13px", color: "var(--oraya-footer-quote)", lineHeight: 1.8, marginTop: "0.5rem" }}>
              &ldquo;A boutique sanctuary<br />of luxury and tranquility.&rdquo;
            </p>
          </div>

          <div className="grid min-w-0 w-full grid-cols-2 max-[300px]:grid-cols-1 gap-x-3 gap-y-4 md:contents">
            {[
              { title: "Explore",  links: [{ label: "Villa Mechmech", href: "/villas/mechmech" }, { label: "Villa Byblos", href: "/villas/byblos" }, { label: "Gallery", href: "#" }, { label: "Events", href: "/events/inquiry" }] },
              { title: "Members",  links: [{ label: "Join Oraya", href: "/join" }, { label: "Sign in", href: "/login" }, { label: "My bookings", href: "#" }, { label: "My profile", href: "#" }] },
              { title: "Legal",    links: [{ label: "Privacy Policy", href: "/legal/privacy" }, { label: "Terms & Conditions", href: "/legal/terms" }, { label: "Cancellation & Refund", href: "/legal/refund" }, { label: "Payment Policy", href: "/legal/payment" }] },
              { title: "Contact",  links: [{ label: "hello@stayoraya.com", href: "mailto:hello@stayoraya.com" }, { label: "WhatsApp", href: "#" }, { label: "Instagram", href: "#" }, { label: "Lebanon", href: "#" }] },
            ].map(({ title, links }) => (
              <div key={title} className="min-w-0">
                <p
                  className="uppercase mb-4"
                  style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", color: GOLD }}
                >
                  {title}
                </p>
                <ul className="list-none min-w-0">
                  {links.map(({ label, href }) => (
                    <li key={label} className="min-w-0" style={{ marginBottom: "8px" }}>
                      <a
                        href={href}
                        className="no-underline block min-w-0"
                        style={{ fontFamily: LATO, fontSize: "13px", fontWeight: 300, color: "var(--oraya-footer-link)", overflowWrap: "anywhere", wordBreak: "break-word" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--oraya-footer-link)"; }}
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-[1100px] mx-auto" style={{ paddingBottom: "1.5rem" }}>
          <LegalEntityNotice variant="dark" />
        </div>

        <div
          className="max-w-[1100px] mx-auto flex justify-between flex-wrap"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)", paddingTop: "1.5rem", fontFamily: LATO, fontSize: "11px", color: "var(--oraya-footer-text)" }}
        >
          <span>© 2026 Oraya. All rights reserved.</span>
          <span>Lebanon · Boutique Villas</span>
        </div>
      </footer>
    </div>
  );
}
