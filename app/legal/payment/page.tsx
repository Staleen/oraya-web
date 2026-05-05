const INK      = "var(--oraya-ink)";
const MUTED    = "var(--oraya-text-muted)";
const GOLD     = "var(--oraya-gold)";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const eyebrow: React.CSSProperties = { fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1rem" };
const heading: React.CSSProperties = { fontFamily: PLAYFAIR, fontSize: "32px", color: INK, fontWeight: 400, margin: "0 0 0.5rem", lineHeight: 1.2 };
const subheading: React.CSSProperties = { fontFamily: PLAYFAIR, fontSize: "20px", color: INK, fontWeight: 400, margin: "2.5rem 0 0.75rem" };
const body: React.CSSProperties = { fontFamily: LATO, fontSize: "14px", color: INK, lineHeight: 1.8, margin: "0 0 1rem", fontWeight: 300 };
const meta: React.CSSProperties = { fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 2.5rem", letterSpacing: "0.5px" };
const list: React.CSSProperties = { fontFamily: LATO, fontSize: "14px", color: INK, lineHeight: 1.9, fontWeight: 300, paddingLeft: "1.25rem", margin: "0 0 1rem" };

export const metadata = { title: "Payment Policy — Oraya" };

export default function PaymentPage() {
  return (
    <>
      <p style={eyebrow}>Payment Policy</p>
      <h1 style={heading}>How payment works at Oraya</h1>
      <p style={meta}>Last updated: 2026</p>

      <p style={body}>
        Oraya handles every reservation directly. Our payment process is intentionally simple and reviewed by our team — there are no third-party booking intermediaries involved.
      </p>
      <p style={body}>
        A website submission is a <strong>booking request</strong> until we confirm availability and send you payment instructions. <strong>Confirmed</strong> stays and events are secured only after the agreed deposit (or full payment, if specified) is received using the methods below. For cancellation principles once you are confirmed, see our{" "}
        <a href="/legal/refund" style={{ color: GOLD, textDecoration: "none" }}>Cancellation &amp; Refund Policy</a>; for stay and event rules, see{" "}
        <a href="/legal/terms" style={{ color: GOLD, textDecoration: "none" }}>Terms &amp; Conditions</a>.
      </p>

      <h2 style={subheading}>Accepted methods</h2>
      <ul style={list}>
        <li>Whish</li>
        <li>Bank transfer</li>
        <li>Cash</li>
      </ul>

      <h2 style={subheading}>Process</h2>
      <p style={body}>
        Payment is requested after booking confirmation. When you submit a booking, our team first reviews availability and operational details. Once approved, we send payment instructions for the deposit, including the supported methods above.
      </p>

      <h2 style={subheading}>Security</h2>
      <p style={body}>
        Bookings are not secured until payment is received. Your dates are held in a pending state during the confirmation review, and finalised once your deposit reaches us. We will keep you informed at every step.
      </p>

      <h2 style={subheading}>Reference</h2>
      <p style={body}>
        Guests must include their booking reference when sending payment. The reference appears in your confirmation email and on your booking link, so we can match your payment to your reservation accurately.
      </p>

      <h2 style={subheading}>Contact</h2>
      <p style={body}>
        Questions about payment?{" "}
        <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>
        {" "}— we&apos;re happy to walk you through it.
      </p>
    </>
  );
}
