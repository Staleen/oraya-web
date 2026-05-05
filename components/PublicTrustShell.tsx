"use client";

import OrayaEmblem from "@/components/OrayaEmblem";
import PublicThemeToggle from "@/components/PublicThemeToggle";

/**
 * Minimal public chrome for trust-sensitive pages (booking link, auth recovery):
 * fixed nav with emblem + theme toggle, book-flow background token, overflow guard.
 */
export default function PublicTrustShell({
  children,
  mainStyle,
}: {
  children: React.ReactNode;
  mainStyle?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--oraya-book-bg)",
        overflowX: "hidden",
      }}
    >
      <nav
        className="fixed top-0 left-0 right-0 z-[100] flex justify-between items-center gap-2 backdrop-blur-[8px] min-w-0"
        style={{
          padding: "1.1rem clamp(1rem, 4vw, 3rem)",
          backgroundColor: "var(--oraya-nav-bg)",
          borderBottom: "0.5px solid var(--oraya-nav-border)",
        }}
      >
        <a href="/" className="w-11 h-11 shrink-0 block" style={{ cursor: "pointer" }}>
          <OrayaEmblem />
        </a>
        <PublicThemeToggle variant="public" />
      </nav>
      <main
        style={{
          minHeight: "100vh",
          padding: "96px 24px 80px",
          boxSizing: "border-box",
          ...mainStyle,
        }}
      >
        {children}
      </main>
    </div>
  );
}
