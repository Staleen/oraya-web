"use client";
import { Fragment } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import OrayaLogoFull from "@/components/OrayaLogoFull";

const GOLD    = "#C5A46D";
const WHITE   = "#FFFFFF";
const BEIGE   = "#EAE3D9";
const BEIGELIGHT = "#F5F1EB";
const CHARCOAL = "#2E2E2E";
const MIDNIGHT = "#1F2B38";
const MUTED   = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO    = "'Lato', system-ui, sans-serif";

const villas = [
  {
    tag: "Nature retreat",
    name: "Villa Mechmech",
    loc: "Mechmech, North Lebanon",
    feats: ["Private villa", "Mountain views", "Events"],
  },
  {
    tag: "Cultural elegance",
    name: "Villa Byblos",
    loc: "Jbeil, Byblos, Lebanon",
    feats: ["Private villa", "Historic setting", "Events"],
  },
];

const experiences = [
  { num: "01", name: "Curated amenities",  desc: "Branded linens, robes, and bespoke toiletries throughout every villa" },
  { num: "02", name: "Seamless check-in",  desc: "Automated arrival instructions and a personal welcome experience" },
  { num: "03", name: "Private events",     desc: "Intimate weddings, baptisms, and celebrations for small groups" },
  { num: "04", name: "Member pricing",     desc: "Exclusive rates for registered Oraya members, always lower than platforms" },
];

const memberPerks = [
  "Exclusive pricing — always lower than Airbnb & Booking.com",
  "Personal guest profile with your preferences saved",
  "Priority access to availability and new dates",
  "Direct communication — no platform in between",
  "Event booking access for private occasions",
];

const values = [
  { name: "Elegance",     desc: "Sophisticated, understated luxury in every detail" },
  { name: "Serenity",     desc: "Calm, peaceful environments that restore" },
  { name: "Authenticity", desc: "Genuine, curated Lebanese experiences" },
  { name: "Exclusivity",  desc: "Personalized boutique hospitality, always" },
];

export default function Home() {
  return (
    <>
      {/* ── Nav ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-[100] flex justify-between items-center backdrop-blur-[8px]"
        style={{
          padding: "1.1rem 3rem",
          backgroundColor: "rgba(255,255,255,0.97)",
          borderBottom: "0.5px solid rgba(197,164,109,0.2)",
        }}
      >
        <a href="#" className="w-11 h-11 shrink-0 block">
          <OrayaEmblem />
        </a>

        <ul className="hidden md:flex gap-10 list-none">
          {[
            { href: "#villas",     label: "Our villas" },
            { href: "#experience", label: "Experience" },
            { href: "#events",     label: "Events" },
            { href: "#membership", label: "Membership" },
          ].map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                className="no-underline transition-colors duration-200"
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = CHARCOAL; }}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#membership"
          className="no-underline transition-all duration-200"
          style={{
            fontFamily: LATO,
            fontSize: "11px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: GOLD,
            border: "0.5px solid #C5A46D",
            padding: "10px 28px",
            backgroundColor: "transparent",
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

      {/* ── Hero ── */}
      <section
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: MIDNIGHT }}
      >
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "repeating-linear-gradient(45deg,#C5A46D 0,#C5A46D 1px,transparent 1px,transparent 60px)" }}
        />

        <div className="text-center p-8 relative z-[2] animate-fade-up flex flex-col items-center">
          <p
            className="uppercase mb-8"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "5px", color: "rgba(197,164,109,0.65)" }}
          >
            Lebanon · Exclusive villas
          </p>

          <div className="w-[280px] mx-auto mb-10">
            <OrayaLogoFull />
          </div>

          <p
            className="uppercase mb-12 italic"
            style={{ fontFamily: PLAYFAIR, fontSize: "1.2rem", fontWeight: 400, letterSpacing: "3px", color: "rgba(255,255,255,0.45)" }}
          >
            A sanctuary of luxury and tranquility
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href="#villas"
              className="no-underline inline-block transition-colors duration-200"
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: WHITE, backgroundColor: GOLD, padding: "15px 44px" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
            >
              Explore our villas
            </a>
            <a
              href="#membership"
              className="no-underline inline-block transition-all duration-200"
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: WHITE, border: "0.5px solid rgba(255,255,255,0.3)", padding: "15px 44px", backgroundColor: "transparent" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = GOLD;
                (e.currentTarget as HTMLElement).style.color = GOLD;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.3)";
                (e.currentTarget as HTMLElement).style.color = WHITE;
              }}
            >
              Join as member
            </a>
          </div>
        </div>

        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 uppercase"
          style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", color: "rgba(255,255,255,0.2)" }}
        >
          <div className="animate-pulse-line" style={{ width: "0.5px", height: "40px", background: "rgba(197,164,109,0.35)" }} />
          <span>Discover</span>
        </div>
      </section>

      {/* ── Intro / Philosophy ── */}
      <div style={{ backgroundColor: BEIGELIGHT }}>
        <div
          className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 items-center"
          style={{ padding: "7rem 3rem", gap: "5rem" }}
        >
          <div>
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
            <p style={{ fontFamily: LATO, fontSize: "15px", color: MUTED, lineHeight: 1.85, fontWeight: 300 }}>
              Oraya was born from a belief that true luxury is not excess — it is intimacy, craft, and the feeling of belonging to a place. Our villas in Lebanon offer that feeling in entirely different ways.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
            {values.map(({ name, desc }) => (
              <div
                key={name}
                className="p-5"
                style={{ backgroundColor: WHITE, border: "0.5px solid rgba(197,164,109,0.2)" }}
              >
                <p style={{ fontFamily: PLAYFAIR, fontSize: "15px", color: CHARCOAL, marginBottom: "4px" }}>{name}</p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, fontWeight: 300, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Villas ── */}
      <section id="villas" style={{ backgroundColor: WHITE, padding: "7rem 3rem" }}>
        <div className="text-center mb-16">
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
            style={{ fontFamily: LATO, fontSize: "15px", color: MUTED, lineHeight: 1.85, fontWeight: 300, maxWidth: "480px", margin: "0 auto", textAlign: "center" }}
          >
            Each property carries its own identity, its own landscape, its own rhythm.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 max-w-[1100px] mx-auto" style={{ gap: "2px" }}>
          {villas.map(({ tag, name, loc, feats }) => (
            <div
              key={name}
              className="relative flex flex-col justify-end overflow-hidden"
              style={{ backgroundColor: BEIGE, minHeight: "520px" }}
            >
              <div className="absolute inset-0 flex items-center justify-center flex-col gap-4">
                <div style={{ width: "60px", opacity: 0.12 }}>
                  <OrayaEmblem />
                </div>
                <span
                  className="uppercase"
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", color: MUTED, opacity: 0.5 }}
                >
                  Photos coming soon
                </span>
              </div>

              <div
                className="relative z-[2]"
                style={{ backgroundColor: WHITE, padding: "1.75rem 2rem", borderTop: "0.5px solid rgba(197,164,109,0.2)" }}
              >
                <p
                  className="uppercase mb-1"
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", color: GOLD }}
                >
                  {tag}
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "22px", color: CHARCOAL, marginBottom: "3px" }}>{name}</p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, fontWeight: 300, marginBottom: "10px" }}>{loc}</p>
                <div className="flex" style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, gap: "10px" }}>
                  {feats.map((f, i) => (
                    <Fragment key={f}>
                      {i > 0 && <span>·</span>}
                      <span>{f}</span>
                    </Fragment>
                  ))}
                </div>
                <a
                  href="#"
                  className="inline-block no-underline uppercase"
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", color: GOLD, marginTop: "12px", borderBottom: "0.5px solid #C5A46D", paddingBottom: "2px" }}
                >
                  Explore this villa →
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Experience ── */}
      <section id="experience" style={{ backgroundColor: MIDNIGHT, padding: "6rem 3rem" }}>
        <div
          className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-[1fr_2fr] items-center"
          style={{ gap: "5rem" }}
        >
          <div>
            <p
              className="uppercase mb-4"
              style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: GOLD }}
            >
              The Oraya experience
            </p>
            <h2
              style={{ fontFamily: PLAYFAIR, fontWeight: 400, color: WHITE, lineHeight: 1.2, fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}
            >
              Every detail,<br />considered
            </h2>
            <div style={{ width: "40px", height: "0.5px", background: GOLD, margin: "1.5rem 0" }} />
            <p style={{ fontFamily: LATO, fontSize: "15px", fontWeight: 300, lineHeight: 1.85, color: "rgba(255,255,255,0.45)", marginTop: "1rem" }}>
              From embroidered linens to curated welcome rituals, Oraya is designed to feel like a private world.
            </p>
          </div>

          <div className="grid grid-cols-2" style={{ gap: "1px", background: "rgba(197,164,109,0.08)" }}>
            {experiences.map(({ num, name, desc }) => (
              <div
                key={num}
                style={{ backgroundColor: MIDNIGHT, padding: "2rem 1.5rem", border: "0.5px solid rgba(197,164,109,0.07)" }}
              >
                <p
                  className="uppercase"
                  style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", color: GOLD, marginBottom: "10px" }}
                >
                  {num}
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "16px", color: WHITE, marginBottom: "6px" }}>{name}</p>
                <p style={{ fontFamily: LATO, fontSize: "12px", fontWeight: 300, lineHeight: 1.7, color: "rgba(255,255,255,0.4)" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Membership ── */}
      <section
        id="membership"
        className="text-center"
        style={{ backgroundColor: BEIGELIGHT, padding: "7rem 3rem" }}
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
          style={{ fontFamily: LATO, fontSize: "15px", color: MUTED, lineHeight: 1.85, fontWeight: 300, maxWidth: "480px", margin: "0 auto", textAlign: "center" }}
        >
          Create your guest profile and access exclusive member rates, priority booking, and a more personal experience with every stay.
        </p>

        <div
          className="mx-auto text-left"
          style={{ maxWidth: "540px", marginTop: "3rem", backgroundColor: WHITE, border: "0.5px solid rgba(197,164,109,0.2)", padding: "3rem" }}
        >
          <span
            className="inline-block uppercase mb-6"
            style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", color: GOLD, border: "0.5px solid #C5A46D", padding: "5px 16px" }}
          >
            Member benefits
          </span>
          <ul className="list-none" style={{ margin: "1.5rem 0 2rem" }}>
            {memberPerks.map((perk) => (
              <li
                key={perk}
                className="flex items-center"
                style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, fontWeight: 300, padding: "10px 0", borderBottom: "0.5px solid #EAE3D9", gap: "12px" }}
              >
                <span className="shrink-0" style={{ display: "inline-block", width: "20px", height: "0.5px", background: GOLD }} />
                {perk}
              </li>
            ))}
          </ul>
          <a
            href="#"
            className="no-underline block text-center transition-colors duration-200 uppercase"
            style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", color: WHITE, backgroundColor: GOLD, padding: "15px 44px" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
          >
            Create your member account
          </a>
        </div>
      </section>

      {/* ── Social Strip ── */}
      <div className="text-center" style={{ backgroundColor: CHARCOAL, padding: "3rem" }}>
        <p
          className="uppercase mb-6"
          style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", color: "rgba(255,255,255,0.3)" }}
        >
          Follow Oraya
        </p>
        <div className="flex justify-center" style={{ gap: "2.5rem" }}>
          {["Instagram", "TikTok", "Facebook"].map((social) => (
            <a
              key={social}
              href="#"
              className="no-underline uppercase transition-all"
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
      <footer style={{ backgroundColor: CHARCOAL, padding: "4.5rem 3rem 2rem", borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
        <div
          className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr]"
          style={{ gap: "3rem", marginBottom: "3rem" }}
        >
          <div>
            <div style={{ width: "120px", marginBottom: "1.25rem" }}>
              <OrayaLogoFull />
            </div>
            <p style={{ fontFamily: PLAYFAIR, fontStyle: "italic", fontSize: "13px", color: "rgba(255,255,255,0.3)", lineHeight: 1.8, marginTop: "0.5rem" }}>
              &ldquo;A boutique sanctuary<br />of luxury and tranquility.&rdquo;
            </p>
          </div>

          {[
            { title: "Explore",  links: ["Villa Mechmech", "Villa Byblos", "Gallery", "Events"] },
            { title: "Members",  links: ["Join Oraya", "Sign in", "My bookings", "My profile"] },
            { title: "Contact",  links: ["hello@oraya.com", "WhatsApp", "Instagram", "Lebanon"] },
          ].map(({ title, links }) => (
            <div key={title}>
              <p
                className="uppercase mb-4"
                style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", color: GOLD }}
              >
                {title}
              </p>
              <ul className="list-none">
                {links.map((link) => (
                  <li key={link} style={{ marginBottom: "8px" }}>
                    <a
                      href="#"
                      className="no-underline transition-colors duration-200"
                      style={{ fontFamily: LATO, fontSize: "13px", fontWeight: 300, color: "rgba(255,255,255,0.35)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)"; }}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="max-w-[1100px] mx-auto flex justify-between"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)", paddingTop: "1.5rem", fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.18)" }}
        >
          <span>© 2026 Oraya. All rights reserved.</span>
          <span>Lebanon · Boutique Villas</span>
        </div>
      </footer>
    </>
  );
}
