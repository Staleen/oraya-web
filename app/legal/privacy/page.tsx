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

export const metadata = { title: "Privacy Policy — Oraya" };

export default function PrivacyPage() {
  return (
    <>
      <p style={eyebrow}>Privacy Policy</p>
      <h1 style={heading}>How we handle your information</h1>
      <p style={meta}>Last updated: 2026</p>

      <p style={body}>
        Oraya respects your privacy. This page explains what we collect when you book or inquire with us, how we use that information, and how you can reach us with questions.
      </p>

      <h2 style={subheading}>Booking requests and confirmations</h2>
      <p style={body}>
        Submitting a stay or event form on our site creates a <strong>booking request</strong> (pending review). It is not a confirmed reservation until our team has approved dates and operations and, where payment applies, you have completed the steps we send you. Data you enter at the request stage is used only to evaluate and respond to that request.
      </p>
      <p style={body}>
        Once a stay is <strong>confirmed</strong>, we retain the details needed to deliver your reservation, coordinate services, and meet legal and accounting obligations. Event inquiries may proceed as <strong>custom written proposals</strong> before any confirmation; proposal terms are shared with you explicitly in that process.
      </p>

      <h2 style={subheading}>Information we collect</h2>
      <p style={body}>When you submit a booking or event inquiry, we collect:</p>
      <ul style={list}>
        <li>Your name and email address</li>
        <li>Your phone number and country, when provided</li>
        <li>Booking details: villa, dates, guest counts, add-ons, and any notes you share</li>
        <li>Payment references you share with us after we have confirmed your booking and requested payment (Whish reference, bank transfer reference, etc.) — see our{" "}
          <a href="/legal/payment" style={{ color: GOLD, textDecoration: "none" }}>Payment Policy</a> for how manual payment works</li>
      </ul>

      <h2 style={subheading}>How we use it</h2>
      <ul style={list}>
        <li>To review and confirm your booking or event request</li>
        <li>To communicate with you about availability, payment, and your stay</li>
        <li>To prepare your villa and any selected services</li>
        <li>To prepare and follow up on <strong>custom event proposals</strong> when you have requested an event — pricing and scope are agreed in writing, not inferred from the form alone</li>
      </ul>

      <h2 style={subheading}>Guest responsibilities</h2>
      <p style={body}>
        You are responsible for the accuracy of the information you submit and for keeping your contact details up to date so we can reach you. Operational and house rules communicated before or during your stay form part of how you use the property. Full contractual responsibilities are summarized in our{" "}
        <a href="/legal/terms" style={{ color: GOLD, textDecoration: "none" }}>Terms &amp; Conditions</a>.
      </p>

      <h2 style={subheading}>Access &amp; operational automation</h2>
      <p style={body}>
        For <strong>confirmed stays</strong>, we may issue temporary access credentials (for example digital or physical codes) so you can enter the property at the agreed time. Booking details you provide may be used to coordinate arrival, staffing, and property access in line with your reservation.
      </p>
      <ul style={list}>
        <li>We only request information that is proportionate to operating your stay or event</li>
        <li>Operational messages may reach you by email and through messaging channels you have approved or used to contact us</li>
        <li>We do not collect unnecessary sensitive data; if something optional is ever requested, we will explain why</li>
      </ul>

      <h2 style={subheading}>What we don&apos;t do</h2>
      <p style={body}>
        We do not sell, rent, or share your personal information with third parties for marketing. Your details are used by Oraya to deliver your reservation and follow-up communication.
      </p>

      <h2 style={subheading}>Cancellation and refunds</h2>
      <p style={body}>
        Privacy-related deletion or correction requests, and questions about refunds after a confirmed booking, are handled in line with our{" "}
        <a href="/legal/refund" style={{ color: GOLD, textDecoration: "none" }}>Cancellation &amp; Refund Policy</a>.
      </p>

      <h2 style={subheading}>Contact</h2>
      <p style={body}>
        Questions about your data? Reach us at{" "}
        <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>.
      </p>
    </>
  );
}
