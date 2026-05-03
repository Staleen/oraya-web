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

      <h2 style={subheading}>Information we collect</h2>
      <p style={body}>When you submit a booking or event inquiry, we collect:</p>
      <ul style={list}>
        <li>Your name and email address</li>
        <li>Your phone number and country, when provided</li>
        <li>Booking details: villa, dates, guest counts, add-ons, and any notes you share</li>
        <li>Payment references you share with us after admin confirmation (Whish reference, bank transfer reference, etc.)</li>
      </ul>

      <h2 style={subheading}>How we use it</h2>
      <ul style={list}>
        <li>To review and confirm your booking or event request</li>
        <li>To communicate with you about availability, payment, and your stay</li>
        <li>To prepare your villa and any selected services</li>
      </ul>

      <h2 style={subheading}>What we don&apos;t do</h2>
      <p style={body}>
        We do not sell, rent, or share your personal information with third parties for marketing. Your details are used by Oraya to deliver your reservation and follow-up communication.
      </p>

      <h2 style={subheading}>Contact</h2>
      <p style={body}>
        Questions about your data? Reach us at{" "}
        <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>.
      </p>
    </>
  );
}
