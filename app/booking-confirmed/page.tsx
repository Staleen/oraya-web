"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PublicTrustShell from "@/components/PublicTrustShell";
import {
  bookingWhatsAppChangePrefill,
  bookingWhatsAppPrefill,
  CANCELLATION_HINT,
  CANCELLATION_PROMPT,
  CONFIRMED_PAGE,
  CONFIRMED_REFUND_POLICY_LINK_LABEL,
  CONFIRMED_REFUND_REASSURANCE,
  digitsOnlyPhone,
  REFUND_POLICY_HREF,
  VIEW_PENDING_LINES,
  VIEW_STATUS_HEADLINE,
  WHATSAPP_CANCEL_CHANGE_NO_REF,
  WHATSAPP_SUPPORT_LINE,
} from "@/lib/booking-trust-messaging";

const GOLD     = "var(--oraya-gold)";
const GOLD_CTA = "var(--oraya-gold-cta-text)";
const WHITE    = "var(--oraya-book-heading)";
const MUTED    = "var(--oraya-book-muted)";
const BOOK_P78 = "var(--oraya-book-p78)";
const BOOK_P20 = "var(--oraya-book-p20)";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function BookingConfirmedPageInner() {
  const p = useSearchParams();
  const [whatsappDigits, setWhatsappDigits] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings?key=whatsapp_number")
      .then((r) => r.json())
      .then((d: { value?: string }) => setWhatsappDigits(digitsOnlyPhone(d.value ?? null)))
      .catch(() => setWhatsappDigits(null));
  }, []);

  const villa          = p.get("villa") ?? "—";
  const checkIn        = p.get("checkIn") ?? "";
  const checkOut       = p.get("checkOut") ?? "";
  const sleepingGuests = p.get("sleepingGuests") ?? "—";
  const dayVisitors    = p.get("dayVisitors") ?? "0";
  const eventType      = p.get("eventType") ?? "";
  const id             = p.get("id") ?? "";
  const name           = p.get("name") ?? "";
  const refDisplay     = id ? id.slice(0, 8).toUpperCase() : "";

  const details = [
    ...(name ? [{ label: "Name",            value: name }] : []),
    { label: "Villa",                        value: villa },
    { label: "Check-in",                     value: formatDate(checkIn) },
    { label: "Check-out",                    value: formatDate(checkOut) },
    { label: "Guests staying",               value: sleepingGuests },
    { label: "Expected visitors",            value: dayVisitors },
    ...(eventType ? [{ label: "Event type", value: eventType }] : []),
    { label: "Status",                       value: VIEW_STATUS_HEADLINE.pending },
    ...(refDisplay ? [{ label: "Reference",   value: refDisplay }] : []),
  ];

  return (
    <PublicTrustShell mainStyle={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          {CONFIRMED_PAGE.eyebrow}
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.4rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.2 }}>
          {CONFIRMED_PAGE.headline}
        </h1>

        <p style={{ fontFamily: LATO, fontSize: "13px", color: BOOK_P78, lineHeight: 1.75, margin: "0 0 10px", fontWeight: 300 }}>
          {CONFIRMED_PAGE.subB}
        </p>
        <p style={{ fontFamily: LATO, fontSize: "13px", color: BOOK_P78, lineHeight: 1.75, margin: "0 0 10px", fontWeight: 300 }}>
          {CONFIRMED_PAGE.subC}
        </p>
        <p style={{ fontFamily: LATO, fontSize: "13px", color: BOOK_P78, lineHeight: 1.75, margin: "0 0 10px", fontWeight: 300 }}>
          {CONFIRMED_PAGE.nextReview}
        </p>
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.7, margin: "0 0 8px", fontWeight: 300 }}>
          {CONFIRMED_PAGE.notConfirmedUnless}
        </p>
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.65, margin: "0 0 10px", fontWeight: 300 }}>
          {CONFIRMED_PAGE.nextContact}
        </p>
        <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "12px 14px", marginBottom: "1.25rem", textAlign: "left" }}>
          {VIEW_PENDING_LINES.map((line) => (
            <p key={line} style={{ fontFamily: LATO, fontSize: "12px", color: BOOK_P78, margin: "0 0 8px", lineHeight: 1.65, fontWeight: 300 }}>
              {line}
            </p>
          ))}
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
            {WHATSAPP_SUPPORT_LINE}
          </p>
        </div>

        <p style={{ fontFamily: LATO, fontSize: "12px", color: BOOK_P78, lineHeight: 1.65, margin: "0 0 1rem", textAlign: "left", fontWeight: 300 }}>
          {CONFIRMED_REFUND_REASSURANCE}{" "}
          <a href={REFUND_POLICY_HREF} className="oraya-link-text" style={{ color: GOLD, textDecoration: "underline", textUnderlineOffset: "3px" }}>
            {CONFIRMED_REFUND_POLICY_LINK_LABEL}
          </a>
        </p>

        {whatsappDigits && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}>
            <a
              href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(refDisplay ? bookingWhatsAppPrefill(refDisplay) : WHATSAPP_CANCEL_CHANGE_NO_REF)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: WHITE,
                backgroundColor: "#25D366",
                padding: "15px 36px",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#1ebd59"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#25D366"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp us
            </a>
          </div>
        )}

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {/* Booking details card */}
        <div style={{ border: "0.5px solid var(--oraya-border)", padding: "2rem", marginBottom: "2.5rem", textAlign: "left" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
            Booking summary
          </p>
          {details.map(({ label, value }) => (
            <div
              key={label}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "0.5px solid var(--oraya-book-subtle-line)" }}
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <a
            href="/"
            style={{ display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD_CTA, backgroundColor: GOLD, padding: "15px 36px", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
          >
            Back to home
          </a>
          <a
            href="/book"
            style={{ display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, backgroundColor: "transparent", border: "0.5px solid var(--oraya-book-input-border)", padding: "15px 36px", textDecoration: "none" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--oraya-gold)";
              (e.currentTarget as HTMLElement).style.color = WHITE;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--oraya-book-input-border)";
              (e.currentTarget as HTMLElement).style.color = GOLD;
            }}
          >
            New booking
          </a>
        </div>

        <div style={{ border: "0.5px solid var(--oraya-border)", padding: "1.25rem 1.5rem", marginBottom: "1.75rem", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: "0 0 6px", lineHeight: 1.6 }}>
            {CANCELLATION_PROMPT}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 12px", lineHeight: 1.65 }}>
            {CANCELLATION_HINT}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <a
              href={`mailto:hello@stayoraya.com?subject=${encodeURIComponent(refDisplay ? `Booking ${refDisplay} — change or cancellation` : "Booking change or cancellation")}`}
              style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, textDecoration: "none" }}
            >
              Email
            </a>
            {whatsappDigits && (
              <a
                href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(refDisplay ? bookingWhatsAppChangePrefill(refDisplay) : WHATSAPP_CANCEL_CHANGE_NO_REF)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, textDecoration: "none" }}
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>

        <p style={{ fontFamily: LATO, fontSize: "11px", color: BOOK_P20, marginTop: "2.5rem" }}>
          You&apos;ll receive an email once your request has been reviewed.
        </p>
      </div>
    </PublicTrustShell>
  );
}

export default function BookingConfirmedPage() {
  return (
    <Suspense fallback={null}>
      <BookingConfirmedPageInner />
    </Suspense>
  );
}
