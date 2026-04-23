import OrayaEmblem from "@/components/OrayaEmblem";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

interface StateConfig {
  eyebrow: string;
  heading: string;
  headingItalic: string;
  body: string;
}

const STATES: Record<string, StateConfig> = {
  confirmed: {
    eyebrow:       "Booking Confirmed",
    heading:       "The booking has been",
    headingItalic: "confirmed.",
    body:          "The guest will receive a confirmation email. We look forward to welcoming them.",
  },
  cancelled: {
    eyebrow:       "Booking Cancelled",
    heading:       "The booking has been",
    headingItalic: "cancelled.",
    body:          "The guest has been notified by email.",
  },
  expired: {
    eyebrow:       "Link Expired",
    heading:       "This link has",
    headingItalic: "expired.",
    body:          "Action links are valid for 72 hours. Please open the admin dashboard to update this booking manually.",
  },
  already_processed: {
    eyebrow:       "Already Processed",
    heading:       "This booking was",
    headingItalic: "already updated.",
    body:          "The status has already been changed. Check the admin dashboard for the current state.",
  },
  overlap_conflict: {
    eyebrow:       "Conflict Detected",
    heading:       "This booking cannot be",
    headingItalic: "confirmed.",
    body:          "Another confirmed booking overlaps these dates. Please check the admin dashboard to resolve the conflict.",
  },
};

const FALLBACK: StateConfig = {
  eyebrow:       "Invalid Link",
  heading:       "This link is",
  headingItalic: "not valid.",
  body:          "The link may be malformed or already used. Please use the admin dashboard to manage bookings.",
};

export default function BookingActionResultPage({
  searchParams,
}: {
  searchParams: { state?: string; email?: string };
}) {
  const state       = searchParams.state ?? "invalid";
  const emailFailed = searchParams.email === "failed";
  const config      = STATES[state] ?? FALLBACK;

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
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase",
                    color: GOLD, marginBottom: "1.25rem" }}>
          {config.eyebrow}
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.4rem", fontWeight: 400, color: WHITE,
                     margin: "0 0 1rem", lineHeight: 1.2 }}>
          {config.heading}<br />
          <em>{config.headingItalic}</em>
        </h1>

        {/* Body */}
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.8, marginBottom: "2.5rem" }}>
          {config.body}
        </p>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {/* CTA */}
        <a
          href="/admin"
          style={{ display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
                   textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
                   padding: "15px 36px", textDecoration: "none" }}
        >
          Go to Admin
        </a>

        {emailFailed && (
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070",
                      marginTop: "1.5rem", lineHeight: 1.6 }}>
            Booking updated but guest notification failed. Please contact them manually.
          </p>
        )}

        <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "2.5rem" }}>
          Oraya · Luxury Boutique Villas · Lebanon
        </p>

      </div>
    </main>
  );
}
