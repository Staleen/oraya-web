import "./arrival.css";
import { accessCodeChipLabel, buildAccessCodeRequestUrl } from "@/lib/arrival/access-code-request";
import OrayaLogoFull from "@/components/OrayaLogoFull";
import {
  ARRIVAL_CONTENT,
  CONCIERGE_DISPLAY,
  WEBSITE_URL,
  WHATSAPP_URL,
  type ArrivalVillaSlug,
} from "./content";

/**
 * Private mobile Arrival Guide (Phase 16C Stage 2) — 8 screens converted
 * one-to-one from the PR #73 Claude Design mobile guides.
 *
 * Renders ONLY for a verified, confirmed booking (enforced by the route).
 * ACCESS BOUNDARY: no gate PIN, no front-door PIN, no access codes — the
 * design's PIN merge fields are intentionally replaced with the safe
 * "tap to get it now" WhatsApp request until Phase 16D ships an approved
 * access-code delivery system. The guide never renders a code; it gives the
 * guest a one-tap way to ask a human for one, because nothing in Oraya
 * currently sends a PIN at all.
 */

const SHARED = "/house-book/shared";

interface Props {
  villa: ArrivalVillaSlug;
  guestName: string;
  stayDates: string | null;
  bookingReference: string | null;
}

function PhotoSlot({ height, full = false }: { height: number; full?: boolean }) {
  return <div className="m-photo" style={{ height: `${height}px`, ...(full ? { gridColumn: "1 / -1" } : {}) }} />;
}

function InfoRow({ label, text, bottom = false, labelWidth = 96 }: { label: string; text: string; bottom?: boolean; labelWidth?: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "14px",
        padding: "12px 0",
        alignItems: "baseline",
        borderTop: "1px solid var(--oraya-gold-28)",
        ...(bottom ? { borderBottom: "1px solid var(--oraya-gold-28)" } : {}),
      }}
    >
      <span className="m-micro" style={{ flex: "none", width: `${labelWidth}px`, color: "var(--oraya-charcoal)" }}>
        {label}
      </span>
      <span className="m-body" style={{ fontSize: "13.5px" }}>{text}</span>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="m-step">
      <div className="m-num">{n}</div>
      <div className="t">{children}</div>
    </div>
  );
}

export default function ArrivalGuide({ villa, guestName, stayDates, bookingReference }: Props) {
  const c = ARRIVAL_CONTENT[villa];

  return (
    <div className="mob">
      <div className="m-flow">
        {/* 1 · Welcome */}
        <section className="m-screen m-screen--beige" style={{ display: "flex", flexDirection: "column", gap: "22px", textAlign: "center" }}>
          <OrayaLogoFull style={{ width: "auto", height: "44px", margin: "0 auto" }} />
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 10px" }}>Your arrival guide</p>
            <h1 className="m-display" style={{ fontSize: "40px" }}>
              {c.nameParts[0]} <em>{c.nameParts[1]}</em>
            </h1>
            <p className="m-micro" style={{ margin: "12px 0 0" }}>{c.locality}</p>
          </div>
          <div style={{ border: "1px solid var(--oraya-gold)", borderRadius: "999px 999px 0 0", background: "var(--oraya-ivory)", padding: "34px 24px 24px" }}>
            <p className="m-micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 6px" }}>Prepared for</p>
            <p className="m-display" style={{ fontSize: "23px", margin: "0 0 4px" }}>{guestName}</p>
            {stayDates && (
              <p className="m-body" style={{ margin: "0 0 12px", color: "var(--oraya-muted)" }}>{stayDates}</p>
            )}
            {bookingReference && (
              <p className="m-micro" style={{ margin: "0 0 16px" }}>Booking {bookingReference}</p>
            )}
            <span className="m-chip">Access — provided by Oraya before arrival</span>
          </div>
          <PhotoSlot height={150} />
          <div style={{ display: "grid", gap: "12px" }}>
            <a className="m-btn" href={c.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
            <a className="m-btn m-btn--ghost" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Message Oraya on WhatsApp</a>
          </div>
          <div style={{ textAlign: "center" }}>
            <img src={`${SHARED}/oraya-housebook-seal.svg`} alt="" style={{ width: "40px", display: "block", margin: "0 auto 10px" }} />
            <p className="m-micro" style={{ margin: 0 }}>Everything for the drive and the door — keep this handy</p>
          </div>
        </section>

        {/* 2 · Getting there */}
        <section className="m-screen" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 8px" }}>Getting there</p>
            <h2 className="m-display">{c.roadTitlePlain}<em>{c.roadTitleEm}</em></h2>
          </div>
          <div>
            <PhotoSlot height={180} />
            <p style={{ fontSize: "11px", color: "var(--oraya-muted)", margin: "8px 0 0", textAlign: "center" }}>The pin drops at the villa gate</p>
          </div>
          <a className="m-btn" href={c.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
          <div>
            {c.travelRows.map((row, i) => (
              <InfoRow key={row.label} label={row.label} text={row.text} bottom={i === c.travelRows.length - 1} />
            ))}
          </div>
          <div className="m-panel m-fact">
            <div className="l">Timing</div>
            <div className="s" style={{ marginTop: 0 }}>
              Late arrival is always fine; early arrival by advance request. Share your ETA on WhatsApp and we’ll be ready.
            </div>
          </div>
          {c.roadPlateSrc && (
            <img src={c.roadPlateSrc} alt="" style={{ width: "230px", display: "block", margin: "4px auto 0" }} />
          )}
        </section>

        {/* 3 · Parking & the gate — generic steps only; NO gate code */}
        <section className="m-screen m-screen--beige" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 8px" }}>At the gate</p>
            <h2 className="m-display">Through the <em>gate</em></h2>
          </div>
          <div>
            <PhotoSlot height={150} />
            <p style={{ fontSize: "11px", color: "var(--oraya-muted)", margin: "8px 0 0", textAlign: "center" }}>{c.gateCaption}</p>
          </div>
          <div style={{ display: "grid", gap: "14px" }}>
            <Step n={1}>Enter the gate code on the keypad.</Step>
            <Step n={2}>Press the <strong>open</strong> button.</Step>
            <Step n={3}>The gate slides open — drive in.</Step>
          </div>
          <div style={{ textAlign: "center" }}>
            <a
              className="m-chip"
              href={buildAccessCodeRequestUrl({ whatsappUrl: WHATSAPP_URL, bookingReference, door: "gate" })}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              {accessCodeChipLabel("gate")}
            </a>
          </div>
          <div className="m-panel m-fact">
            <div className="l">Parking</div>
            <div className="s" style={{ marginTop: 0 }}>Two cars inside the gate; extra cars just outside.</div>
          </div>
        </section>

        {/* 4 · The front door — generic steps only; NO door code */}
        <section className="m-screen" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 8px" }}>The front door</p>
            <h2 className="m-display">Let yourself <em>in</em></h2>
          </div>
          <div>
            <PhotoSlot height={150} />
            <p style={{ fontSize: "11px", color: "var(--oraya-muted)", margin: "8px 0 0", textAlign: "center" }}>{c.doorCaption}</p>
          </div>
          <div style={{ display: "grid", gap: "14px" }}>
            <Step n={1}>Touch the keypad to wake it.</Step>
            <Step n={2}>Enter the front-door code.</Step>
            <Step n={3}>Press the handle — <strong>you’re home.</strong></Step>
          </div>
          <div style={{ textAlign: "center" }}>
            <a
              className="m-chip"
              href={buildAccessCodeRequestUrl({ whatsappUrl: WHATSAPP_URL, bookingReference, door: "front_door" })}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              {accessCodeChipLabel("front_door")}
            </a>
          </div>
          <div className="m-panel m-fact">
            <div className="l">{c.doorPanelTitle}</div>
            <div className="s" style={{ marginTop: 0 }}>{c.doorPanelText}</div>
          </div>
        </section>

        {/* 5 · The house */}
        <section className="m-screen" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 8px" }}>Once you’re in</p>
            <h2 className="m-display">The house, <em>briefly</em></h2>
          </div>
          <div className="m-panel m-fact">
            <div className="l">Wi-Fi</div>
            <div className="v" style={{ fontSize: "20px" }}>ORAYA</div>
            <div className="s">Password provided in the villa.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {c.photoTiles.map((tile, i) => (
              <PhotoSlot key={i} height={110} full={tile === "full"} />
            ))}
          </div>
          <div>
            {c.houseRows.map((row, i) => (
              <InfoRow key={row.label} label={row.label} text={row.text} bottom={i === c.houseRows.length - 1} />
            ))}
          </div>
          <div className="m-panel m-fact">
            <div className="l">The full guide</div>
            <div className="s" style={{ marginTop: 0 }}>The printed House Book in the villa covers every room and system in detail.</div>
          </div>
        </section>

        {/* 6 · Explore / Living List */}
        <section className="m-screen m-screen--beige" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 8px" }}>{c.exploreEyebrow}</p>
            <h2 className="m-display">The <em>Living List</em></h2>
          </div>
          <p className="m-body" style={{ margin: 0, fontSize: "13.5px" }}>
            Oraya’s current area guide — openings change with the seasons; this list stays fresh.
          </p>
          <div>
            {c.exploreRows.map((row, i) => (
              <InfoRow key={row.label} label={row.label} text={row.text} bottom={i === c.exploreRows.length - 1} labelWidth={120} />
            ))}
          </div>
          <a className="m-btn" href={c.exploreUrl} target="_blank" rel="noopener noreferrer">Open the Living List</a>
        </section>

        {/* 7 · Before you set out */}
        <section className="m-screen m-screen--beige" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 8px" }}>Before you set out</p>
            <h2 className="m-display">Six small <em>checks</em></h2>
          </div>
          <div style={{ display: "grid", gap: "15px", padding: "22px 20px", background: "var(--oraya-ivory)", boxShadow: "inset 0 0 0 1px var(--oraya-gold-28)" }}>
            <div className="m-gem-li">This guide saved to your phone</div>
            <div className="m-gem-li">Access details received from Oraya</div>
            <div className="m-gem-li">Maps link saved</div>
            <div className="m-gem-li">Living List link saved</div>
            <div className="m-gem-li">Oraya WhatsApp saved</div>
            <div className="m-gem-li">ETA shared with Oraya</div>
          </div>
          <div style={{ textAlign: "center", paddingTop: "4px" }}>
            <img src={`${SHARED}/oraya-olive-mark.svg`} alt="" style={{ width: "56px", display: "block", margin: "0 auto" }} />
            <p style={{ fontFamily: "var(--oraya-font-display)", fontStyle: "italic", fontSize: "17px", color: "var(--oraya-terracotta)", margin: "10px 0 0" }}>
              Then simply enjoy the drive.
            </p>
          </div>
        </section>

        {/* 8 · Need help? */}
        <section className="m-screen m-screen--midnight" style={{ display: "flex", flexDirection: "column", gap: "22px", textAlign: "center" }}>
          <img src={`${SHARED}/oraya-housebook-seal-midnight.svg`} alt="" style={{ width: "44px", display: "block", margin: "0 auto" }} />
          <div>
            <p className="m-eyebrow" style={{ margin: "0 0 10px" }}>Need help?</p>
            <h2 className="m-display">A message <em>away.</em></h2>
          </div>
          <p className="m-body" style={{ margin: 0, fontSize: "13.5px", color: "rgba(231,222,204,0.75)" }}>
            Gate not opening · PIN not working · arriving late · can’t find the road — day or night.
          </p>
          <div className="m-fact">
            <div className="l">Oraya concierge — 24/7</div>
            <div className="v" style={{ fontSize: "24px" }}>{CONCIERGE_DISPLAY}</div>
          </div>
          <a className="m-btn m-btn--ghost" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Message Oraya on WhatsApp</a>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div className="m-fact"><div className="v" style={{ fontSize: "26px" }}>112</div><div className="l">Police / Internal Security</div></div>
            <div className="m-fact"><div className="v" style={{ fontSize: "26px" }}>140</div><div className="l">Lebanese Red Cross</div></div>
          </div>
          <p className="m-micro" style={{ margin: 0, color: "rgba(231,222,204,0.75)" }}>
            For medical emergencies, call the emergency service first — then message Oraya for non-urgent guidance.
          </p>
          <hr className="m-hr" />
          <div>
            <OrayaLogoFull style={{ width: "auto", height: "44px", margin: "0 auto" }} />
            <p className="m-micro" style={{ margin: "14px 0 0" }}>
              <a href={WEBSITE_URL} style={{ color: "rgba(231,222,204,0.75)", textDecoration: "none" }}>stayoraya.com</a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
