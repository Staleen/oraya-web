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
const list: React.CSSProperties = { fontFamily: LATO, fontSize: "14px", color: CHARCOAL, lineHeight: 1.9, fontWeight: 300, paddingLeft: "1.25rem", margin: "0 0 1rem" };

export const metadata = { title: "Terms & Conditions — Oraya" };

export default function TermsPage() {
  return (
    <>
      <p style={eyebrow}>Terms &amp; Conditions</p>
      <h1 style={heading}>Booking with Oraya</h1>
      <p style={meta}>Last updated: 2026</p>

      <p style={body}>
        These terms apply to bookings and event inquiries submitted through the Oraya website. They are kept short on purpose — please reach out if anything is unclear.
      </p>

      <h2 style={subheading}>Booking is a request</h2>
      <p style={body}>
        Submitting a stay booking on Oraya creates a <strong>request</strong>, not an instant confirmation or automated checkout. Our team reviews each request against availability and operations, then confirms dates with you. Oraya may accept or decline a request at its discretion. A pending request does not guarantee that dates will be held until you receive confirmation and any requested deposit steps from us.
      </p>

      <h2 style={subheading}>Event inquiries and proposals</h2>
      <p style={body}>
        Event inquiries are reviewed individually. Oraya may respond with a <strong>custom written proposal</strong> (scope, pricing, and timing) rather than a standard villa checkout. An event is only confirmed when you and Oraya have agreed the proposal and any deposit or contract steps communicated by our team are complete.
      </p>

      <h2 style={subheading}>Confirmation and payment</h2>
      <p style={body}>
        A reservation is considered secured only after Oraya confirms availability and the agreed deposit is received. Payments are coordinated <strong>manually</strong> (for example Whish, bank transfer, or cash as described in our{" "}
        <a href="/legal/payment" style={{ color: GOLD, textDecoration: "none" }}>Payment Policy</a>
        {" "}) — there is no third-party payment processor completing the stay on your behalf at checkout. Cancellation and refund principles after confirmation are outlined in our{" "}
        <a href="/legal/refund" style={{ color: GOLD, textDecoration: "none" }}>Cancellation &amp; Refund Policy</a>.
      </p>

      <h2 style={subheading}>Guest responsibilities</h2>
      <ul style={list}>
        <li>Treat the villa and grounds with care; you are responsible for damage caused during your stay.</li>
        <li>Respect the property&apos;s rules, neighbour quiet hours, and operational guidance shared by our team.</li>
        <li>Keep guest counts and event setups within what was agreed at booking.</li>
        <li>Use of the property for events or commercial activity requires explicit Oraya approval.</li>
      </ul>

      <h2 style={subheading}>Changes by Oraya</h2>
      <p style={body}>
        In rare cases, we may need to adjust or rebook a stay due to operational, safety, or force-majeure reasons. Where this happens, we will reach out promptly with options.
      </p>

      <h2 style={subheading}>Contact</h2>
      <p style={body}>
        Questions about these terms? Reach us at{" "}
        <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>.
      </p>
    </>
  );
}
