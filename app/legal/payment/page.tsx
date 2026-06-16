const INK      = "var(--oraya-ink)";
const MUTED    = "var(--oraya-text-muted)";
const GOLD     = "var(--oraya-gold)";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const eyebrow = { fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase" as const, color: GOLD, margin: "0 0 1rem" };
const heading = { fontFamily: PLAYFAIR, fontSize: "32px", color: INK, fontWeight: 400, margin: "0 0 0.5rem", lineHeight: 1.2 };
const subheading = { fontFamily: PLAYFAIR, fontSize: "20px", color: INK, fontWeight: 400, margin: "2.5rem 0 0.75rem" };
const body = { fontFamily: LATO, fontSize: "14px", color: INK, lineHeight: 1.8, margin: "0 0 1rem", fontWeight: 300 };
const meta = { fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 2.5rem", letterSpacing: "0.5px" };
const list = { fontFamily: LATO, fontSize: "14px", color: INK, lineHeight: 1.9, fontWeight: 300, paddingLeft: "1.25rem", margin: "0 0 1rem" };

export const metadata = { title: "Payment Policy - Oraya" };

export default function PaymentPage() {
  return (
    <>
      <p style={eyebrow}>Payment Policy</p>
      <h1 style={heading}>How payment works at Oraya</h1>
      <p style={meta}>Last updated: 2026</p>

      <p style={body}>
        Oraya handles every reservation directly. Online card payment, when available, is powered by NetCommerce through Credit Libanais / CyberSource Unified Checkout.
      </p>
      <p style={body}>
        A website submission is a <strong>booking request</strong> until we confirm availability and send you payment instructions. <strong>Confirmed</strong> stays and events are secured only after the agreed deposit or full payment is received. Browser payment return pages are informational; Oraya records online payment only after server-side gateway verification. For cancellation principles once you are confirmed, see our{" "}
        <a href="/legal/refund" style={{ color: GOLD, textDecoration: "none" }}>Cancellation &amp; Refund Policy</a>; for stay and event rules, see{" "}
        <a href="/legal/terms" style={{ color: GOLD, textDecoration: "none" }}>Terms &amp; Conditions</a>.
      </p>

      <h2 style={subheading}>Accepted methods</h2>
      <ul style={list}>
        <li>Secure online card payment powered by NetCommerce through Credit Libanais / CyberSource Unified Checkout, when enabled for your booking</li>
        <li>Whish</li>
        <li>Bank transfer</li>
        <li>Cash</li>
      </ul>

      <h2 style={subheading}>Process</h2>
      <p style={body}>
        Payment is requested after booking confirmation or through the secure payment step shown after a booking request is created. When online card payment is offered, card details are entered only inside the bank-controlled payment interface and are not stored by Oraya.
      </p>

      <h2 style={subheading}>Security</h2>
      <p style={body}>
        Bookings are not secured until payment is verified and received. Your dates are held in a pending state during confirmation review and finalised once your deposit reaches us. We will keep you informed at every step.
      </p>

      <h2 style={subheading}>Reference</h2>
      <p style={body}>
        Guests must include their booking reference when sending manual payment. The reference appears in your confirmation email and on your booking link, so we can match your payment to your reservation accurately.
      </p>

      <h2 style={subheading}>Contact</h2>
      <p style={body}>
        Questions about payment?{" "}
        <a href="mailto:admin@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>admin@stayoraya.com</a>
        {" "}or{" "}
        <a href="https://wa.me/96171140041" style={{ color: GOLD, textDecoration: "none" }}>+961 71 140 041</a>.
      </p>
    </>
  );
}
