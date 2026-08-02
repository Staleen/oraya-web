"use client";
/**
 * /ops design system — tokens and primitives, matching the approved prototype.
 *
 * Self-contained rather than importing components/admin/theme.ts: the legacy
 * admin file is pinned to values the old pages depend on, and /ops is built
 * alongside it rather than on top of it.
 */
import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from "react";

export const T = {
  navy: "#1F2B38", navyDeep: "#18222C", navyLift: "#26333F",
  surface: "rgba(255,255,255,.045)", surface2: "rgba(255,255,255,.075)",
  border: "rgba(197,164,109,.16)", borderStrong: "rgba(197,164,109,.32)", borderFaint: "rgba(255,255,255,.07)",
  gold: "#C5A46D", goldHover: "#D4B98A", onGold: "#1F2B38",
  ink: "rgba(255,255,255,.94)", ink2: "rgba(255,255,255,.72)", muted: "rgba(255,255,255,.5)", faint: "rgba(255,255,255,.34)",
  ok: "#6FCF8A", okBg: "rgba(111,207,138,.11)", okBr: "rgba(111,207,138,.32)",
  bad: "#E07070", badTx: "#F2A7A7", badBg: "rgba(224,112,112,.11)", badBr: "rgba(224,112,112,.34)",
  warn: "#E0B070", warnBg: "rgba(224,176,112,.11)", warnBr: "rgba(224,176,112,.32)",
  info: "#7ECFCF", infoBg: "rgba(126,207,207,.11)", infoBr: "rgba(126,207,207,.3)",
  sans: "'Lato',system-ui,sans-serif", serif: "'Playfair Display',Georgia,serif",
  r: "10px", rSm: "6px", rLg: "16px",
} as const;

export const BREAKPOINT = 768;

/** Reactive, SSR-safe. Replaces the seven non-reactive innerWidth reads in /admin. */
export function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width:${BREAKPOINT}px)`);
    const f = () => setM(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

export type Tone = "neutral" | "ok" | "bad" | "warn" | "info" | "gold";

export const TONES: Record<Tone, { fg: string; bg: string; br: string }> = {
  neutral: { fg: T.ink2, bg: T.surface, br: T.borderFaint },
  ok: { fg: T.ok, bg: T.okBg, br: T.okBr },
  bad: { fg: T.badTx, bg: T.badBg, br: T.badBr },
  warn: { fg: T.warn, bg: T.warnBg, br: T.warnBr },
  info: { fg: T.info, bg: T.infoBg, br: T.infoBr },
  gold: { fg: T.gold, bg: "rgba(197,164,109,.12)", br: T.borderStrong },
};

/* ------------------------------------------------------------------ Button */
type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "secondary", small, wide, children, style, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean; wide?: boolean }) {
  const [h, setH] = useState(false);
  const [f, setF] = useState(false);
  const skin: Record<Variant, CSSProperties> = {
    primary: { background: h && !disabled ? T.goldHover : T.gold, color: T.onGold, border: `1px solid ${T.gold}`, fontWeight: 700 },
    secondary: { background: h && !disabled ? T.surface2 : "transparent", color: T.ink, border: `1px solid ${T.borderStrong}` },
    danger: { background: h && !disabled ? T.badBg : "transparent", color: T.badTx, border: `1px solid ${T.badBr}` },
    ghost: { background: "transparent", color: h && !disabled ? T.gold : T.muted, border: "1px solid transparent" },
  };
  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        fontFamily: T.sans, fontSize: small ? "12px" : "13px",
        padding: small ? "7px 13px" : "9px 16px", borderRadius: T.rSm,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
        whiteSpace: "nowrap", transition: "background .18s,border-color .18s,color .18s",
        boxShadow: f ? "0 0 0 3px rgba(197,164,109,.25)" : "none", outline: "none",
        width: wide ? "100%" : undefined, ...skin[variant], ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Badge */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span style={{
      display: "inline-block", fontFamily: T.sans, fontSize: "10px", letterSpacing: "1.4px",
      textTransform: "uppercase", color: t.fg, background: t.bg, border: `1px solid ${t.br}`,
      borderRadius: "999px", padding: "3px 10px", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

/** Guest-facing booking reference, styled so it reads as a code to quote back. */
export function Ref({ id }: { id: string }) {
  return (
    <span style={{
      fontFamily: "ui-monospace,monospace", fontSize: "12px", color: T.gold,
      background: "rgba(197,164,109,.12)", border: `1px solid ${T.border}`,
      borderRadius: T.rSm, padding: "1px 7px", letterSpacing: ".5px",
    }}>{id}</span>
  );
}

/* -------------------------------------------------------------------- Card */
export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.rLg, padding: "22px", ...style }}>
      {title && (
        <h3 style={{ fontSize: "11px", letterSpacing: "2.2px", textTransform: "uppercase", color: T.gold, margin: "0 0 16px", fontWeight: 400 }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{children}</div>;
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "14px", paddingBottom: "12px", borderBottom: `1px solid ${T.borderFaint}` }}>
      <span style={{ color: T.muted, flexShrink: 0 }}>{k}</span>
      <span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Banner */
export function Banner({
  tone = "info", title, children, onRetry, onDismiss,
}: { tone?: Tone; title?: ReactNode; children?: ReactNode; onRetry?: () => void; onDismiss?: () => void }) {
  const t = TONES[tone];
  const loud = tone === "bad" || tone === "warn";
  return (
    <div role={loud ? "alert" : "status"} style={{
      display: "flex", alignItems: "flex-start", gap: "16px", background: t.bg,
      border: `1px solid ${t.br}`, borderRadius: T.r, padding: "14px 16px", marginBottom: "20px",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: "11px", letterSpacing: "1.6px", textTransform: "uppercase", color: t.fg, marginBottom: children ? "4px" : 0 }}>{title}</div>}
        {children && <div style={{ fontSize: "14px", color: T.ink2, lineHeight: 1.55 }}>{children}</div>}
      </div>
      {onRetry && <Button small onClick={onRetry}>Try again</Button>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: 0, color: t.fg, cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 2px" }}>
          &times;
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- QueueItem */
export function QueueRow({
  accent = "gold", title, detail, actions,
}: { accent?: "bad" | "gold" | "info"; title: ReactNode; detail: ReactNode; actions?: ReactNode }) {
  const [h, setH] = useState(false);
  const edge = accent === "bad" ? T.bad : accent === "info" ? T.info : T.gold;
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? T.surface2 : T.surface, border: `1px solid ${T.borderFaint}`,
        borderLeft: `3px solid ${edge}`, borderRadius: T.r, padding: "16px 18px",
        display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", transition: "background .18s",
      }}
    >
      <div style={{ flex: 1, minWidth: "min(100%, 260px)" }}>
        <p style={{ fontSize: "15px", margin: "0 0 3px" }}>{title}</p>
        <p style={{ fontSize: "13px", color: T.muted, margin: 0 }}>{detail}</p>
      </div>
      {actions && <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */
/**
 * `reason` is required so a failed load can never be rendered as "nothing to
 * do" — the single most dangerous bug class in the old admin.
 */
export function EmptyState({ reason, message, onRetry }: { reason: "clear" | "load-failed"; message: string; onRetry?: () => void }) {
  const failed = reason === "load-failed";
  return (
    <div role={failed ? "alert" : undefined} style={{
      textAlign: "center", padding: "44px 24px",
      border: `1px dashed ${failed ? T.badBr : T.borderFaint}`, borderRadius: T.r,
      background: failed ? T.badBg : "transparent",
    }}>
      <p style={{ fontSize: "14px", color: failed ? T.badTx : T.faint, margin: 0 }}>{message}</p>
      {onRetry && <div style={{ marginTop: "16px" }}><Button small onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Field */
export function Field({
  label, error, hint, id, style, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const [f, setF] = useState(false);
  const fid = id ?? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
      <label htmlFor={fid} style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: error ? T.badTx : T.muted }}>
        {label}
      </label>
      <input
        {...rest}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-e` : undefined}
        onFocus={(e) => { setF(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setF(false); rest.onBlur?.(e); }}
        style={{
          width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
          border: `1px solid ${error ? T.bad : f ? T.gold : T.borderStrong}`, borderRadius: T.rSm,
          padding: "12px 13px", fontFamily: T.sans, fontSize: "15px", color: T.ink,
          outline: "none", boxShadow: f ? "0 0 0 3px rgba(197,164,109,.16)" : "none", ...style,
        }}
      />
      {error ? (
        <span id={`${fid}-e`} role="alert" style={{ fontSize: "12px", color: T.badTx }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: "12px", color: T.faint }}>{hint}</span>
      ) : null}
    </div>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h1 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "30px", margin: "0 0 4px" }}>{title}</h1>
      {sub && <p style={{ color: T.muted, fontSize: "14px", margin: "0 0 26px" }}>{sub}</p>}
    </>
  );
}

export function Kicker({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <p style={{ fontSize: "11px", letterSpacing: "2.2px", textTransform: "uppercase", color: T.gold, margin: "0 0 12px", display: "flex", alignItems: "center", gap: "10px" }}>
      {children}
      {count !== undefined && (
        <span style={{ background: T.surface2, color: T.ink2, borderRadius: "999px", padding: "1px 9px", fontSize: "11px", letterSpacing: 0 }}>{count}</span>
      )}
    </p>
  );
}
