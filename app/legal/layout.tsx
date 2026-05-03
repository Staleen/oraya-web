import Link from "next/link";
import OrayaEmblem from "@/components/OrayaEmblem";
import SiteFooter from "@/components/SiteFooter";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const BEIGELIGHT = "#F5F1EB";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ backgroundColor: WHITE, padding: "1.5rem 2rem", borderBottom: "0.5px solid rgba(197,164,109,0.2)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
            <div style={{ width: "32px" }}>
              <OrayaEmblem />
            </div>
            <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD }}>
              Oraya
            </span>
          </Link>
          <nav style={{ display: "flex", gap: "24px" }}>
            {[
              { label: "Privacy",  href: "/legal/privacy" },
              { label: "Terms",    href: "/legal/terms" },
              { label: "Refund",   href: "/legal/refund" },
              { label: "Payment",  href: "/legal/payment" },
            ].map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ backgroundColor: BEIGELIGHT, minHeight: "70vh", padding: "4rem 2rem" }}>
        <article style={{ maxWidth: "780px", margin: "0 auto", backgroundColor: WHITE, padding: "3.5rem 3rem", border: "0.5px solid rgba(197,164,109,0.18)" }}>
          {children}
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
