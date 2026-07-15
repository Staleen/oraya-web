/**
 * Small shared building blocks for the House Book pages, mirroring the
 * approved Claude Design print markup (PR #73 design package) one-to-one:
 * `.hy` page blocks, the quiet essentials strip, hairline list rows and
 * checkout checkboxes. Visual classes live in house-book.css (scoped
 * under .oraya-hb).
 */

type PageTone = "white" | "ivory" | "beige-light" | "midnight";

const TONE_CLASS: Record<PageTone, string> = {
  white: "",
  ivory: " oraya-page--ivory",
  "beige-light": " oraya-page--beige-light",
  midnight: " oraya-page--midnight",
};

/** One A4 page of the book (a `.hy` block → one printed page). */
export function HbPage({
  label,
  tone = "white",
  bleed = false,
  style,
  children,
}: {
  label: string;
  tone?: PageTone;
  bleed?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className="hy" data-screen-label={label}>
      <section
        className={`oraya-page${TONE_CLASS[tone]}${bleed ? " oraya-page--bleed" : ""}`}
        style={style}
      >
        {children}
      </section>
    </div>
  );
}

/** The quiet essentials strip pinned to the bottom of content pages. */
export function Strip({ villaName }: { villaName: string }) {
  return (
    <div className="strip">
      <span>{villaName} · The House Book</span>
      <span>
        Wi-Fi <b>ORAYA</b> {" "}·{" "} Checkout <b>11:00 AM</b> {" "}·{" "} Concierge{" "}
        <b>+961 71 140 041</b>
      </span>
    </div>
  );
}

/** Hairline list row (Around / comforts lists). */
export function Row({
  label,
  labelWidth = "26mm",
  bottom = false,
  children,
}: {
  label: React.ReactNode;
  labelWidth?: string;
  bottom?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4mm",
        padding: "2.8mm 0",
        alignItems: "baseline",
        borderTop: "0.5pt solid var(--oraya-gold-28)",
        ...(bottom ? { borderBottom: "0.5pt solid var(--oraya-gold-28)" } : {}),
      }}
    >
      <span className="micro" style={{ flex: "none", width: labelWidth, color: "var(--oraya-charcoal)" }}>
        {label}
      </span>
      <span className="body" style={{ fontSize: "8.5pt" }}>
        {children}
      </span>
    </div>
  );
}

/** Checkout checklist item. */
export function Ck({ children }: { children: React.ReactNode }) {
  return (
    <div className="ck">
      <div className="box" />
      <div>{children}</div>
    </div>
  );
}
