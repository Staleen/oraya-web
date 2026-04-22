"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import OrayaEmblem from "@/components/OrayaEmblem";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const MUTED    = "#8a8070";
const CHARCOAL = "#2E2E2E";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

function WelcomePageInner() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name") ?? "Member";
  const firstName = name.split(" ")[0];

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: MIDNIGHT, padding: "80px 24px" }}
    >
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        {/* Emblem */}
        <a href="/" style={{ display: "block", width: "64px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          Membership confirmed
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.6rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.2 }}>
          Welcome to Oraya,<br />
          <span style={{ fontStyle: "italic" }}>{firstName}.</span>
        </h1>

        {/* Subtext */}
        <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, lineHeight: 1.8, marginBottom: "2.5rem" }}>
          Your member profile has been created. You now have access to exclusive
          pricing, priority availability, and direct booking across all Oraya villas.
        </p>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {/* Perks */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 3rem", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            "Exclusive member pricing on all villas",
            "Priority access to dates and new properties",
            "Direct booking — no platform in between",
            "Private event access for special occasions",
          ].map((perk) => (
            <li
              key={perk}
              style={{ fontFamily: LATO, fontSize: "13px", color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              <span style={{ color: GOLD, fontSize: "10px" }}>◆</span>
              {perk}
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <a
            href="/book"
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
            Book now
          </a>
          <a
            href="/#villas"
            style={{
              display: "inline-block",
              fontFamily: LATO,
              fontSize: "11px",
              letterSpacing: "2.5px",
              textTransform: "uppercase",
              color: GOLD,
              backgroundColor: "transparent",
              border: "0.5px solid rgba(197,164,109,0.4)",
              padding: "15px 44px",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = GOLD;
              (e.currentTarget as HTMLElement).style.color = WHITE;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.4)";
              (e.currentTarget as HTMLElement).style.color = GOLD;
            }}
          >
            Explore our villas
          </a>
        </div>

        {/* Sign-in note */}
        <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "2rem" }}>
          Please check your email to confirm your address before signing in.
        </p>
      </div>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomePageInner />
    </Suspense>
  );
}
