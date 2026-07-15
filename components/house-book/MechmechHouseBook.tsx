import OrayaLogoFull from "@/components/OrayaLogoFull";
import { HbPage, Strip, Row, Ck } from "./primitives";

/**
 * Villa Mechmech — The House Book (9 A4 pages).
 *
 * Converted one-to-one from the approved Claude Design print source
 * preserved by PR #73 (docs/design/phase-16c/welcome-guide/
 * claude-design-drafts/Villa-Mechmech-House-Book/). STATIC document —
 * no guest name, no stay dates, no booking reference, no access codes.
 *
 * One deliberate web deviation, flagged for David: the printed design's
 * bracketed venue placeholder rows are replaced with placeholder-free
 * Living List copy until real venue names exist.
 */

const VILLA = "Villa Mechmech";
const A = "/house-book/shared";
const AM = "/house-book/mechmech";
const EXPLORE_URL = "https://stayoraya.com/explore/mechmech";
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=34.130333,35.773083";

export default function MechmechHouseBook() {
  return (
    <>
      {/* 1 · Cover */}
      <HbPage
        label="House Book — Cover"
        tone="beige-light"
        bleed
        style={{ padding: "18mm", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
      >
        <OrayaLogoFull style={{ width: "auto", height: "30mm", margin: "1mm auto 0" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <img src={`${A}/oraya-housebook-seal.svg`} alt="House Book seal" style={{ width: "46mm", display: "block", margin: "0 auto" }} />
          <h1 className="oraya-display" style={{ fontSize: "46pt", lineHeight: 1.05, color: "var(--oraya-midnight)", margin: "10mm 0 0" }}>Villa</h1>
          <h1 className="oraya-display oraya-display--italic" style={{ fontSize: "54pt", lineHeight: 1.05, color: "var(--oraya-gold-deep)", margin: "0 0 8mm" }}>Mechmech</h1>
          <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>the house book</p>
          <p className="oraya-eyebrow" style={{ margin: 0 }}>Mechmech · near Annaya · Mount Lebanon</p>
        </div>
        <div>
          <span className="oraya-gem" style={{ marginBottom: "4mm" }} />
          <p className="micro" style={{ margin: "3mm 0 0" }}>A guide to your stay at Villa Mechmech</p>
        </div>
      </HbPage>

      {/* 2 · Essentials */}
      <HbPage label="House Book — Essentials" tone="ivory" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>The Essentials</p>
          <h2 className="catch">At a glance<b>.</b></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: "5mm", marginBottom: "7mm" }}>
          <div className="arch-cell">
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>Wi-Fi</div>
            <div className="nm" style={{ fontFamily: "var(--oraya-font-body)", fontWeight: 900, fontSize: "11.5pt" }}>ORAYA</div>
            <div className="tx">Password provided in the villa</div>
          </div>
          <div className="arch-cell">
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>Checkout</div>
            <div className="nm">11:00 AM</div>
            <div className="tx">Late or extended — by advance confirmation</div>
          </div>
          <div className="arch-cell">
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>Concierge</div>
            <div className="nm" style={{ fontFamily: "var(--oraya-font-body)", fontWeight: 900, fontSize: "8.5pt", letterSpacing: 0, whiteSpace: "nowrap" }}>
              {"+961 71 140 041"}
            </div>
            <div className="tx">WhatsApp or call · 24/7</div>
          </div>
          <div className="arch-cell">
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>Quiet hours</div>
            <div className="nm" style={{ fontSize: "11pt" }}>11 PM – 8 AM</div>
            <div className="tx">The hills carry sound</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "5mm", marginBottom: "8mm" }}>
          <a href={MAPS_URL} className="warm-panel" style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "6mm", alignItems: "center" }}>
            <img src={`${AM}/oraya-qr-maps-mechmech.svg`} alt="QR code — Villa Mechmech in Google Maps" style={{ width: "19mm", height: "19mm", display: "block" }} />
            <div className="fact">
              <div className="l">The villa’s location</div>
              <div className="s" style={{ marginTop: 0 }}>Scan to open Villa Mechmech in Google Maps — handy for taxis, deliveries, and finding your way home.</div>
            </div>
          </a>
          <div className="warm-panel">
            <div className="fact">
              <div className="l">A message away — 24/7</div>
              <div className="v" style={{ fontSize: "15pt" }}>+961 71 140 041</div>
              <div className="s">A recommendation, an extra comfort, or simply a question — WhatsApp or call, day or night.</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: "0.5pt solid var(--oraya-gold-28)", borderBottom: "0.5pt solid var(--oraya-gold-28)", padding: "8mm 0 6mm", marginBottom: "6mm" }}>
          <img src={`${AM}/oraya-area-plate-mechmech.svg`} alt="Mechmech area plate" style={{ width: "118mm", display: "block", margin: "0 auto" }} />
          <p className="micro" style={{ textAlign: "center", margin: "4mm 0 0" }}>Mechmech · near Annaya · Mount Lebanon</p>
        </div>
        <div style={{ textAlign: "center" }}>
          <img src={`${A}/oraya-olive-mark.svg`} alt="" style={{ width: "13mm", display: "block", margin: "0 auto" }} />
          <p className="oraya-display oraya-display--italic" style={{ fontSize: "12.5pt", color: "var(--oraya-muted)", margin: "2mm 0 0" }}>Everything else is a message away.</p>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 3 · Welcome letter */}
      <HbPage label="House Book — Welcome letter" tone="beige-light" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="arch-panel" style={{ width: "138mm", padding: "16mm 14mm 12mm", textAlign: "center" }}>
          <p className="eyebrow-t" style={{ margin: "0 0 6mm" }}>Prepared for every stay at Oraya</p>
          <h2 className="head" style={{ fontSize: "32pt", marginBottom: "9mm" }}>Welcome to <em>the house</em></h2>
          <div className="body" style={{ fontSize: "10pt", lineHeight: 1.8, textAlign: "left" }}>
            <p style={{ margin: "0 0 4mm" }}>It is our pleasure to welcome you to Villa Mechmech — a three-floor mountain villa with 3 bedrooms, 2 full bathrooms + guest WC, heated pool, winter glass room, outdoor kitchen, pergola, BBQ area, and parking inside the gate. We hope your time here is restful, private, and entirely effortless.</p>
            <p style={{ margin: "0 0 4mm" }}>This little book holds everything you need for your stay — how the villa and its comforts work, what surrounds you in Mechmech and beyond, the few things we kindly ask of our guests, and how to reach us at any hour.</p>
            <p style={{ margin: "0 0 4mm" }}>Should you need anything at all — a recommendation, an extra comfort, or simply a question — our concierge is only a message away, day or night.</p>
            <p style={{ margin: "0 0 8mm" }}>Until then, make yourself completely at home. We are so glad to have you.</p>
          </div>
          <img src={`${A}/oraya-olive-mark.svg`} alt="" style={{ width: "14mm", display: "block", margin: "0 auto" }} />
          <p className="oraya-display oraya-display--italic" style={{ fontSize: "15pt", color: "var(--oraya-terracotta)", margin: "2.5mm 0 0" }}>— The Oraya Team</p>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 4 · Around Villa Mechmech */}
      <HbPage label="House Book — Around Villa Mechmech" tone="ivory" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>Around Villa Mechmech</p>
            <h2 className="catch">Explore<b>.</b></h2>
          </div>
          <img src={`${AM}/oraya-area-plate-mechmech.svg`} alt="Mechmech area plate" style={{ width: "62mm", display: "block" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: "4mm", marginBottom: "6mm" }}>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>~5–10 min</div>
            <div className="nm">Saint Charbel · Annaya</div>
            <div className="tx">A nearby spiritual landmark and one of the area’s most meaningful visits.</div>
          </div>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>~25–35 min</div>
            <div className="nm">Laklouk Highlands</div>
            <div className="tx">Mountain viewpoints, hiking routes, and winter snow scenery when in season.</div>
          </div>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <div className="micro" style={{ color: "var(--oraya-terracotta)" }}>~45–60 min</div>
            <div className="nm">Baatara / Baloua Balaa</div>
            <div className="tx">A dramatic waterfall and natural chasm, best in the wet/spring season.</div>
          </div>
        </div>
        {/* Web deviation: the printed design carries bracketed sample rows
            here. Public web copy is placeholder-free
            until real venue names are approved. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "9mm", marginBottom: "6mm" }}>
          <div>
            <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 2mm" }}>Around the area — the living list</p>
            <p className="body" style={{ fontSize: "8.5pt", lineHeight: 1.65, margin: 0, padding: "2.8mm 0", borderTop: "0.5pt solid var(--oraya-gold-28)", borderBottom: "0.5pt solid var(--oraya-gold-28)" }}>
              Restaurants, cafés and family tables around Mechmech change with the seasons — so our recommendations live on the Living List, where they stay fresh. Scan the code below, or simply ask: Oraya can share the latest local recommendations before your stay.
            </p>
          </div>
          <div>
            <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 2mm" }}>Practical & nearby</p>
            <p className="body" style={{ fontSize: "8.5pt", lineHeight: 1.65, margin: 0, padding: "2.8mm 0", borderTop: "0.5pt solid var(--oraya-gold-28)", borderBottom: "0.5pt solid var(--oraya-gold-28)" }}>
              Mini-markets, bakeries, a pharmacy, ATMs and fuel are all minutes away. Message the concierge for the nearest options — and for non-urgent pharmacy guidance, day or night.
            </p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "5mm", borderTop: "0.5pt solid var(--oraya-gold-28)", paddingTop: "6mm" }}>
          <a href={EXPLORE_URL} className="warm-panel" style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "6mm", alignItems: "center" }}>
            <img src={`${AM}/oraya-qr-living-list-mechmech.svg`} alt="QR code — Oraya living list, Mechmech" style={{ width: "19mm", height: "19mm", display: "block" }} />
            <div className="fact">
              <div className="l">The living list</div>
              <div className="s" style={{ marginTop: 0 }}>Scan for Oraya’s current area guide — openings change with the seasons; this list stays fresh.</div>
            </div>
          </a>
          <div className="warm-panel">
            <div className="fact">
              <div className="l">Oraya arranges</div>
              <div className="s" style={{ marginTop: 0 }}>
                Reservations, drivers, boat days, guided visits — message the concierge at{" "}
                <strong style={{ color: "var(--oraya-charcoal)" }}>+961 71 140 041</strong>.
              </div>
            </div>
          </div>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 5 · Living Spaces */}
      <HbPage label="House Book — Living Spaces" tone="beige-light" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>Living spaces</p>
          <h2 className="catch">Live<b>.</b></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: "4mm", marginBottom: "5mm" }}>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <img src={`${A}/oraya-icon-pool.svg`} alt="" style={{ width: "12mm", height: "12mm", display: "block", margin: "0 auto 2mm" }} />
            <div className="nm">Pool</div>
            <div className="tx">Heated pool readied before your stay. No diving; children swim with an adult.</div>
          </div>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <img src={`${A}/oraya-icon-kitchen.svg`} alt="" style={{ width: "12mm", height: "12mm", display: "block", margin: "0 auto 2mm" }} />
            <div className="nm">Kitchen</div>
            <div className="tx">Kettle, microwave, gas cooktop, cutlery and glassware.</div>
          </div>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <img src={`${A}/oraya-icon-barbecue.svg`} alt="" style={{ width: "12mm", height: "12mm", display: "block", margin: "0 auto 2mm" }} />
            <div className="nm">Barbecue</div>
            <div className="tx">Open the valve, ignite as labeled, close and cool after. Never unattended.</div>
          </div>
          <div className="arch-cell" style={{ paddingTop: "7mm" }}>
            <img src={`${A}/oraya-icon-bathroom.svg`} alt="" style={{ width: "12mm", height: "12mm", display: "block", margin: "0 auto 2mm" }} />
            <div className="nm">Bathrooms</div>
            <div className="tx">Towels and amenities provided. Used towels on the floor.</div>
          </div>
        </div>
        <div className="warm-panel" style={{ display: "flex", justifyContent: "space-between", gap: "8mm", marginBottom: "7mm", padding: "4mm 5.5mm" }}>
          <p className="body" style={{ fontSize: "9pt", fontWeight: 700, margin: 0 }}>Using the heated pool? Cover back on after use.</p>
          <p className="body" style={{ fontSize: "9pt", margin: 0, color: "var(--oraya-muted)" }}>Garbage: a small bin per room; outdoor cans outside — never on the street.</p>
        </div>
        <div className="warm-panel" style={{ padding: "7mm 7mm 6mm" }}>
          <p className="eyebrow-t" style={{ margin: "0 0 4.5mm" }}>The comforts — how the house works</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 9mm" }}>
            <Row label="Wi-Fi">Network <strong>ORAYA</strong> · password provided in the villa.</Row>
            <Row label="Heating">Radiators with adjustable valves; diesel stove for deep winter.</Row>
            <Row label="Hot water">Labeled hot-water switch in the villa. Call before any reset.</Row>
            <Row label="Glass room">The winter glass room is part of the Mechmech stay — keep it closed when heating is on.</Row>
            <Row label="TV">Two smart TVs — streaming ready.</Row>
            <Row label="Power & water">Backup systems are handled by Oraya. A brief start-up or pump sound can be normal.</Row>
          </div>
          <p className="oraya-display oraya-display--italic" style={{ fontSize: "12pt", color: "var(--oraya-terracotta)", margin: "5mm 0 0", textAlign: "center", borderTop: "0.5pt solid var(--oraya-gold-28)", paddingTop: "4.5mm" }}>
            If something does not work as expected, contact Oraya before attempting a fix.
          </p>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 6 · House Notes */}
      <HbPage label="House Book — House Notes" tone="ivory" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ textAlign: "center" }}>
          <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>House notes</p>
          <h2 className="head" style={{ fontSize: "30pt" }}>The few things we <em>ask</em></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 18mm 1fr", columnGap: "5mm", height: "158mm" }}>
          <div style={{ display: "grid", alignContent: "space-evenly", gap: "6mm" }}>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>I · Visitors & gatherings</p>
              <p className="body" style={{ margin: 0 }}>Additional visitors and gatherings must be approved by Oraya in advance. For events and larger gatherings, Oraya arranges everything — catering, décor, music and ambience.</p>
            </div>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>II · Restricted areas</p>
              <p className="body" style={{ margin: 0 }}>Mechanical, electrical, plumbing, security and storage rooms stay closed — please do not access or tamper.</p>
            </div>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>III · Smoking</p>
              <p className="body" style={{ margin: 0 }}>On the terrace and outdoors, where ashtrays are set out. Not indoors.</p>
            </div>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>IV · Pool safety</p>
              <p className="body" style={{ margin: 0 }}>No diving. Children swim supervised. Using the heated pool? Cover back on after use.</p>
            </div>
          </div>
          <div style={{ alignSelf: "center" }}>
            <img src={`${A}/oraya-vertical-branch-ivory-v14.svg`} alt="" style={{ height: "150mm", display: "block", margin: "0 auto" }} />
          </div>
          <div style={{ display: "grid", alignContent: "space-evenly", gap: "6mm" }}>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>V · Children & supervision</p>
              <p className="body" style={{ margin: 0 }}>An adult keeps an eye on little ones at all times, indoors and out.</p>
            </div>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>VI · Property care</p>
              <p className="body" style={{ margin: 0 }}>Treat the villa, its furniture and the outdoor areas with care — as you would your own.</p>
            </div>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>VII · Quiet hours</p>
              <p className="body" style={{ margin: 0 }}>Low volume between 11:00 PM and 8:00 AM.</p>
            </div>
            <div>
              <p className="micro" style={{ color: "var(--oraya-terracotta)", margin: "0 0 1.5mm" }}>VIII · Keys & security</p>
              <p className="body" style={{ margin: 0 }}>Lock doors and windows and secure the gate when you head out. A lost key or code — tell us at once.</p>
            </div>
          </div>
        </div>
        <div style={{ borderTop: "0.5pt solid var(--oraya-gold-28)", paddingTop: "5.5mm", textAlign: "center" }}>
          <p className="eyebrow-t" style={{ margin: "0 0 2mm" }}>Anything unclear?</p>
          <p className="body" style={{ fontSize: "9.5pt", margin: 0 }}>Our concierge is a message away, day or night — <strong>+961 71 140 041</strong></p>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 7 · Checkout */}
      <HbPage label="House Book — Checkout" tone="beige-light" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>Checkout</p>
            <h2 className="catch">Leave<b>.</b></h2>
          </div>
          <div style={{ width: "24mm" }}>
            <img src={`${A}/oraya-setting-sun.svg`} alt="" style={{ width: "24mm", display: "block" }} />
          </div>
        </div>
        <div className="warm-panel" style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "8mm", alignItems: "center", marginBottom: "7mm" }}>
          <div style={{ fontFamily: "var(--oraya-font-display)", fontSize: "38pt", lineHeight: 1, color: "var(--oraya-midnight)" }}>
            11:00 <span style={{ fontSize: "15pt" }}>AM</span>
          </div>
          <p className="body" style={{ fontSize: "9pt", margin: 0 }}>In no rush? Late or extended checkout may be available — arrange and confirm with Oraya in advance at +961 71 140 041.</p>
        </div>
        <div className="arch-panel" style={{ padding: "17mm 14mm 10mm" }}>
          <p className="micro" style={{ color: "var(--oraya-terracotta)", textAlign: "center", margin: "0 0 6mm" }}>A short round of the house</p>
          <div style={{ maxWidth: "124mm", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5mm 10mm" }}>
            <Ck>Dishes to sink</Ck>
            <Ck>Lights off</Ck>
            <Ck>Garbage to the outdoor cans</Ck>
            <Ck>Heating & stove off</Ck>
            <Ck>Interior doors closed</Ck>
            <Ck>Windows latched</Ck>
            <Ck>Final lock-up — front door + gate</Ck>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5pt solid var(--oraya-gold-28)", paddingTop: "5mm" }}>
          <p className="oraya-display oraya-display--italic" style={{ fontSize: "13.5pt", color: "var(--oraya-terracotta)", margin: 0 }}>Leave the rest to us.</p>
          <div className="fact" style={{ textAlign: "right" }}>
            <div className="l">Questions before you go</div>
            <div className="s" style={{ marginTop: 0 }}>
              <strong style={{ color: "var(--oraya-charcoal)" }}>+961 71 140 041</strong> — WhatsApp or call
            </div>
          </div>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 8 · Emergency & Contacts */}
      <HbPage label="House Book — Emergency & Contacts" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow-t" style={{ margin: "0 0 3mm" }}>Emergency & contacts</p>
          <h2 className="head" style={{ fontSize: "24pt" }}>Clear heads, <em>clear numbers</em></h2>
        </div>
        <div className="warm-panel" style={{ marginBottom: "6mm" }}>
          <div className="fact"><div className="l">Gas · electrical · water · fire</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", columnGap: "5mm", marginTop: "1mm" }}>
            <div className="body" style={{ fontSize: "9pt" }}><strong>1.</strong> Step outside</div>
            <div className="body" style={{ fontSize: "9pt" }}><strong>2.</strong> Move away from the area</div>
            <div className="body" style={{ fontSize: "9pt" }}><strong>3.</strong> Contact the emergency service</div>
            <div className="body" style={{ fontSize: "9pt" }}><strong>4.</strong> Inform Oraya</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "6mm", marginBottom: "6mm" }}>
          <div style={{ border: "0.75pt solid var(--oraya-gold)", borderRadius: "999px 999px 0 0", padding: "9mm 6mm 6mm", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--oraya-font-display)", fontSize: "42pt", lineHeight: 1, color: "var(--oraya-midnight)" }}>112</div>
            <div className="micro" style={{ marginTop: "2.5mm" }}>Police / Internal Security</div>
          </div>
          <div style={{ border: "0.75pt solid var(--oraya-gold)", borderRadius: "999px 999px 0 0", padding: "9mm 6mm 6mm", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--oraya-font-display)", fontSize: "42pt", lineHeight: 1, color: "var(--oraya-midnight)" }}>140</div>
            <div className="micro" style={{ marginTop: "2.5mm" }}>Lebanese Red Cross</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: "8mm", alignItems: "center", padding: "5mm 0", borderTop: "0.5pt solid var(--oraya-gold-28)", borderBottom: "0.5pt solid var(--oraya-gold-28)", marginBottom: "6mm" }}>
          <div>
            <div className="fact">
              <div className="l">Oraya Concierge — WhatsApp or call, 24/7</div>
              <div className="v" style={{ fontSize: "16pt" }}>+961 71 140 041</div>
              <div className="s">For medical emergencies, call the emergency service first. For non-urgent pharmacy guidance, message Oraya.</div>
              <div className="micro" style={{ marginTop: "2mm", color: "var(--oraya-terracotta)" }}>stayoraya.com</div>
            </div>
          </div>
          <a href="https://stayoraya.com" style={{ textAlign: "center" }}>
            <img src={`${A}/oraya-qr-stayoraya.svg`} alt="QR code — stayoraya.com" style={{ width: "22mm", height: "22mm", display: "block", margin: "0 auto" }} />
            <div className="micro" style={{ marginTop: "1.6mm" }}>Scan to open stayoraya.com</div>
          </a>
        </div>
        <div>
          <p className="eyebrow-t" style={{ margin: "0 0 3.5mm" }}>Worth remembering</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: "4mm" }}>
            <div className="warm-panel" style={{ padding: "3.5mm" }}><div className="body" style={{ fontSize: "8pt", lineHeight: 1.45 }}><strong>Checkout</strong><br />11:00 AM</div></div>
            <div className="warm-panel" style={{ padding: "3.5mm" }}><div className="body" style={{ fontSize: "8pt", lineHeight: 1.45 }}><strong>Lost access</strong><br />Call Oraya</div></div>
            <div className="warm-panel" style={{ padding: "3.5mm" }}><div className="body" style={{ fontSize: "8pt", lineHeight: 1.45 }}><strong>Quiet</strong><br />After 11:00 PM</div></div>
            <div className="warm-panel" style={{ padding: "3.5mm" }}><div className="body" style={{ fontSize: "8pt", lineHeight: 1.45 }}><strong>Garbage</strong><br />Outdoor bins</div></div>
          </div>
        </div>
        <Strip villaName={VILLA} />
      </HbPage>

      {/* 9 · Farewell / back cover */}
      <HbPage
        label="House Book — Farewell / back cover"
        tone="midnight"
        bleed
        style={{ padding: "18mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}
      >
        <img src={`${A}/oraya-housebook-seal-midnight.svg`} alt="" style={{ width: "32mm", display: "block", margin: "0 auto" }} />
        <h2 className="oraya-display" style={{ fontSize: "27pt", color: "var(--oraya-ivory)", margin: "10mm 0 4mm", lineHeight: 1.25 }}>
          Thank you for staying <em className="oraya-display--italic" style={{ color: "var(--oraya-gold)" }}>at Oraya.</em>
        </h2>
        <p className="oraya-body" style={{ color: "var(--oraya-beige)", fontSize: "10.5pt", margin: "0 0 12mm" }}>We hope to welcome you back.</p>
        <OrayaLogoFull style={{ width: "auto", height: "26mm", margin: "0 auto 5mm" }} />
        <p style={{ fontSize: "8pt", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(231,222,204,0.75)", margin: 0 }}>
          stayoraya.com · +961 71 140 041
        </p>
      </HbPage>
    </>
  );
}
