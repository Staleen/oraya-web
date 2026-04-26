import Link from "next/link";
import OrayaEmblem from "@/components/OrayaEmblem";
import { AddonIcon } from "@/components/addon-icon";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyViewToken } from "@/lib/booking-action-token";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

export const dynamic = "force-dynamic";

type Addon = {
  id?: string;
  label?: string;
  price?: number | null;
  preparation_time_hours?: number | null;
  requires_approval?: boolean;
  status?: string | null;
  same_day_warning?: "same_day_checkout" | "same_day_checkin" | null;
};

interface BookingRow {
  id:               string;
  villa:            string;
  check_in:         string;
  check_out:        string;
  sleeping_guests:  number | null;
  day_visitors:     number | null;
  event_type:       string | null;
  message:          string | null;
  addons:           Addon[] | null;
  addons_snapshot:  Addon[] | null;
  status:           string;
  guest_name:       string | null;
  member_id:        string | null;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function statusVisual(status: string): { label: string; color: string; bg: string } {
  const s = status.toLowerCase();
  if (s === "confirmed") return { label: "Confirmed", color: "#6fcf8a", bg: "rgba(111,207,138,0.15)" };
  if (s === "cancelled") return { label: "Cancelled", color: "#e07070", bg: "rgba(224,112,112,0.15)" };
  return { label: "Pending", color: GOLD, bg: "rgba(197,164,109,0.15)" };
}

function formatAddonPrice(price: number | null | undefined): string {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

function formatAdvanceNotice(hours: number | null | undefined): string | null {
  if (!hours || hours <= 0) return null;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "day" : "days"} advance notice`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"} advance notice`;
}

function addonStatusLabel(addon: Addon): { text: string; color: string; bg: string } | null {
  if (addon.status === "approved") return { text: "Approved", color: "#6fcf8a", bg: "rgba(111,207,138,0.14)" };
  if (addon.status === "declined") return { text: "Declined", color: "#e07070", bg: "rgba(224,112,112,0.14)" };
  if (addon.status === "pending_approval" || addon.requires_approval) {
    return { text: "Subject to confirmation", color: GOLD, bg: "rgba(197,164,109,0.12)" };
  }
  if (addon.status === "at_risk") return { text: "Needs review", color: GOLD, bg: "rgba(197,164,109,0.12)" };
  return null;
}

function sameDayWarningText(value: Addon["same_day_warning"]): string | null {
  if (value === "same_day_checkout") return "May depend on same-day checkout timing.";
  if (value === "same_day_checkin") return "May depend on same-day check-in timing.";
  return null;
}

async function getWhatsappNumber(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "whatsapp_number")
      .single();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

function ErrorShell({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main
      style={{
        backgroundColor: MIDNIGHT,
        minHeight:       "100vh",
        padding:         "80px 24px",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        <Link href="/" style={{ display: "block", width: "60px", margin: "0 auto 2.5rem" }}>
          <OrayaEmblem />
        </Link>
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          Booking Link
        </p>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.2 }}>
          {title}
        </h1>
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.8, marginBottom: "2.5rem" }}>
          {subtitle}
        </p>
        <Link
          href="/"
          style={{
            display:        "inline-block",
            fontFamily:     LATO,
            fontSize:       "11px",
            letterSpacing:  "2.5px",
            textTransform:  "uppercase",
            color:          CHARCOAL,
            backgroundColor: GOLD,
            padding:        "15px 36px",
            textDecoration: "none",
          }}
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}

export default async function BookingViewPage({ params }: { params: { token: string } }) {
  const verified = verifyViewToken(decodeURIComponent(params.token));

  if (!verified.ok) {
    if (verified.reason === "expired") {
      return (
        <ErrorShell
          title="This link has expired."
          subtitle="For the latest on your booking, please reach out to us directly and we'll help you out."
        />
      );
    }
    return (
      <ErrorShell
        title="This link isn't valid."
        subtitle="The booking link you used could not be verified. Please check the link in your email or contact us if you need help."
      />
    );
  }

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, villa, check_in, check_out, sleeping_guests, day_visitors, event_type, message, addons, addons_snapshot, status, guest_name, member_id")
    .eq("id", verified.booking_id)
    .single<BookingRow>();

  if (error || !booking) {
    return (
      <ErrorShell
        title="We couldn't find this booking."
        subtitle="This booking may have been removed. Please contact us if you believe this is an error."
      />
    );
  }

  const whatsappNumber = await getWhatsappNumber();
  const ref     = booking.id.slice(0, 8).toUpperCase();
  const visual  = statusVisual(booking.status);
  const addons = Array.isArray(booking.addons_snapshot) && booking.addons_snapshot.length > 0
    ? booking.addons_snapshot
    : Array.isArray(booking.addons)
      ? booking.addons
      : [];

  const rows: Array<{ label: string; value: string }> = [
    { label: "Villa",        value: booking.villa },
    { label: "Check-in",     value: fmtDate(booking.check_in) },
    { label: "Check-out",    value: fmtDate(booking.check_out) },
    { label: "Guests staying",  value: String(booking.sleeping_guests ?? "—") },
    { label: "Expected visitors", value: String(booking.day_visitors ?? 0) },
    ...(booking.event_type ? [{ label: "Event type", value: booking.event_type }] : []),
    { label: "Reference",    value: ref },
  ];

  return (
    <main
      style={{
        backgroundColor: MIDNIGHT,
        minHeight:       "100vh",
        padding:         "80px 24px",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        {/* Emblem */}
        <Link href="/" style={{ display: "block", width: "60px", margin: "0 auto 2.5rem" }}>
          <OrayaEmblem />
        </Link>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          Your Booking
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.2rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.25 }}>
          {booking.villa}
        </h1>

        {/* Status pill */}
        <div
          style={{
            display:        "inline-block",
            fontFamily:     LATO,
            fontSize:       "10px",
            letterSpacing:  "1.5px",
            textTransform:  "uppercase",
            color:          visual.color,
            backgroundColor: visual.bg,
            padding:        "6px 14px",
            marginBottom:   "2rem",
          }}
        >
          {visual.label}
        </div>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {/* Details card */}
        <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", padding: "2rem", marginBottom: "2rem", textAlign: "left" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
            Booking summary
          </p>
          {rows.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display:        "flex",
                justifyContent: "space-between",
                alignItems:     "baseline",
                padding:        "10px 0",
                borderBottom:   "0.5px solid rgba(255,255,255,0.05)",
                gap:            "16px",
              }}
            >
              <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0 }}>
                {label}
              </span>
              <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, fontWeight: 300, textAlign: "right" }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Add-ons card */}
        <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", padding: "1.75rem", marginBottom: "2rem", textAlign: "left", backgroundColor: "rgba(255,255,255,0.015)" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Add-ons
          </p>
          {addons.length === 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0, lineHeight: 1.7 }}>
              No add-ons selected.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {addons.map((addon, index) => {
                const status = addonStatusLabel(addon);
                const notice = formatAdvanceNotice(addon.preparation_time_hours);
                const warning = sameDayWarningText(addon.same_day_warning);
                return (
                  <div
                    key={`${addon.id ?? addon.label ?? "addon"}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "14px",
                      padding: "12px 0",
                      borderBottom: index === addons.length - 1 ? "none" : "0.5px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                      <AddonIcon label={addon.label ?? "Add-on"} size={17} color="rgba(197,164,109,0.58)" />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: "0 0 4px", lineHeight: 1.4 }}>
                          {addon.label ?? "Add-on"}
                        </p>
                        <p style={{ fontFamily: LATO, fontSize: "12px", color: GOLD, margin: "0 0 4px", lineHeight: 1.4 }}>
                          {formatAddonPrice(addon.price)}
                        </p>
                        {(notice || warning) && (
                          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                            {[notice, warning].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    {status && (
                      <span
                        style={{
                          fontFamily: LATO,
                          fontSize: "9px",
                          letterSpacing: "1.3px",
                          textTransform: "uppercase",
                          color: status.color,
                          backgroundColor: status.bg,
                          padding: "5px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {status.text}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Message card (if any) */}
        {booking.message && (
          <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", padding: "1.75rem", marginBottom: "2.5rem", textAlign: "left" }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "0.75rem" }}>
              Your note
            </p>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
              {booking.message}
            </p>
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Link
            href="/"
            style={{
              display:        "inline-block",
              fontFamily:     LATO,
              fontSize:       "11px",
              letterSpacing:  "2.5px",
              textTransform:  "uppercase",
              color:          CHARCOAL,
              backgroundColor: GOLD,
              padding:        "15px 36px",
              textDecoration: "none",
            }}
          >
            Back to home
          </Link>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hello Oraya! I have a question about my booking. My reference is ${ref}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "8px",
                fontFamily:     LATO,
                fontSize:       "11px",
                letterSpacing:  "2px",
                textTransform:  "uppercase",
                color:          WHITE,
                backgroundColor: "#25D366",
                padding:        "15px 36px",
                textDecoration: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp us
            </a>
          )}
        </div>

        <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "2.5rem" }}>
          This link is unique to your booking and expires at the end of your stay.
        </p>
      </div>
    </main>
  );
}
