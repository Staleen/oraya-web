import { redirect } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";
import { verifyActionToken } from "@/lib/booking-action-token";
import { supabaseAdmin } from "@/lib/supabase-admin";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export default async function BookingActionConfirmPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;
  if (!token) redirect("/booking-action/result?state=invalid");

  // 1. Verify signature + expiry (crypto only — no DB)
  const result = verifyActionToken(token);
  if (!result.ok) redirect(`/booking-action/result?state=${result.reason}`);

  const { booking_id, action, jti } = result;

  // 2. DB-backed token check: row must exist, not yet consumed, payload must match
  //    This is read-only — no writes on GET
  const { data: tokenRow } = await supabaseAdmin
    .from("booking_action_tokens")
    .select("used_at, booking_id, action")
    .eq("jti", jti)
    .single();

  if (!tokenRow)                                                      redirect("/booking-action/result?state=invalid");
  if (tokenRow.used_at)                                               redirect("/booking-action/result?state=already_processed");
  if (tokenRow.booking_id !== booking_id || tokenRow.action !== action) redirect("/booking-action/result?state=invalid");

  // Fetch booking details for display (read-only)
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("villa, check_in, check_out, status, guest_name, member_id")
    .eq("id", booking_id)
    .single();

  if (!booking) redirect("/booking-action/result?state=invalid");
  if (booking.status !== "pending") redirect("/booking-action/result?state=already_processed");

  const isConfirm   = action === "confirmed";
  const eyebrow     = isConfirm ? "Confirm Booking" : "Cancel Booking";
  const heading     = isConfirm ? "Confirm this" : "Cancel this";
  const headingItal = "booking?";
  const body        = isConfirm
    ? "This will confirm the booking and notify the guest. Please review the details below before proceeding."
    : "This will cancel the booking and notify the guest. This action cannot be undone.";
  const btnLabel    = isConfirm ? "Yes, Confirm Booking" : "Yes, Cancel Booking";
  const btnBg       = isConfirm ? GOLD : "transparent";
  const btnColor    = isConfirm ? CHARCOAL : GOLD;
  const btnBorder   = isConfirm ? "none" : `0.5px solid ${GOLD}`;

  const ref = booking_id.slice(0, 8).toUpperCase();

  const details: [string, string][] = [
    ["Villa",      booking.villa],
    ["Check-in",   fmtDate(booking.check_in)],
    ["Check-out",  fmtDate(booking.check_out)],
    ["Action",     isConfirm ? "Confirm" : "Cancel"],
    ["Reference",  ref],
  ];

  return (
    <main
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
               backgroundColor: MIDNIGHT, padding: "80px 24px" }}
    >
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>

        {/* Emblem */}
        <a href="/" style={{ display: "block", width: "60px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD,
                      margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px",
                    textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          {eyebrow}
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.4rem", fontWeight: 400, color: WHITE,
                     margin: "0 0 1rem", lineHeight: 1.2 }}>
          {heading}<br /><em>{headingItal}</em>
        </h1>

        {/* Body */}
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED,
                    lineHeight: 1.8, marginBottom: "2.5rem" }}>
          {body}
        </p>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD,
                      margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {/* Booking summary card */}
        <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", padding: "2rem",
                      marginBottom: "2.5rem", textAlign: "left" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px",
                      textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
            Booking Summary
          </p>
          {details.map(([label, value]) => (
            <div
              key={label}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                       padding: "10px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}
            >
              <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px",
                             textTransform: "uppercase", color: MUTED }}>
                {label}
              </span>
              <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, fontWeight: 300 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Form — POST is the only way to mutate */}
        <form method="POST" action="/api/booking-action">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            style={{ display: "inline-block", fontFamily: LATO, fontSize: "11px",
                     letterSpacing: "2.5px", textTransform: "uppercase",
                     color: btnColor, backgroundColor: btnBg, border: btnBorder,
                     padding: "15px 36px", cursor: "pointer", textDecoration: "none" }}
          >
            {btnLabel}
          </button>
        </form>

        <p style={{ fontFamily: LATO, fontSize: "11px",
                    color: "rgba(255,255,255,0.2)", marginTop: "2.5rem" }}>
          Oraya · Luxury Boutique Villas · Lebanon
        </p>

      </div>
    </main>
  );
}
