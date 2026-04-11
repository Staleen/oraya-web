"use client";
import { useSearchParams } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export default function BookingConfirmedPage() {
  const p = useSearchParams();
  const villa          = p.get("villa") ?? "—";
  const checkIn        = p.get("checkIn") ?? "";
  const checkOut       = p.get("checkOut") ?? "";
  const sleepingGuests = p.get("sleepingGuests") ?? "—";
  const dayVisitors    = p.get("dayVisitors") ?? "0";
  const eventType      = p.get("eventType") ?? "";
  const id             = p.get("id") ?? "";

  const details = [
    { label: "Villa",                  value: villa },
    { label: "Check-in",               value: formatDate(checkIn) },
    { label: "Check-out",              value: formatDate(checkOut) },
    { label: "Guests staying",         value: sleepingGuests },
    { label: "Expected visitors",      value: dayVisitors },
    ...(eventType ? [{ label: "Event type", value: eventType }] : []),
    { label: "Status",                 value: "Pending confirmation" },
    ...(id ? [{ label: "Reference",    value: id.slice(0, 8).toUpperCase() }] : []),
  ];

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: MIDNIGHT, padding: "80px 24px" }}
    >
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        {/* Emblem */}
        <div style={{ width: "60px", margin: "0 auto 2.5rem" }}>
          <OrayaEmblem />
        </div>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          Booking received
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.4rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.2 }}>
          Your request<br />
          <span style={{ fontStyle: "italic" }}>is confirmed.</span>
        </h1>

        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.8, marginBottom: "2.5rem" }}>
          We've received your booking request and will be in touch within 24 hours to confirm availability and arrange your stay.
        </p>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {/* Booking details card */}
        <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", padding: "2rem", marginBottom: "2.5rem", textAlign: "left" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
            Booking summary
          </p>
          {details.map(({ label, value }) => (
            <div
              key={label}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}
            >
              <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                {label}
              </span>
              <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, fontWeight: 300 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/"
            style={{ display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, padding: "15px 36px", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
          >
            Back to home
          </a>
          <a
            href="/book"
            style={{ display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.4)", padding: "15px 36px", textDecoration: "none" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = GOLD;
              (e.currentTarget as HTMLElement).style.color = WHITE;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.4)";
              (e.currentTarget as HTMLElement).style.color = GOLD;
            }}
          >
            New booking
          </a>
        </div>

        <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "2.5rem" }}>
          A confirmation email will be sent to your registered address.
        </p>
      </div>
    </main>
  );
}
