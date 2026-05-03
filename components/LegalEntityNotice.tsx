import Link from "next/link";

const GOLD = "#C5A46D";

/**
 * 15F.4: Placeholder legal identity.
 * TODO: Replace placeholder legal identity with registered entity details when available
 * (registration / VAT / license / S.A.L. / physical address — do not invent). See PROJECT_STATE Phase 15F.4.
 */
export default function LegalEntityNotice({ variant }: { variant: "dark" | "light" }) {
  const text = variant === "dark" ? "rgba(255,255,255,0.42)" : "#2E2E2E";
  const muted = variant === "dark" ? "rgba(255,255,255,0.32)" : "#8a8070";
  const border = variant === "dark" ? "rgba(255,255,255,0.08)" : "rgba(197,164,109,0.2)";
  return (
    <div
      style={{
        borderTop: `0.5px solid ${border}`,
        paddingTop: "1.25rem",
        paddingBottom: "1.25rem",
        marginTop: variant === "light" ? "2rem" : 0,
      }}
    >
      <p
        style={{
          fontFamily: "'Lato', system-ui, sans-serif",
          fontSize: "12px",
          color: text,
          lineHeight: 1.75,
          margin: 0,
          fontWeight: 300,
          maxWidth: "640px",
        }}
      >
        Oraya is a privately managed hospitality brand for curated boutique villa stays in Lebanon. For legal, booking, and guest inquiries, contact{" "}
        <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>
          hello@stayoraya.com
        </a>
        .
      </p>
      {variant === "light" && (
        <p style={{ fontFamily: "'Lato', system-ui, sans-serif", fontSize: "11px", color: muted, margin: "10px 0 0", lineHeight: 1.65 }}>
          Policies:{" "}
          <Link href="/legal/terms" style={{ color: GOLD, textDecoration: "none" }}>Terms</Link>
          {" · "}
          <Link href="/legal/payment" style={{ color: GOLD, textDecoration: "none" }}>Payment</Link>
          {" · "}
          <Link href="/legal/refund" style={{ color: GOLD, textDecoration: "none" }}>Refund</Link>
          {" · "}
          <Link href="/legal/privacy" style={{ color: GOLD, textDecoration: "none" }}>Privacy</Link>
        </p>
      )}
    </div>
  );
}
