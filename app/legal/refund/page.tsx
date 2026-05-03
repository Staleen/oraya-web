const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const GOLD     = "#C5A46D";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const eyebrow: React.CSSProperties = { fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1rem" };
const heading: React.CSSProperties = { fontFamily: PLAYFAIR, fontSize: "32px", color: CHARCOAL, fontWeight: 400, margin: "0 0 0.5rem", lineHeight: 1.2 };
const subheading: React.CSSProperties = { fontFamily: PLAYFAIR, fontSize: "20px", color: CHARCOAL, fontWeight: 400, margin: "2.5rem 0 0.75rem" };
const body: React.CSSProperties = { fontFamily: LATO, fontSize: "14px", color: CHARCOAL, lineHeight: 1.8, margin: "0 0 1rem", fontWeight: 300 };
const meta: React.CSSProperties = { fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 2.5rem", letterSpacing: "0.5px" };

export const metadata = { title: "Cancellation & Refund Policy — Oraya" };

export default function RefundPage() {
  return (
    <>
      <p style={eyebrow}>Cancellation &amp; Refund</p>
      <h1 style={heading}>If your plans change</h1>
      <p style={meta}>Last updated: 2026</p>

      <p style={body}>
        We aim to keep cancellations simple and fair. The notes below describe the principles we follow — specific terms for your stay are confirmed by our team at the time of booking.
      </p>

      <h2 style={subheading}>Cancellation window</h2>
      <p style={body}>
        Specific cancellation terms are confirmed at the time of booking. Where a booking has unique conditions — peak season, full-venue events, or extended stays — those will be shared in writing before payment.
      </p>

      <h2 style={subheading}>Deposit handling</h2>
      <p style={body}>
        Deposits are reviewed on a case-by-case basis depending on timing and circumstances. Where dates can be rebooked, we work with you to find a fair outcome. Where preparation has already taken place, the deposit may be retained in part or in full.
      </p>

      <h2 style={subheading}>No-show policy</h2>
      <p style={body}>
        No-shows are treated as cancellations and deposits are not refunded by default. If you anticipate a delay or need to adjust arrival, please reach out as early as possible — we will do our best to accommodate.
      </p>

      <h2 style={subheading}>Oraya discretion</h2>
      <p style={body}>
        Oraya may apply discretion in exceptional situations — including illness, weather, or circumstances beyond your control. Our intent is always to find a reasonable resolution rather than to apply rigid rules.
      </p>

      <h2 style={subheading}>Contact</h2>
      <p style={body}>
        Need to discuss a change?{" "}
        <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>
        {" "}— we read every message.
      </p>
    </>
  );
}
