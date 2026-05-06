"use client";
import { useState, useEffect } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import OrayaEmblem from "@/components/OrayaEmblem";
import { VILLA_FROM_PRICE_MICROLABEL, formatVillaFromPrice } from "@/lib/admin-pricing";
import { usePublicPricing } from "@/lib/public-pricing";
import InstantBookingIcon from "@/components/icons/InstantBookingIcon";
import {
  fetchInstantBookingFlagsPublic,
  instantBookingEnabledForVilla,
  type InstantBookingFlags,
} from "@/lib/instant-booking-settings";

const HERO_GRADIENT = "linear-gradient(160deg, #1b3a2f 0%, #2b5040 35%, #1a2f24 65%, #0f1e17 100%)";

const GOLD       = "var(--oraya-gold)";
const GOLD_CTA   = "var(--oraya-gold-cta-text)";
const WHITE      = "var(--oraya-surface)";
const BEIGELIGHT = "var(--oraya-bg)";
const CHARCOAL   = "var(--oraya-ink)";
const MIDNIGHT   = "var(--oraya-hero-canvas)";
const MUTED      = "var(--oraya-text-muted)";
const HERO_TEXT  = "var(--oraya-hero-text)";
const HERO_TAG   = "var(--oraya-hero-tagline)";
const PLAYFAIR   = "'Playfair Display', Georgia, serif";
const LATO       = "'Lato', system-ui, sans-serif";

const details = [
  { label: "Bedrooms",    value: "3 (master with en-suite)" },
  { label: "Bathrooms",   value: "3" },
  { label: "Pool",        value: "Heated private pool" },
  { label: "Terrace",     value: "Rooftop terrace" },
  { label: "Winter room", value: "Panoramic — converts to open-air" },
  { label: "Outdoor",     value: "BBQ & stamped concrete terraces" },
  { label: "Parking",     value: "Private parking" },
  { label: "Amenities",   value: "Towels, robes, slippers, toiletries" },
];

const highlights = [
  "No AC needed — natural mountain breeze at night",
  "5 minutes from Saint Charbel Monastery",
  "Private modern villa in a charming mountain town",
  "Sleeps 6 (up to 8 with extra bedding), up to 25 day visitors",
];

interface VillaMedia {
  id: string;
  category: string;
  file_url: string;
  display_order: number;
}

export default function VillaMechmechPage() {
  const pricing = usePublicPricing();
  const [villaMedia, setVillaMedia] = useState<VillaMedia[]>([]);
  const [instantBookingFlags, setInstantBookingFlags] = useState<InstantBookingFlags>({
    "Villa Mechmech": true,
    "Villa Byblos": true,
  });

  useEffect(() => {
    fetchInstantBookingFlagsPublic()
      .then(setInstantBookingFlags)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/media?villa=mechmech")
      .then((r) => r.json())
      .then((d) => { if (d.media) setVillaMedia(d.media); })
      .catch(() => {});
  }, []);

  const heroImg = villaMedia[0]?.file_url ?? "";
  const galleryMedia = villaMedia.slice(1);
  const fromPrice = formatVillaFromPrice("Villa Mechmech", pricing);
  const instantHeroBadge = instantBookingEnabledForVilla("Villa Mechmech", instantBookingFlags);

  return (
    <div style={{ overflowX: "hidden" }}>
      <SiteNav base="/" />

      {/* ── Hero ── */}
      <section className="oraya-section-tone" style={{ paddingTop: "80px", backgroundColor: MIDNIGHT, minHeight: "65vh", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1,
          minHeight: "520px",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          ...(heroImg
            ? { backgroundImage: `url(${heroImg})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundImage: HERO_GRADIENT }),
        }}>
          {instantHeroBadge && (
            <span
              className="instant-badge instant-badge--on-photo pointer-events-none"
              style={{ position: "absolute", top: "16px", right: "16px", zIndex: 4 }}
            >
              <InstantBookingIcon size={16} />
              <span>Instant booking available</span>
            </span>
          )}
          {/* Placeholder — hidden once real image loads */}
          {!heroImg && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", opacity: 0.25 }}>
              <div style={{ width: "64px" }}><OrayaEmblem /></div>
              <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: HERO_TEXT }}>
                Villa photography coming soon
              </span>
            </div>
          )}

          {/* Bottom overlay */}
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            background: heroImg
              ? "var(--oraya-villa-hero-scrim-image)"
              : "var(--oraya-villa-hero-scrim-fallback)",
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
              <h1 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.8rem, 4vw, 3rem)", fontWeight: 400, color: HERO_TEXT, margin: 0, lineHeight: 1.15 }}>
                Villa Mechmech<br />
                <span style={{ fontStyle: "italic", opacity: 0.7 }}>Modern Mountain Retreat</span>
              </h1>
              {fromPrice && (
                <div style={{ marginTop: "14px" }}>
                  <p style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.2rem, 2.8vw, 1.7rem)", color: HERO_TEXT, margin: "0 0 4px" }}>
                    {fromPrice}
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: HERO_TAG, margin: 0 }}>
                    {VILLA_FROM_PRICE_MICROLABEL}
                  </p>
                </div>
              )}
            </div>
            <a
              href="/book?villa=Villa+Mechmech"
              className="oraya-pressable oraya-cta-gold-hover"
              style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
                textTransform: "uppercase", color: GOLD_CTA,
                backgroundColor: GOLD, padding: "14px 36px",
                textDecoration: "none", flexShrink: 0,
              }}
            >
              Book this villa
            </a>
          </div>
        </div>
      </section>

      {/* ── Photo gallery strip (when 2+ images exist) ── */}
      {galleryMedia.length > 0 && (
        <section className="oraya-section-tone" style={{ backgroundColor: "var(--oraya-surface-muted)", overflow: "hidden" }}>
          <div style={{
            display: "flex",
            overflowX: "auto",
            gap: "2px",
            scrollbarWidth: "thin",
            scrollbarColor: `rgba(197,164,109,0.3) transparent`,
          }}>
            {galleryMedia.map((img) => (
              <div
                key={img.id}
                style={{
                  flexShrink: 0,
                  width: "260px",
                  height: "190px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.file_url}
                  alt={img.category}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "var(--oraya-villa-gallery-scrim)",
                  padding: "6px 10px",
                }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: HERO_TAG }}>
                    {img.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Description ── */}
      <section className="oraya-section-tone" style={{ backgroundColor: WHITE, padding: "5rem 3rem" }}>
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
      <section className="oraya-section-tone" style={{ backgroundColor: BEIGELIGHT, padding: "5rem 3rem" }}>
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
      <section className="oraya-section-tone" style={{ backgroundColor: MIDNIGHT, padding: "5rem 3rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Why Mechmech
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.4rem, 2.5vw, 2rem)", fontWeight: 400, color: HERO_TEXT, marginBottom: "2.5rem" }}>
            What makes it special
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 3rem", display: "flex", flexDirection: "column", gap: "16px" }}>
            {highlights.map((h) => (
              <li key={h} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <span style={{ color: GOLD, fontSize: "10px", marginTop: "4px", flexShrink: 0 }}>◆</span>
                <span style={{ fontFamily: LATO, fontSize: "15px", color: HERO_TAG, fontWeight: 300, lineHeight: 1.7 }}>{h}</span>
              </li>
            ))}
          </ul>
          <a
            href="/book?villa=Villa+Mechmech"
            className="oraya-pressable oraya-cta-gold-hover"
            style={{
              display: "inline-block",
              fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
              textTransform: "uppercase", color: GOLD_CTA,
              backgroundColor: GOLD, padding: "15px 44px",
              textDecoration: "none",
            }}
          >
            Book this villa
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
