"use client";
import { useState, useEffect } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import OrayaEmblem from "@/components/OrayaEmblem";
import { VILLA_FROM_PRICE_MICROLABEL, formatVillaFromPrice } from "@/lib/admin-pricing";
import { usePublicPricing } from "@/lib/public-pricing";

const HERO_GRADIENT = "linear-gradient(160deg, #283520 0%, #3a5028 35%, #1e2e14 65%, #111a0a 100%)";

const GOLD       = "#C5A46D";
const WHITE      = "#FFFFFF";
const BEIGELIGHT = "#F5F1EB";
const CHARCOAL   = "#2E2E2E";
const MIDNIGHT   = "#1F2B38";
const MUTED      = "#8a8070";
const PLAYFAIR   = "'Playfair Display', Georgia, serif";
const LATO       = "'Lato', system-ui, sans-serif";

const details = [
  { label: "Bedrooms",   value: "3 (master with en-suite)" },
  { label: "Bathrooms",  value: "3" },
  { label: "Pool",       value: "Private pool" },
  { label: "Garden",     value: "Lush garden with fruit trees" },
  { label: "Olive grove",value: "Breakfast zone beneath olive trees" },
  { label: "Shade tree", value: "Grand umbrella tree lounge" },
  { label: "Parking",    value: "Private parking" },
  { label: "Amenities",  value: "Towels, robes, slippers, toiletries" },
];

const highlights = [
  "Breakfast zone nestled in an olive grove",
  "Pool surrounded by fruit trees and flowers",
  "Grand umbrella tree shading the outdoor lounge",
  "10 minutes from Byblos Old Souk and harbour",
  "Sleeps 6 (up to 8 with extra bedding), up to 25 day visitors",
];

interface VillaMedia {
  id: string;
  category: string;
  file_url: string;
  display_order: number;
}

export default function VillaByblosPage() {
  const pricing = usePublicPricing();
  const [villaMedia, setVillaMedia] = useState<VillaMedia[]>([]);

  useEffect(() => {
    fetch("/api/media?villa=byblos")
      .then((r) => r.json())
      .then((d) => { if (d.media) setVillaMedia(d.media); })
      .catch(() => {});
  }, []);

  const heroImg      = villaMedia[0]?.file_url ?? "";
  const galleryMedia = villaMedia.slice(1);
  const fromPrice = formatVillaFromPrice("Villa Byblos", pricing);

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
          ...(heroImg
            ? { backgroundImage: `url(${heroImg})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundImage: HERO_GRADIENT }),
        }}>
          {/* Placeholder */}
          {!heroImg && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", opacity: 0.25 }}>
              <div style={{ width: "64px" }}><OrayaEmblem /></div>
              <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: WHITE }}>
                Villa photography coming soon
              </span>
            </div>
          )}

          {/* Bottom overlay */}
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            background: heroImg
              ? "linear-gradient(to top, rgba(10,20,28,0.95) 0%, rgba(10,20,28,0.6) 50%, transparent 100%)"
              : "linear-gradient(to top, rgba(8,14,6,0.98) 0%, rgba(8,14,6,0.7) 55%, transparent 100%)",
            padding: "2.5rem 3rem 2rem",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}>
            <div>
              <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "6px" }}>
                Cultural elegance · Jbeil, Byblos, Lebanon
              </p>
              <h1 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.8rem, 4vw, 3rem)", fontWeight: 400, color: WHITE, margin: 0, lineHeight: 1.15 }}>
                Villa Byblos<br />
                <span style={{ fontStyle: "italic", opacity: 0.7 }}>Mediterranean Garden Estate</span>
              </h1>
              {fromPrice && (
                <div style={{ marginTop: "14px" }}>
                  <p style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.2rem, 2.8vw, 1.7rem)", color: WHITE, margin: "0 0 4px" }}>
                    {fromPrice}
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: "rgba(255,255,255,0.7)", margin: 0 }}>
                    {VILLA_FROM_PRICE_MICROLABEL}
                  </p>
                </div>
              )}
            </div>
            <a
              href="/book?villa=Villa+Byblos"
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

      {/* ── Photo gallery strip ── */}
      {galleryMedia.length > 0 && (
        <section style={{ backgroundColor: "#141f28", overflow: "hidden" }}>
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
                  background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)",
                  padding: "6px 10px",
                }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
                    {img.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Description ── */}
      <section style={{ backgroundColor: WHITE, padding: "5rem 3rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            About the villa
          </p>
          <h2 style={{ fontFamily: PLAYFAIR, fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 400, color: CHARCOAL, lineHeight: 1.25, marginBottom: "1.5rem" }}>
            Nature and elegance<br />in perfect harmony
          </h2>
          <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, marginBottom: "1.75rem" }} />
          <p style={{ fontFamily: LATO, fontSize: "15px", color: MUTED, lineHeight: 1.9, fontWeight: 300 }}>
            A lush garden escape near the historic coast of Byblos. Breakfast under olive trees, lounging beneath a grand umbrella tree, and a pool framed by fruit trees and flowers. Nature and elegance in perfect harmony. 10 minutes from Byblos Old Souk.
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
            Why Byblos
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
            href="/book?villa=Villa+Byblos"
            style={{
              display: "inline-block",
              fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
              textTransform: "uppercase", color: CHARCOAL,
              backgroundColor: GOLD, padding: "15px 44px",
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
