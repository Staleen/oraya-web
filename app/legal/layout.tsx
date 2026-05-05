import LegalEntityNotice from "@/components/LegalEntityNotice";
import LegalTopBar from "@/components/LegalTopBar";
import SiteFooter from "@/components/SiteFooter";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LegalTopBar />

      <main style={{ backgroundColor: "var(--oraya-bg)", minHeight: "70vh", padding: "4rem 2rem", overflowX: "hidden" }}>
        <article
          style={{
            maxWidth: "780px",
            margin: "0 auto",
            backgroundColor: "var(--oraya-surface)",
            padding: "3.5rem 3rem",
            border: "0.5px solid var(--oraya-border)",
          }}
        >
          {children}
          <LegalEntityNotice variant="light" />
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
